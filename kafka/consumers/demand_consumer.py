"""
Reads demand events from Kafka, computes intensity score per product,
and triggers the pricing engine when intensity crosses a threshold.
Command: python kafka/consumers/demand_consumer.py
"""
import sys, os, json, time
from collections import defaultdict
from datetime import datetime, timedelta
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))

import psycopg2
from kafka import KafkaConsumer
from kafka.errors import NoBrokersAvailable
from config import settings
from ml.pricing_engine import PricingEngine

# Reprice if a product gets more than this many views in 5 minutes
INTENSITY_THRESHOLD = 5
# Only reprice a product at most once every N seconds from view events
REPRICE_COOLDOWN_SEC = 15


def get_db():
    return psycopg2.connect(
        dbname=settings.db_name, user=settings.db_user,
        password=settings.db_password,
        host=settings.db_host, port=settings.db_port,
    )


def create_consumer():
    for attempt in range(5):
        try:
            return KafkaConsumer(
                "demand_events",
                bootstrap_servers=settings.kafka_bootstrap_servers,
                group_id="demand-consumer-group",
                auto_offset_reset="latest",
                enable_auto_commit=True,
                value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            )
        except NoBrokersAvailable:
            print(f"  Attempt {attempt+1}/5: waiting for Kafka...")
            time.sleep(5)
    sys.exit(1)


def get_competitor_ceiling(conn, product_id: int) -> float | None:
    """Returns the minimum competitor price — we won't price above this."""
    cur = conn.cursor()
    cur.execute("""
        SELECT MIN(their_price)
        FROM competitor_prices
        WHERE product_id = %s
          AND scraped_at >= NOW() - INTERVAL '24 hours';
    """, (product_id,))
    row = cur.fetchone()
    cur.close()
    return float(row[0]) if row and row[0] else None


def save_repriced(conn, price_data: dict, trigger: str,
                  view_intensity: float, comp_ceil: float | None):
    """Saves repriced result to pricing and pricing_decisions tables."""
    cur = conn.cursor()
    try:
        # Apply competitor ceiling
        final_price = price_data["recommended_price"]
        if comp_ceil and final_price > comp_ceil * 1.05:
            final_price = round(comp_ceil * 1.05, 2)

        # Get old price
        cur.execute("""
            SELECT recommended_price FROM pricing
            WHERE product_id = %s
            ORDER BY created_at DESC LIMIT 1;
        """, (price_data["product_id"],))
        old_row   = cur.fetchone()
        old_price = float(old_row[0]) if old_row else price_data["base_price"]

        # Skip if price didn't change meaningfully (less than 0.5%)
        if abs(final_price - old_price) / max(old_price, 0.01) < 0.005:
            cur.close()
            return False

        cur.execute("""
            INSERT INTO pricing
                (product_id, warehouse_id, recommended_price, base_price,
                 demand_score, stock_factor, expiry_factor,
                 final_margin, price_reason)
            VALUES (%s,
                (SELECT warehouse_id FROM inventory
                 WHERE product_id=%s LIMIT 1),
                %s,%s,%s,%s,%s,%s,%s);
        """, (
            price_data["product_id"], price_data["product_id"],
            final_price, price_data["base_price"],
            price_data["demand_score"], price_data["stock_factor"],
            price_data["expiry_factor"], price_data["final_margin"],
            price_data["price_reason"],
        ))

        cur.execute("""
            INSERT INTO pricing_decisions
                (product_id, trigger_type, old_price, new_price,
                 demand_score, view_intensity, stock_factor,
                 expiry_factor, competitor_ceil, decision_reason)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s);
        """, (
            price_data["product_id"], trigger,
            old_price, final_price,
            price_data["demand_score"], view_intensity,
            price_data["stock_factor"], price_data["expiry_factor"],
            comp_ceil, price_data["price_reason"],
        ))

        conn.commit()
        cur.close()
        return True, old_price, final_price
    except Exception as e:
        conn.rollback()
        cur.close()
        raise e


def run_demand_consumer():
    print("=" * 60)
    print("  Demand Consumer — view-spike driven repricing")
    print("=" * 60)

    engine   = PricingEngine()
    consumer = create_consumer()
    conn     = get_db()

    # Sliding window: product_id → list of event timestamps
    event_window: dict[int, list] = defaultdict(list)
    # Cooldown tracker: product_id → last reprice timestamp
    last_reprice: dict[int, datetime] = {}
    total_reprices = 0

    print("\nListening for demand events... (Ctrl+C to stop)\n")

    try:
        while True:
            records = consumer.poll(timeout_ms=500)
            now     = datetime.now()

            for _, messages in records.items():
                for msg in messages:
                    event      = msg.value
                    product_id = event.get("product_id")
                    event_type = event.get("event_type", "view")

                    if not product_id:
                        continue

                    # Add to sliding window
                    event_window[product_id].append(now)

                    # Prune events older than 5 minutes
                    cutoff = now - timedelta(minutes=5)
                    event_window[product_id] = [
                        t for t in event_window[product_id] if t > cutoff
                    ]

                    recent_count = len(event_window[product_id])
                    intensity    = min(recent_count / 30.0, 1.0)

                    # Check cooldown
                    last = last_reprice.get(product_id)
                    if last and (now - last).seconds < REPRICE_COOLDOWN_SEC:
                        continue

                    # Only reprice on meaningful intensity spikes
                    if (recent_count >= INTENSITY_THRESHOLD
                            or event_type == "cart_add"):

                        try:
                            # Build a synthetic order event for the engine
                            synthetic_event = {
                                "timestamp":        now.isoformat(),
                                "demand_multiplier": intensity,
                                "items": [
                                    {"product_id": product_id, "quantity": 1}
                                ],
                            }
                            price_data = engine.compute_price(
                                product_id, synthetic_event
                            )
                            if not price_data:
                                continue

                            # Boost demand score by view intensity
                            price_data["demand_score"] = min(
                                price_data["demand_score"] + intensity * 0.3, 1.0
                            )

                            comp_ceil = get_competitor_ceiling(conn, product_id)
                            result    = save_repriced(
                                conn, price_data, "view_spike",
                                intensity, comp_ceil
                            )

                            if result and result is not False:
                                _, old_px, new_px = result
                                last_reprice[product_id] = now
                                total_reprices += 1
                                arrow = "▲" if new_px > old_px else "▼"
                                print(
                                    f"[SPIKE] {price_data['product_name']:<28} "
                                    f"{recent_count:>2} views/5min → "
                                    f"Rs.{old_px:.2f} {arrow} Rs.{new_px:.2f}  "
                                    f"intensity={intensity:.2f}"
                                )

                        except Exception as e:
                            print(f"[ERROR] product_id={product_id}: {e}")
                            try:
                                conn = get_db()
                            except Exception:
                                pass

    except KeyboardInterrupt:
        print(f"\nDemand consumer stopped. Total reprices: {total_reprices}")
    finally:
        consumer.close()
        conn.close()


if __name__ == "__main__":
    run_demand_consumer()