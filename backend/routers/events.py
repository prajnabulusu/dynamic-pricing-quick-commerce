"""
Receives real-time demand events from the frontend (clicks, views, cart actions)
and publishes them to the Kafka 'demand_events' topic.
The demand_consumer picks these up and updates pricing intensity.
"""
import sys, os, json, uuid
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from kafka import KafkaProducer
from kafka.errors import NoBrokersAvailable
from backend.models.database import get_db
from config import settings

router = APIRouter(prefix="/events", tags=["Demand Events"])

_producer = None

def get_producer():
    global _producer
    if _producer is None:
        try:
            _producer = KafkaProducer(
                bootstrap_servers=settings.kafka_bootstrap_servers,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                key_serializer=lambda k: str(k).encode("utf-8"),
                acks=1,
                retries=2,
            )
        except NoBrokersAvailable:
            raise HTTPException(status_code=503, detail="Kafka unavailable")
    return _producer


class DemandEventRequest(BaseModel):
    product_id:  int
    event_type:  str   # view | cart_add | cart_abandon | purchase | wishlist
    session_id:  Optional[str] = None
    location_id: Optional[int] = 1


class ViewStatsResponse(BaseModel):
    product_id:       int
    views_last_5min:  int
    views_last_1hr:   int
    cart_adds_1hr:    int
    intensity_score:  float
    viewing_now_label: str   # "12 people viewing" — shown on frontend


@router.post("/")
def record_event(req: DemandEventRequest, db: Session = Depends(get_db)):
    """
    Called by the frontend on every product click, cart add, or abandon.
    Publishes to Kafka. The demand_consumer updates view stats and
    triggers repricing if intensity crosses a threshold.
    """
    session_id = req.session_id or str(uuid.uuid4())[:16]

    event = {
        "product_id":  req.product_id,
        "event_type":  req.event_type,
        "session_id":  session_id,
        "location_id": req.location_id or 1,
    }

    try:
        producer = get_producer()
        producer.send("demand_events", key=req.product_id, value=event)
        # non-blocking — fire and forget for low latency
    except Exception:
        # Don't fail the request if Kafka is briefly unavailable
        pass

    # Also write directly to DB for immediate stats update
    try:
        db.execute(text("""
            INSERT INTO demand_events
                (product_id, event_type, session_id, location_id)
            VALUES (:pid, :etype, :sid, :lid);
        """), {
            "pid":   req.product_id,
            "etype": req.event_type,
            "sid":   session_id,
            "lid":   req.location_id or 1,
        })
        db.commit()
    except Exception:
        db.rollback()

    return {"status": "recorded", "session_id": session_id}


@router.post("/batch")
def record_batch_events(events: list[DemandEventRequest],
                        db: Session = Depends(get_db)):
    """
    Records multiple events at once — used by the demand spike simulator.
    Sends up to 50 events for one product to simulate a viral surge.
    """
    if len(events) > 50:
        raise HTTPException(status_code=400,
                            detail="Max 50 events per batch")
    try:
        producer = get_producer()
        for req in events:
            event = {
                "product_id":  req.product_id,
                "event_type":  req.event_type,
                "session_id":  str(uuid.uuid4())[:16],
                "location_id": req.location_id or 1,
            }
            producer.send("demand_events", key=req.product_id, value=event)
        producer.flush()
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    return {"status": "recorded", "count": len(events)}


@router.get("/stats/{product_id}", response_model=ViewStatsResponse)
def get_view_stats(product_id: int, db: Session = Depends(get_db)):
    """
    Returns live view stats for a product — polled by each product card
    every 5 seconds to show 'X people viewing now'.
    """
    # Recompute from demand_events for accuracy
    row = db.execute(text("""
        SELECT
            COUNT(*) FILTER (
                WHERE created_at >= NOW() - INTERVAL '5 minutes'
                AND   event_type = 'view'
            )                                        AS views_5min,
            COUNT(*) FILTER (
                WHERE created_at >= NOW() - INTERVAL '1 hour'
                AND   event_type = 'view'
            )                                        AS views_1hr,
            COUNT(*) FILTER (
                WHERE created_at >= NOW() - INTERVAL '1 hour'
                AND   event_type = 'cart_add'
            )                                        AS cart_adds_1hr
        FROM demand_events
        WHERE product_id = :pid;
    """), {"pid": product_id}).fetchone()

    views_5min   = row.views_5min   or 0
    views_1hr    = row.views_1hr    or 0
    cart_adds    = row.cart_adds_1hr or 0

    # Intensity: 0–1 scale based on recent views
    intensity = min(views_5min / 30.0, 1.0)

    # Update the stats cache table
    try:
        db.execute(text("""
            INSERT INTO product_view_stats
                (product_id, views_last_5min, views_last_1hr,
                 cart_adds_1hr, intensity_score, last_updated)
            VALUES (:pid, :v5, :v1hr, :ca, :intensity, NOW())
            ON CONFLICT (product_id) DO UPDATE SET
                views_last_5min = EXCLUDED.views_last_5min,
                views_last_1hr  = EXCLUDED.views_last_1hr,
                cart_adds_1hr   = EXCLUDED.cart_adds_1hr,
                intensity_score = EXCLUDED.intensity_score,
                last_updated    = NOW();
        """), {
            "pid": product_id, "v5": views_5min,
            "v1hr": views_1hr, "ca": cart_adds,
            "intensity": round(intensity, 4),
        })
        db.commit()
    except Exception:
        db.rollback()

    # Human-readable label for frontend
    if views_5min == 0:
        label = ""
    elif views_5min == 1:
        label = "1 person viewing"
    elif views_5min < 5:
        label = f"{views_5min} people viewing"
    elif views_5min < 15:
        label = f"{views_5min} people viewing — demand rising"
    else:
        label = f"{views_5min}+ people viewing — high demand!"

    return ViewStatsResponse(
        product_id=product_id,
        views_last_5min=views_5min,
        views_last_1hr=views_1hr,
        cart_adds_1hr=cart_adds,
        intensity_score=round(intensity, 4),
        viewing_now_label=label,
    )


@router.get("/spike-simulator/{product_id}")
def simulate_demand_spike(
    product_id: int,
    count: int = 30,
    db: Session = Depends(get_db),
):
    """
    Admin tool: floods the system with `count` view events for one product.
    Use this on demo day to show prices jumping in real time.
    Max 50 events.
    """
    count = min(count, 50)
    try:
        producer = get_producer()
        for _ in range(count):
            producer.send("demand_events", key=product_id, value={
                "product_id":  product_id,
                "event_type":  "view",
                "session_id":  str(uuid.uuid4())[:16],
                "location_id": 1,
            })
        producer.flush()
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    return {
        "status":     "spike simulated",
        "product_id": product_id,
        "events_sent": count,
        "message":    f"Sent {count} view events. Watch the price update!",
    }