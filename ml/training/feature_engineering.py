"""
Extracts features from PostgreSQL and saves a training CSV.
Run this before train_model.py.
Command: python ml/training/feature_engineering.py
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))

import pandas as pd
import psycopg2
from config import settings

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "training_data.csv")


def get_connection():
    return psycopg2.connect(
        dbname=settings.db_name, user=settings.db_user,
        password=settings.db_password, host=settings.db_host,
        port=settings.db_port,
    )


def extract_features():
    print("Connecting to PostgreSQL...")
    conn = get_connection()

    # ── Pull raw order items with timestamps ──────────────────────────────────
    print("Extracting order data...")
    query = """
        SELECT
            oi.product_id,
            p.base_price,
            p.shelf_life_days,
            p.is_perishable,
            c.category_name,
            oi.quantity,
            oi.selling_price,
            o.order_timestamp,
            i.stock_quantity,
            i.reorder_level
        FROM order_items oi
        JOIN orders       o  ON oi.order_id    = o.order_id
        JOIN products     p  ON oi.product_id  = p.product_id
        JOIN categories   c  ON p.category_id  = c.category_id
        JOIN inventory    i  ON oi.product_id  = i.product_id
        ORDER BY o.order_timestamp;
    """
    df = pd.read_sql(query, conn)
    conn.close()

    if df.empty:
        print("No order data found. Run the producer first to generate orders.")
        sys.exit(1)

    print(f"  Loaded {len(df):,} order item rows")

    # ── Time-based features ───────────────────────────────────────────────────
    df["order_timestamp"] = pd.to_datetime(df["order_timestamp"])
    df["hour_of_day"]     = df["order_timestamp"].dt.hour
    df["day_of_week"]     = df["order_timestamp"].dt.dayofweek   # 0=Mon, 6=Sun
    df["is_weekend"]      = (df["day_of_week"] >= 5).astype(int)

    # ── Rolling demand features (per product) ─────────────────────────────────
    # Sort so rolling windows work correctly
    df = df.sort_values(["product_id", "order_timestamp"]).reset_index(drop=True)

    # Average quantity sold in the last 5 and 20 orders for that product
    df["avg_qty_last5"]  = (
        df.groupby("product_id")["quantity"]
        .transform(lambda x: x.shift(1).rolling(5,  min_periods=1).mean())
        .fillna(df["quantity"].mean())
    )
    df["avg_qty_last20"] = (
        df.groupby("product_id")["quantity"]
        .transform(lambda x: x.shift(1).rolling(20, min_periods=1).mean())
        .fillna(df["quantity"].mean())
    )

    # ── Stock features ────────────────────────────────────────────────────────
    # Relative stock health: compare stock to 5x reorder baseline.
    # This avoids a near-constant 1.0 feature and gives the model useful variance.
    stock_baseline = (df["reorder_level"].replace(0, 1) * 5.0)
    df["stock_ratio"] = (df["stock_quantity"] / stock_baseline).clip(0, 3)
    df["is_low_stock"] = (
        df["stock_quantity"] <= df["reorder_level"]
    ).astype(int)

    # ── Price features ────────────────────────────────────────────────────────
    df["price_ratio"] = df["selling_price"] / df["base_price"].replace(0, 1)

    # ── Category encoding ─────────────────────────────────────────────────────
    category_map = {
        "Dairy": 0, "Fruits": 1, "Vegetables": 2,
        "Staples": 3, "Snacks": 4, "Beverages": 5,
    }
    df["category_code"] = df["category_name"].map(category_map).fillna(0)

    # ── Target: demand score ──────────────────────────────────────────────────
    # Normalise quantity sold to a 0–1 demand score per product
    df["demand_score"] = (
        df.groupby("product_id")["quantity"]
        .transform(lambda x: (x - x.min()) / (x.max() - x.min() + 1e-9))
    )

    # ── Select final feature columns ──────────────────────────────────────────
    feature_cols = [
        "product_id",
        "hour_of_day",
        "day_of_week",
        "is_weekend",
        "avg_qty_last5",
        "avg_qty_last20",
        "stock_ratio",
        "is_low_stock",
        "price_ratio",
        "shelf_life_days",
        "is_perishable",
        "category_code",
        "demand_score",      # target
    ]
    df_out = df[feature_cols].dropna()

    df_out.to_csv(OUTPUT_PATH, index=False)
    print(f"  Saved {len(df_out):,} rows → {OUTPUT_PATH}")

    # ── Quick stats ───────────────────────────────────────────────────────────
    print("\n  Feature summary:")
    print(f"    Unique products   : {df_out['product_id'].nunique()}")
    print(f"    Demand score mean : {df_out['demand_score'].mean():.3f}")
    print(f"    Demand score std  : {df_out['demand_score'].std():.3f}")
    print(f"    Low stock rows    : {df_out['is_low_stock'].sum():,}")

    return df_out


if __name__ == "__main__":
    extract_features()
    print("\nFeature engineering done. Run train_model.py next.")
