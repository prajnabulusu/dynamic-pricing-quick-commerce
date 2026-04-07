"""
Quick sanity check — sends 3 test messages through Kafka and reads them back.
Run AFTER docker-compose up and create_topics.py.
Command: python kafka/test_kafka.py
"""
import json
import sys
import os
import time

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from kafka import KafkaProducer, KafkaConsumer
from config import settings


def test_kafka_pipeline():
    print("=" * 50)
    print("  Kafka Pipeline Test")
    print("=" * 50)

    # ── Send 3 test messages ──────────────────────────────────
    print("\n[1] Sending 3 test messages to 'orders' topic...")
    try:
        producer = KafkaProducer(
            bootstrap_servers=settings.kafka_bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        )
        for i in range(1, 4):
            msg = {"test": True, "message_number": i, "text": f"Test order {i}"}
            producer.send("orders", value=msg)
            print(f"  Sent: {msg}")
        producer.flush()
        producer.close()
        print("  All messages sent.")
    except Exception as e:
        print(f"  FAILED: {e}")
        print("  Is Kafka running? Try: docker-compose up -d")
        sys.exit(1)

    # ── Read them back ────────────────────────────────────────
    print("\n[2] Reading messages back from 'orders' topic...")
    try:
        consumer = KafkaConsumer(
            "orders",
            bootstrap_servers=settings.kafka_bootstrap_servers,
            group_id="test-group",
            auto_offset_reset="earliest",
            value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            consumer_timeout_ms=5000,   # stop after 5s of no messages
        )
        received = 0
        for msg in consumer:
            if msg.value.get("test"):
                print(f"  Received: {msg.value}")
                received += 1
        consumer.close()
    except Exception as e:
        print(f"  FAILED: {e}")
        sys.exit(1)

    # ── Result ────────────────────────────────────────────────
    print("\n" + "=" * 50)
    if received >= 3:
        print(f"  Kafka is working correctly. ({received} messages received)")
        print("  Ready to run producer and consumer!")
    else:
        print(f"  Only received {received}/3 messages. Check Kafka logs.")
    print("=" * 50)


if __name__ == "__main__":
    test_kafka_pipeline()