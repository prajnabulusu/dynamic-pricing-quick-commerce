"""
Run this ONCE after Kafka starts to create the 3 required topics.
Command: python kafka/create_topics.py
"""
import time
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from kafka.admin import KafkaAdminClient, NewTopic
from kafka.errors import TopicAlreadyExistsError
from config import settings

TOPICS = [
    "orders",
    "inventory_updates",
    "pricing_updates",
]


def create_topics():
    print("Connecting to Kafka...")

    # Retry a few times — Kafka takes ~10 seconds to fully start
    for attempt in range(5):
        try:
            admin = KafkaAdminClient(
                bootstrap_servers=settings.kafka_bootstrap_servers,
                client_id="topic-creator",
            )
            break
        except Exception as e:
            print(f"  Attempt {attempt + 1}/5 failed: {e}")
            if attempt < 4:
                print("  Waiting 5 seconds...")
                time.sleep(5)
            else:
                print("Could not connect to Kafka. Make sure Docker is running.")
                print("Run: docker-compose up -d  (from the kafka/ folder)")
                sys.exit(1)

    topic_list = [
        NewTopic(name=t, num_partitions=1, replication_factor=1)
        for t in TOPICS
    ]

    created = []
    skipped = []

    for topic in topic_list:
        try:
            admin.create_topics([topic])
            created.append(topic.name)
        except TopicAlreadyExistsError:
            skipped.append(topic.name)
        except Exception as e:
            print(f"  Error creating topic '{topic.name}': {e}")

    admin.close()

    print("\n--- Topic Status ---")
    for t in created:
        print(f"  Created : {t}")
    for t in skipped:
        print(f"  Exists  : {t}  (skipped)")

    print("\nAll topics ready. Kafka is set up correctly.")


if __name__ == "__main__":
    create_topics()