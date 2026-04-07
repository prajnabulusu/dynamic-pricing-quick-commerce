"""
Trains an XGBoost model to predict demand score, then saves it.
Command: python ml/training/train_model.py
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))

import pandas as pd
import numpy as np
import joblib
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.preprocessing import StandardScaler

DATA_PATH  = os.path.join(os.path.dirname(__file__), "..", "training_data.csv")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "demand_model.pkl")
SCALER_PATH= os.path.join(os.path.dirname(__file__), "..", "models", "scaler.pkl")

FEATURE_COLS = [
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
]
TARGET_COL = "demand_score"


def train():
    print("=" * 50)
    print("  XGBoost Demand Model Training")
    print("=" * 50)

    # ── Load data ─────────────────────────────────────────────────────────────
    if not os.path.exists(DATA_PATH):
        print(f"Training data not found at {DATA_PATH}")
        print("Run feature_engineering.py first.")
        sys.exit(1)

    df = pd.read_csv(DATA_PATH)
    print(f"\n[1] Loaded {len(df):,} rows, {df['product_id'].nunique()} products")

    X = df[FEATURE_COLS]
    y = df[TARGET_COL]

    # ── Train/test split ──────────────────────────────────────────────────────
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    print(f"[2] Train: {len(X_train):,} rows | Test: {len(X_test):,} rows")

    # ── Scale features ────────────────────────────────────────────────────────
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled  = scaler.transform(X_test)

    # ── Train XGBoost ─────────────────────────────────────────────────────────
    print("[3] Training XGBoost...")
    model = XGBRegressor(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1,           # use all CPU cores
        verbosity=0,
    )
    model.fit(
        X_train_scaled, y_train,
        eval_set=[(X_test_scaled, y_test)],
        verbose=False,
    )

    # ── Evaluate ──────────────────────────────────────────────────────────────
    y_pred = model.predict(X_test_scaled)
    y_pred = np.clip(y_pred, 0, 1)   # demand score is always 0–1

    mae = mean_absolute_error(y_test, y_pred)
    r2  = r2_score(y_test, y_pred)

    print(f"\n[4] Model performance on test set:")
    print(f"    MAE (mean absolute error) : {mae:.4f}")
    print(f"    R²  (variance explained)  : {r2:.4f}")

    # ── Feature importance ────────────────────────────────────────────────────
    print("\n[5] Top features by importance:")
    importances = sorted(
        zip(FEATURE_COLS, model.feature_importances_),
        key=lambda x: x[1], reverse=True,
    )
    for feat, imp in importances[:6]:
        bar = "█" * int(imp * 40)
        print(f"    {feat:<22} {bar} {imp:.3f}")

    # ── Save model + scaler ───────────────────────────────────────────────────
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump(model,  MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    print(f"\n[6] Model saved  → {MODEL_PATH}")
    print(f"    Scaler saved → {SCALER_PATH}")

    print("\n" + "=" * 50)
    print("  Training complete. Run pricing_consumer.py next.")
    print("=" * 50)


if __name__ == "__main__":
    train()