import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from kafka import KafkaProducer
from kafka.errors import NoBrokersAvailable

from backend.models.database import get_db
from backend.schemas.schemas import (
    PlaceOrderRequest, PlaceOrderResponse, OrderItemResponse,
)
from config import settings

router = APIRouter(prefix="/orders", tags=["Orders"])

# Single producer instance shared across requests
_producer = None


def get_producer() -> KafkaProducer:
    global _producer
    if _producer is None:
        try:
            _producer = KafkaProducer(
                bootstrap_servers=settings.kafka_bootstrap_servers,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                key_serializer=lambda k: str(k).encode("utf-8"),
                acks="all",
                retries=3,
            )
        except NoBrokersAvailable:
            raise HTTPException(
                status_code=503,
                detail="Kafka unavailable. Make sure Docker is running.",
            )
    return _producer


@router.post("/", response_model=PlaceOrderResponse)
def place_order(
    request: PlaceOrderRequest,
    db: Session = Depends(get_db),
):
    """
    Places an order.
    - Validates each product exists and has stock
    - Fetches current dynamic price for each item
    - Publishes order event to Kafka (storage + pricing consumers handle the rest)
    """
    enriched_items = []
    total_amount   = 0.0

    for item in request.items:
        # Validate product + get current price
        row = db.execute(text("""
            SELECT
                p.product_id,
                p.name,
                p.base_price,
                COALESCE(
                    (SELECT pr.recommended_price FROM pricing pr
                     WHERE pr.product_id = p.product_id
                     ORDER BY pr.created_at DESC LIMIT 1),
                    p.base_price
                ) AS selling_price,
                COALESCE(i.stock_quantity, 0) AS stock_quantity
            FROM products p
            LEFT JOIN inventory i ON p.product_id = i.product_id
            WHERE p.product_id = :pid
            LIMIT 1;
        """), {"pid": item.product_id}).fetchone()

        if not row:
            raise HTTPException(
                status_code=404,
                detail=f"Product ID {item.product_id} not found",
            )
        if row.stock_quantity < item.quantity:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Insufficient stock for '{row.name}'. "
                    f"Available: {row.stock_quantity}, Requested: {item.quantity}"
                ),
            )

        selling_price = float(row.selling_price)
        subtotal      = round(selling_price * item.quantity, 2)
        total_amount += subtotal

        enriched_items.append({
            "product_id":    row.product_id,
            "product_name":  row.name,
            "quantity":      item.quantity,
            "selling_price": selling_price,
            "subtotal":      subtotal,
        })

    total_amount = round(total_amount, 2)

    # Build the Kafka event (same format the producer uses)
    event = {
        "event_type":        "order_placed",
        "timestamp":         datetime.now().isoformat(),
        "location_id":       request.location_id,
        "total_amount":      total_amount,
        "demand_multiplier": 1.0,
        "items": [
            {
                "product_id":    i["product_id"],
                "product_name":  i["product_name"],
                "quantity":      i["quantity"],
                "selling_price": i["selling_price"],
                "category":      "",
            }
            for i in enriched_items
        ],
    }

    # Publish to Kafka
    try:
        producer = get_producer()
        key      = enriched_items[0]["product_id"]
        future   = producer.send("orders", key=key, value=event)
        future.get(timeout=5)
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Failed to publish order to Kafka: {str(e)}",
        )

    return PlaceOrderResponse(
        success=True,
        message="Order placed successfully. Prices updating in real time.",
        order_id=None,   # assigned by storage consumer asynchronously
        total_amount=total_amount,
        items=[
            OrderItemResponse(**{k: v for k, v in i.items()})
            for i in enriched_items
        ],
    )


@router.get("/recent", tags=["Orders"])
def get_recent_orders(limit: int = 10, db: Session = Depends(get_db)):
    """Returns the most recent orders — used by the admin dashboard."""
    rows = db.execute(text("""
        SELECT
            o.order_id,
            o.order_timestamp,
            o.total_amount,
            l.city,
            COUNT(oi.order_item_id) AS item_count
        FROM orders o
        LEFT JOIN locations l  ON o.location_id  = l.location_id
        LEFT JOIN order_items oi ON o.order_id   = oi.order_id
        GROUP BY o.order_id, o.order_timestamp, o.total_amount, l.city
        ORDER BY o.order_timestamp DESC
        LIMIT :lim;
    """), {"lim": limit}).fetchall()

    return [
        {
            "order_id":        r.order_id,
            "timestamp":       r.order_timestamp,
            "total_amount":    float(r.total_amount or 0),
            "city":            r.city,
            "item_count":      r.item_count,
        }
        for r in rows
    ]