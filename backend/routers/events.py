"""
Receives real-time demand events from the frontend (clicks, views, cart actions)
and publishes them to the Kafka 'demand_events' topic.
The demand_consumer picks these up and updates pricing intensity.
"""
import sys, os, json, uuid
from datetime import datetime, timedelta
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from kafka import KafkaProducer
from kafka.errors import NoBrokersAvailable
from backend.models.database import get_db
from ml.pricing_engine import PricingEngine
from config import settings

router = APIRouter(prefix="/events", tags=["Demand Events"])

_producer = None
_pricing_engine = None

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


def get_pricing_engine():
    global _pricing_engine
    if _pricing_engine is None:
        _pricing_engine = PricingEngine()
    return _pricing_engine


def _save_simulator_price(db: Session, price_data: dict, reason_suffix: str, created_at: datetime | None = None):
    old_row = db.execute(text("""
        SELECT recommended_price
        FROM pricing
        WHERE product_id = :pid
        ORDER BY created_at DESC
        LIMIT 1;
    """), {"pid": price_data["product_id"]}).fetchone()
    old_price = float(old_row[0]) if old_row else float(price_data["base_price"])

    warehouse_row = db.execute(text("""
        SELECT warehouse_id
        FROM inventory
        WHERE product_id = :pid
        ORDER BY warehouse_id
        LIMIT 1;
    """), {"pid": price_data["product_id"]}).fetchone()
    warehouse_id = int(warehouse_row[0]) if warehouse_row else None

    new_price = float(price_data["recommended_price"])
    if abs(new_price - old_price) < 0.01:
        new_price = round(old_price * 1.01, 2)

    price_reason = f"{price_data.get('price_reason', 'Demand spike detected')}; {reason_suffix}"

    db.execute(text("""
        INSERT INTO pricing
            (product_id, warehouse_id, recommended_price, base_price,
             demand_score, stock_factor, expiry_factor, final_margin,
             price_reason, created_at)
        VALUES (:pid, :wid, :new_px, :base_px, :demand, :stock, :expiry, :margin, :reason, COALESCE(:created_at, NOW()));
    """), {
        "pid": price_data["product_id"],
        "wid": warehouse_id,
        "new_px": new_price,
        "base_px": float(price_data["base_price"]),
        "demand": float(price_data.get("demand_score", 0.0)),
        "stock": float(price_data.get("stock_factor", 0.0)),
        "expiry": float(price_data.get("expiry_factor", 0.0)),
        "margin": float(price_data.get("final_margin", 0.0)),
        "reason": price_reason,
        "created_at": created_at,
    })

    db.execute(text("""
        INSERT INTO price_history
            (product_id, old_price, new_price, change_reason)
        VALUES (:pid, :old_px, :new_px, :reason);
    """), {
        "pid": price_data["product_id"],
        "old_px": old_price,
        "new_px": new_price,
        "reason": price_reason,
    })

    db.commit()
    return old_price, new_price


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


@router.get("/stats-series/{product_id}")
def get_view_stats_series(
    product_id: int,
    minutes: int = 30,
    bucket_sec: int = 15,
    db: Session = Depends(get_db),
):
    """
    Demand intensity time series for charting.
    Buckets view events and returns normalized intensity (0-1).
    """
    minutes = max(2, min(minutes, 180))
    bucket_sec = max(5, min(bucket_sec, 120))

    rows = db.execute(text("""
        WITH buckets AS (
            SELECT generate_series(
                date_trunc('second', NOW() - make_interval(mins => :mins)),
                date_trunc('second', NOW()),
                make_interval(secs => :bucket_sec)
            ) AS bucket_start
        ),
        events AS (
            SELECT
                to_timestamp(
                    floor(extract(epoch FROM created_at) / :bucket_sec) * :bucket_sec
                ) AS bucket_start,
                COUNT(*) FILTER (WHERE event_type = 'view') AS view_count
            FROM demand_events
            WHERE product_id = :pid
              AND created_at >= NOW() - make_interval(mins => :mins)
            GROUP BY 1
        )
        SELECT
            b.bucket_start,
            COALESCE(e.view_count, 0) AS views
        FROM buckets b
        LEFT JOIN events e ON e.bucket_start = b.bucket_start
        ORDER BY b.bucket_start ASC;
    """), {"pid": product_id, "mins": minutes, "bucket_sec": bucket_sec}).fetchall()

    # Normalize using a practical spike threshold so visual changes are obvious.
    norm_base = 12.0
    return [
        {
            "timestamp": r.bucket_start,
            "views": int(r.views),
            "intensity": round(min(float(r.views) / norm_base, 1.0), 4),
        }
        for r in rows
    ]


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

    for _ in range(count):
        db.execute(text("""
            INSERT INTO demand_events
                (product_id, event_type, session_id, location_id)
            VALUES (:pid, 'view', :sid, 1);
        """), {"pid": product_id, "sid": str(uuid.uuid4())[:16]})
    db.commit()

    simulator_old = None
    simulator_new = None
    repricing_ticks = 0
    try:
        engine = get_pricing_engine()
        ticks = max(6, min(16, count // 2))
        start_ts = datetime.now() - timedelta(seconds=ticks)
        for i in range(ticks):
            phase = i / max(ticks - 1, 1)
            wave = 1.0 + (0.6 * phase if phase <= 0.5 else 0.6 * (1 - phase))
            jitter = ((i % 3) - 1) * 0.04
            multiplier = max(0.5, min(2.5, (1.0 + count / 25.0) * wave + jitter))
            event_ts = start_ts + timedelta(seconds=i)
            synthetic_event = {
                "timestamp": event_ts.isoformat(),
                "demand_multiplier": multiplier,
                "items": [{"product_id": product_id, "quantity": 1 + (i % 2)}],
            }
            price_data = engine.compute_price(product_id, synthetic_event)
            if not price_data:
                continue
            model_demand = float(price_data.get("demand_score", 0.0))
            spike_target = min(0.99, 0.45 + (0.45 * wave) + min(0.12, count / 250.0))
            adjusted_demand = max(0.05, min(0.99, 0.35 * model_demand + 0.65 * spike_target))
            price_data["demand_score"] = adjusted_demand

            # Reflect demand spike into displayed price series for clearer visibility.
            demand_lift = 1.0 + max(0.0, adjusted_demand - model_demand) * 0.45
            price_data["recommended_price"] = round(float(price_data["recommended_price"]) * demand_lift, 2)
            old_px, new_px = _save_simulator_price(
                db,
                price_data,
                f"simulator spike: {count} view events (tick {i+1}/{ticks})",
                created_at=event_ts,
            )
            if simulator_old is None:
                simulator_old = old_px
            simulator_new = new_px
            repricing_ticks += 1
    except Exception:
        db.rollback()

    return {
        "status":     "spike simulated",
        "product_id": product_id,
        "events_sent": count,
        "repricing_ticks": repricing_ticks,
        "old_price": simulator_old,
        "new_price": simulator_new,
        "message":    f"Sent {count} view events and wrote {repricing_ticks} repricing ticks.",
    }
