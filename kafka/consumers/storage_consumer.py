"""
Reads orders from Kafka and saves them to PostgreSQL (orders + order_items tables).
Run this in a separate terminal from the producer.
Command: python kafka/consumers/storage_consumer.py
"""
import json
import sys
import os
import time

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))

import psycopg2
from psycopg2.extras import execute_values
from kafka import KafkaConsumer
from kafka.errors import NoBrokersAvailable
from config import settings


def get_db_connection():
    """Create a fresh PostgreSQL connection."""
    return psycopg2.connect(
        dbname=settings.db_name,
        user=settings.db_user,
        password=settings.db_password,
        host=settings.db_host,
        port=settings.db_port,
    )


def create_consumer():
    """Create Kafka consumer with retry logic."""
    for attempt in range(5):
        try:
            consumer = KafkaConsumer(
                "orders",
                bootstrap_servers=settings.kafka_bootstrap_servers,
                group_id="storage-consumer-group",
                auto_offset_reset="earliest",   # process from beginning if new
                enable_auto_commit=True,
                value_deserializer=lambda m: json.loads(m.decode("utf-8")),
                consumer_timeout_ms=1000,        # unblock poll every 1s
            )
            print("Storage consumer connected to Kafka.")
            return consumer
        except NoBrokersAvailable:
            print(f"  Attempt {attempt + 1}/5: Kafka not ready, waiting 5s...")
            time.sleep(5)
    print("Could not connect to Kafka. Is Docker running?")
    sys.exit(1)


def save_order(conn, event):
    """
    Saves one order event to the database.
    Inserts into orders table first, then all items into order_items.
    Uses a transaction so either everything saves or nothing does.
    """
    cursor = conn.cursor()
    try:
        # 1. Insert the order header
        cursor.execute(
            """
            INSERT INTO orders (order_timestamp, total_amount, location_id)
            VALUES (%s, %s, %s)
            RETURNING order_id;
            """,
            (
                event["timestamp"],
                event["total_amount"],
                event["location_id"],
            ),
        )
        order_id = cursor.fetchone()[0]

        # 2. Insert all order items
        items_data = [
            (
                order_id,
                item["product_id"],
                item["quantity"],
                item["selling_price"],
            )
            for item in event["items"]
        ]
        execute_values(
            cursor,
            """
            INSERT INTO order_items (order_id, product_id, quantity, selling_price)
            VALUES %s;
            """,
            items_data,
        )

        # 3. Update inventory — reduce stock for each item sold
        for item in event["items"]:
            cursor.execute(
                """
                UPDATE inventory
                SET stock_quantity = GREATEST(stock_quantity - %s, 0),
                    last_updated = NOW()
                WHERE product_id = %s;
                """,
                (item["quantity"], item["product_id"]),
            )

        conn.commit()
        return order_id

    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cursor.close()


def run_consumer():
    print("=" * 55)
    print("  Storage Consumer — saving orders to PostgreSQL")
    print("=" * 55)
    print("Waiting for orders... (Press Ctrl+C to stop)\n")

    consumer = create_consumer()
    conn = get_db_connection()

    total_saved = 0
    total_items = 0

    try:
        while True:
            # Poll Kafka for new messages
            records = consumer.poll(timeout_ms=1000)

            if not records:
                continue   # no messages right now, keep waiting

            for topic_partition, messages in records.items():
                for message in messages:
                    event = message.value

                    try:
                        order_id = save_order(conn, event)
                        total_saved += 1
                        num_items = len(event["items"])
                        total_items += num_items

                        items_str = ", ".join(
                            f"{i['product_name']} x{i['quantity']}"
                            for i in event["items"]
                        )
                        print(
                            f"[SAVED] order_id={order_id:05d} | "
                            f"Rs.{event['total_amount']:>7.2f} | "
                            f"{items_str}"
                        )

                    except Exception as e:
                        print(f"[ERROR] Failed to save order: {e}")
                        # Reconnect DB if connection dropped
                        try:
                            conn = get_db_connection()
                        except Exception:
                            pass

    except KeyboardInterrupt:
        print(f"\nConsumer stopped.")
        print(f"Total orders saved : {total_saved}")
        print(f"Total items saved  : {total_items}")
    finally:
        consumer.close()
        conn.close()


if __name__ == "__main__":
    run_consumer()