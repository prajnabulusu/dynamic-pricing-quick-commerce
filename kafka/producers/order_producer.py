"""
Simulates real-time orders and publishes them to the Kafka 'orders' topic.
Keep this running in one terminal while consumers run in other terminals.
Command: python kafka/producers/order_producer.py
"""
import json
import random
import time
import sys
import os
from datetime import datetime

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))

import psycopg2
from kafka import KafkaProducer
from kafka.errors import NoBrokersAvailable
from config import settings

# ── Indian demand patterns by hour ────────────────────────────────────────────
# Maps hour of day → order frequency multiplier
# Morning (7-9am) and evening (6-8pm) are peak hours
DEMAND_BY_HOUR = {
    0: 0.1, 1: 0.1, 2: 0.1, 3: 0.1, 4: 0.1, 5: 0.2,
    6: 0.5, 7: 1.5, 8: 2.0, 9: 1.2, 10: 0.8, 11: 0.9,
    12: 1.1, 13: 0.8, 14: 0.6, 15: 0.7, 16: 0.9, 17: 1.3,
    18: 2.0, 19: 1.8, 20: 1.4, 21: 1.0, 22: 0.6, 23: 0.3,
}

# ── Category-based purchase quantities ────────────────────────────────────────
QUANTITY_BY_CATEGORY = {
    "Dairy":      (1, 3),
    "Fruits":     (1, 4),
    "Vegetables": (1, 5),
    "Staples":    (1, 2),
    "Snacks":     (1, 4),
    "Beverages":  (1, 3),
}


def fetch_products_from_db():
    """Load all products + categories from PostgreSQL once at startup."""
    conn = psycopg2.connect(
        dbname=settings.db_name,
        user=settings.db_user,
        password=settings.db_password,
        host=settings.db_host,
        port=settings.db_port,
    )
    cursor = conn.cursor()
    cursor.execute("""
        SELECT p.product_id, p.name, p.base_price, c.category_name
        FROM products p
        JOIN categories c ON p.category_id = c.category_id;
    """)
    products = cursor.fetchall()
    conn.close()

    return [
        {
            "product_id": row[0],
            "name": row[1],
            "base_price": float(row[2]),
            "category": row[3],
        }
        for row in products
    ]


def fetch_locations_from_db():
    """Load all locations from PostgreSQL."""
    conn = psycopg2.connect(
        dbname=settings.db_name,
        user=settings.db_user,
        password=settings.db_password,
        host=settings.db_host,
        port=settings.db_port,
    )
    cursor = conn.cursor()
    cursor.execute("SELECT location_id FROM locations;")
    rows = cursor.fetchall()
    conn.close()
    return [row[0] for row in rows]


def create_producer():
    """Create Kafka producer with retry logic."""
    for attempt in range(5):
        try:
            producer = KafkaProducer(
                bootstrap_servers=settings.kafka_bootstrap_servers,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                key_serializer=lambda k: str(k).encode("utf-8"),
                acks="all",           # wait for broker confirmation
                retries=3,
            )
            print("Connected to Kafka broker.")
            return producer
        except NoBrokersAvailable:
            print(f"  Attempt {attempt + 1}/5: Kafka not ready, waiting 5s...")
            time.sleep(5)
    print("Could not connect to Kafka. Is Docker running?")
    sys.exit(1)


def generate_order(products, locations):
    """Build a realistic Indian order event."""
    hour = datetime.now().hour
    multiplier = DEMAND_BY_HOUR.get(hour, 1.0)

    # Pick 1–3 products per order (weighted toward fewer items)
    num_items = random.choices([1, 2, 3], weights=[0.6, 0.3, 0.1])[0]
    selected = random.sample(products, min(num_items, len(products)))

    items = []
    for product in selected:
        category = product["category"]
        min_qty, max_qty = QUANTITY_BY_CATEGORY.get(category, (1, 3))
        quantity = random.randint(min_qty, max_qty)

        # Small price variation (+/- 5%) to simulate real selling prices
        price_variation = random.uniform(-0.05, 0.05)
        selling_price = round(product["base_price"] * (1 + price_variation), 2)

        items.append({
            "product_id": product["product_id"],
            "product_name": product["name"],
            "quantity": quantity,
            "selling_price": selling_price,
            "category": category,
        })

    total = round(sum(i["quantity"] * i["selling_price"] for i in items), 2)

    return {
        "event_type": "order_placed",
        "timestamp": datetime.now().isoformat(),
        "location_id": random.choice(locations),
        "total_amount": total,
        "demand_multiplier": multiplier,   # useful for ML later
        "items": items,
    }


def run_producer(orders_per_minute=10):
    """
    Main loop — publishes orders at the given rate.
    Default: 10 orders/min = 1 order every 6 seconds.
    Adjust orders_per_minute to simulate different load levels.
    """
    print("Loading products and locations from database...")
    products = fetch_products_from_db()
    locations = fetch_locations_from_db()
    print(f"  Loaded {len(products)} products, {len(locations)} locations.")

    producer = create_producer()
    delay = 60.0 / orders_per_minute

    print(f"\nProducer started — sending {orders_per_minute} orders/min")
    print("Press Ctrl+C to stop.\n")

    total_sent = 0
    try:
        while True:
            order = generate_order(products, locations)

            # Use first product_id as the Kafka message key
            # (ensures all events for the same product go to same partition)
            key = order["items"][0]["product_id"]

            future = producer.send("orders", key=key, value=order)
            future.get(timeout=10)   # block until broker confirms

            total_sent += 1
            items_str = ", ".join(
                f"{i['product_name']} x{i['quantity']}"
                for i in order["items"]
            )
            print(
                f"[{total_sent:04d}] {order['timestamp'][11:19]}  "
                f"Rs.{order['total_amount']:>7.2f}  |  {items_str}"
            )

            time.sleep(delay)

    except KeyboardInterrupt:
        print(f"\nProducer stopped. Total orders sent: {total_sent}")
    finally:
        producer.flush()
        producer.close()


if __name__ == "__main__":
    run_producer(orders_per_minute=10)