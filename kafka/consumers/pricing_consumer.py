"""
Reads orders from Kafka, runs the pricing engine for every product
in that order, and writes results to the pricing + price_history tables.
Command: python kafka/consumers/pricing_consumer.py
"""
import sys
import os
import json
import time
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))

import psycopg2
from kafka import KafkaConsumer
from kafka.errors import NoBrokersAvailable
from config import settings
from ml.pricing_engine import PricingEngine


def get_db_connection():
    return psycopg2.connect(
        dbname=settings.db_name, user=settings.db_user,
        password=settings.db_password,
        host=settings.db_host, port=settings.db_port,
    )


def create_consumer():
    for attempt in range(5):
        try:
            return KafkaConsumer(
                "orders",
                bootstrap_servers=settings.kafka_bootstrap_servers,
                group_id="pricing-consumer-group",   # separate group from storage
                auto_offset_reset="latest",           # only process NEW orders
                enable_auto_commit=True,
                value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            )
        except NoBrokersAvailable:
            print(f"  Attempt {attempt + 1}/5: Kafka not ready, waiting 5s...")
            time.sleep(5)
    print("Could not connect to Kafka.")
    sys.exit(1)


def get_warehouse_for_product(conn, product_id: int) -> int | None:
    cur = conn.cursor()
    cur.execute(
        "SELECT warehouse_id FROM inventory WHERE product_id = %s LIMIT 1;",
        (product_id,)
    )
    row = cur.fetchone()
    cur.close()
    return row[0] if row else None


def save_price(conn, price_data: dict, warehouse_id: int):
    """Upsert into pricing table and append a row to price_history."""
    cur = conn.cursor()

    # Get the current price for this product (for price_history)
    cur.execute(
        "SELECT recommended_price FROM pricing WHERE product_id = %s "
        "ORDER BY created_at DESC LIMIT 1;",
        (price_data["product_id"],)
    )
    existing = cur.fetchone()
    old_price = float(existing[0]) if existing else price_data["base_price"]

    # Insert into pricing table
    cur.execute("""
        INSERT INTO pricing
            (product_id, warehouse_id, recommended_price, base_price,
             demand_score, stock_factor, expiry_factor, final_margin,
             price_reason)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
    """, (
        price_data["product_id"],
        warehouse_id,
        price_data["recommended_price"],
        price_data["base_price"],
        price_data["demand_score"],
        price_data["stock_factor"],
        price_data["expiry_factor"],
        price_data["final_margin"],
        price_data["price_reason"],
    ))

    # Insert into price_history
    cur.execute("""
        INSERT INTO price_history
            (product_id, old_price, new_price, change_reason)
        VALUES (%s, %s, %s, %s);
    """, (
        price_data["product_id"],
        old_price,
        price_data["recommended_price"],
        price_data["price_reason"],
    ))

    conn.commit()
    cur.close()


def format_change(old: float, new: float) -> str:
    pct = ((new - old) / old) * 100 if old else 0
    arrow = "▲" if new > old else ("▼" if new < old else "─")
    return f"{arrow} {abs(pct):.1f}%"


def run_pricing_consumer():
    print("=" * 60)
    print("  Pricing Consumer — real-time ML pricing engine")
    print("=" * 60)

    engine   = PricingEngine()
    consumer = create_consumer()
    conn     = get_db_connection()

    total_prices = 0
    print("\nListening for orders... (Press Ctrl+C to stop)\n")

    try:
        while True:
            records = consumer.poll(timeout_ms=1000)
            if not records:
                continue

            for _, messages in records.items():
                for message in messages:
                    event = message.value

                    # Skip test messages
                    if event.get("test"):
                        continue

                    items = event.get("items", [])
                    # Deduplicate — one pricing update per product per order
                    seen_products = set()

                    for item in items:
                        pid = item["product_id"]
                        if pid in seen_products:
                            continue
                        seen_products.add(pid)

                        try:
                            price_data = engine.compute_price(pid, event)
                            if not price_data:
                                continue

                            warehouse_id = get_warehouse_for_product(conn, pid)
                            if not warehouse_id:
                                continue

                            # Get old price for display
                            cur = conn.cursor()
                            cur.execute(
                                "SELECT recommended_price FROM pricing "
                                "WHERE product_id = %s "
                                "ORDER BY created_at DESC LIMIT 1;",
                                (pid,)
                            )
                            old_row   = cur.fetchone()
                            old_price = float(old_row[0]) if old_row else price_data["base_price"]
                            cur.close()

                            save_price(conn, price_data, warehouse_id)
                            total_prices += 1

                            change = format_change(old_price, price_data["recommended_price"])
                            print(
                                f"[PRICE] {price_data['product_name']:<28} "
                                f"Rs.{old_price:>6.2f} → Rs.{price_data['recommended_price']:>6.2f}  "
                                f"{change:<10}  "
                                f"demand={price_data['demand_score']:.2f}  "
                                f"| {price_data['price_reason']}"
                            )

                        except Exception as e:
                            print(f"[ERROR] product_id={pid}: {e}")
                            try:
                                conn = get_db_connection()
                            except Exception:
                                pass

    except KeyboardInterrupt:
        print(f"\nPricing consumer stopped. Total prices updated: {total_prices}")
    finally:
        consumer.close()
        conn.close()


if __name__ == "__main__":
    run_pricing_consumer()