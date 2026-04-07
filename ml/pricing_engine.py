"""
Core pricing engine — Phase B
Formula:
    Final Price = Base
                × (1 + demand_score)
                × (1 + stock_factor)
                × (1 - expiry_factor)
                × weather_multiplier
    capped at min(competitor_ceiling × 1.05, base × 1.40)
    floored at max(base × 0.50, cost_price × 1.05)
"""
import os, sys
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import joblib
import psycopg2
from datetime import date, datetime
from config import settings

MODEL_PATH  = os.path.join(os.path.dirname(__file__), "models", "demand_model.pkl")
SCALER_PATH = os.path.join(os.path.dirname(__file__), "models", "scaler.pkl")

CATEGORY_MAP = {
    "Dairy": 0, "Fruits": 1, "Vegetables": 2,
    "Staples": 3, "Snacks": 4, "Beverages": 5,
}
MAX_PRICE_MULTIPLIER = 1.40
MIN_PRICE_MULTIPLIER = 0.50

WEATHER_BOOSTS = {
    "Rainy":           {"Beverages": 1.3, "Snacks": 1.4},
    "Heavy Rain":      {"Beverages": 1.5, "Snacks": 1.6},
    "Monsoon":         {"Vegetables": 1.2, "Snacks": 1.5},
    "Cyclone Warning": {"Staples": 1.8,   "Beverages": 1.5},
    "Hot":             {"Beverages": 1.6, "Dairy": 1.2},
    "Humid":           {"Beverages": 1.4},
}
EVENT_BOOSTS = {
    "IPL Season":       {"Snacks": 1.7, "Beverages": 1.8},
    "IPL Finals":       {"Snacks": 2.0, "Beverages": 1.9},
    "Diwali":           {"Snacks": 2.1, "Dairy": 1.6},
    "Holi":             {"Dairy": 1.8,  "Beverages": 1.5},
    "Pongal":           {"Dairy": 1.9,  "Staples": 1.7},
    "Eid":              {"Staples": 1.8, "Dairy": 1.5},
    "Ganesh Chaturthi": {"Staples": 1.6, "Snacks": 1.5},
    "Christmas":        {"Beverages": 1.6, "Snacks": 1.5},
}


class PricingEngine:

    def __init__(self):
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                f"Model not found at {MODEL_PATH}. "
                "Run ml/training/train_model.py first."
            )
        self.model  = joblib.load(MODEL_PATH)
        self.scaler = joblib.load(SCALER_PATH)
        print("PricingEngine loaded model successfully.")

    def _get_db_connection(self):
        return psycopg2.connect(
            dbname=settings.db_name, user=settings.db_user,
            password=settings.db_password,
            host=settings.db_host, port=settings.db_port,
        )

    def _fetch_product_data(self, product_id: int) -> dict | None:
        conn = self._get_db_connection()
        cur  = conn.cursor()
        try:
            cur.execute("""
                SELECT p.product_id, p.name, p.base_price, p.cost_price,
                       p.shelf_life_days, p.is_perishable, c.category_name,
                       COALESCE(i.stock_quantity, 0),
                       COALESCE(i.reorder_level,  10),
                       (SELECT MIN(expiry_date) FROM perishable_batches
                        WHERE product_id = p.product_id)
                FROM products p
                JOIN categories c ON p.category_id = c.category_id
                LEFT JOIN inventory i ON p.product_id = i.product_id
                WHERE p.product_id = %s LIMIT 1;
            """, (product_id,))
            row = cur.fetchone()
            if not row:
                return None
            return {
                "product_id": row[0], "name": row[1],
                "base_price": float(row[2]), "cost_price": float(row[3]),
                "shelf_life_days": row[4] or 365, "is_perishable": row[5],
                "category_name": row[6],
                "stock_quantity": row[7], "reorder_level": row[8],
                "nearest_expiry": row[9],
            }
        finally:
            cur.close(); conn.close()

    def _compute_demand_score(self, product: dict, order_event: dict) -> float:
        ts = datetime.fromisoformat(
            order_event.get("timestamp", datetime.now().isoformat())
        )
        qty_sold = sum(
            i["quantity"] for i in order_event.get("items", [])
            if i["product_id"] == product["product_id"]
        )
        features = pd.DataFrame([{
            "hour_of_day":     ts.hour,
            "day_of_week":     ts.weekday(),
            "is_weekend":      1 if ts.weekday() >= 5 else 0,
            "avg_qty_last5":   float(qty_sold),
            "avg_qty_last20":  float(qty_sold),
            "stock_ratio":     min(product["stock_quantity"] / 300.0, 1.0),
            "is_low_stock":    1 if product["stock_quantity"] <= product["reorder_level"] else 0,
            "price_ratio":     order_event.get("demand_multiplier", 1.0),
            "shelf_life_days": float(product["shelf_life_days"]),
            "is_perishable":   1 if product["is_perishable"] else 0,
            "category_code":   float(CATEGORY_MAP.get(product["category_name"], 0)),
        }])
        scaled = self.scaler.transform(features)
        return float(np.clip(self.model.predict(scaled)[0], 0.0, 1.0))

    def _compute_stock_factor(self, product: dict) -> tuple[float, str]:
        stock, level = product["stock_quantity"], product["reorder_level"]
        if stock <= 0:          return 0.20, "Out of stock — max surcharge"
        elif stock <= level:    return 0.15, "Low stock — surcharge applied"
        elif stock <= level*2:  return 0.05, "Moderate stock"
        elif stock > 250:       return -0.05, "Overstock — slight discount"
        return 0.0, "Normal stock"

    def _compute_expiry_factor(self, product: dict) -> tuple[float, str]:
        if not product["is_perishable"] or not product["nearest_expiry"]:
            return 0.0, "Non-perishable"
        expiry = product["nearest_expiry"]
        if isinstance(expiry, str):
            expiry = date.fromisoformat(expiry)
        days = (expiry - date.today()).days
        # Strong markdown for near-expiry inventory to maximize sell-through.
        if days <= 0:   return 0.80, "Expired - emergency markdown, flag for redistribution"
        elif days == 1: return 0.70, "Expiring tomorrow - emergency markdown"
        elif days == 2: return 0.60, "Expiring in 2 days - heavy markdown"
        elif days == 3: return 0.50, "Expiring in 3 days - heavy markdown"
        elif days <= 4: return 0.20, "Expiring soon - discount"
        return 0.0, "Fresh stock"

    def _expiry_days_left(self, product: dict) -> int | None:
        if not product["is_perishable"] or not product["nearest_expiry"]:
            return None
        expiry = product["nearest_expiry"]
        if isinstance(expiry, str):
            expiry = date.fromisoformat(expiry)
        return (expiry - date.today()).days

    def _get_competitor_ceiling(self, product_id: int) -> float | None:
        conn = self._get_db_connection()
        cur  = conn.cursor()
        try:
            cur.execute("""
                SELECT MIN(their_price) FROM competitor_prices
                WHERE product_id = %s
                  AND scraped_at >= NOW() - INTERVAL '24 hours';
            """, (product_id,))
            row = cur.fetchone()
            return float(row[0]) if row and row[0] else None
        except Exception:
            return None
        finally:
            cur.close(); conn.close()

    def _get_weather_multiplier(self, product: dict) -> tuple[float, str]:
        conn = self._get_db_connection()
        cur  = conn.cursor()
        try:
            cur.execute("""
                SELECT weather, event_name, event_demand_multiplier, rain_intensity
                FROM external_factors ORDER BY timestamp DESC LIMIT 1;
            """)
            row = cur.fetchone()
            if not row:
                return 1.0, ""
            weather, event_name, _, rain = row
            category     = product.get("category_name", "")
            multiplier   = 1.0
            reason_parts = []

            if weather in WEATHER_BOOSTS:
                boost = WEATHER_BOOSTS[weather].get(category, 1.0)
                if boost > 1.0:
                    multiplier *= boost
                    reason_parts.append(f"{weather} boost")

            if rain and float(rain) > 4:
                multiplier *= 1.0 + float(rain) * 0.02
                reason_parts.append(f"rain {rain}/10")

            if event_name and event_name in EVENT_BOOSTS:
                boost = EVENT_BOOSTS[event_name].get(category, 1.0)
                if boost > 1.0:
                    multiplier *= boost
                    reason_parts.append(event_name)

            return round(min(multiplier, 2.0), 3), "; ".join(reason_parts)
        except Exception:
            return 1.0, ""
        finally:
            cur.close(); conn.close()

    def compute_price(self, product_id: int, order_event: dict) -> dict | None:
        product = self._fetch_product_data(product_id)
        if not product:
            return None

        demand_score              = self._compute_demand_score(product, order_event)
        stock_factor, stock_msg   = self._compute_stock_factor(product)
        expiry_factor, exp_msg    = self._compute_expiry_factor(product)
        weather_mult, weather_msg = self._get_weather_multiplier(product)
        comp_ceil                 = self._get_competitor_ceiling(product_id)

        base = product["base_price"]

        raw_price = (
            base
            * (1 + demand_score)
            * (1 + stock_factor)
            * (1 - expiry_factor)
            * weather_mult
        )

        days_left = self._expiry_days_left(product)
        min_multiplier = 0.20 if (days_left is not None and days_left <= 3) else MIN_PRICE_MULTIPLIER

        final_price = round(float(np.clip(
            raw_price,
            base * min_multiplier,
            base * MAX_PRICE_MULTIPLIER,
        )), 2)
        final_price = max(final_price, float(product["cost_price"]) * 1.05)
        if comp_ceil and final_price > comp_ceil * 1.05:
            final_price = round(comp_ceil * 1.05, 2)

        margin = round(
            (final_price - product["cost_price"]) / max(final_price, 0.01), 4
        )

        reasons = []
        if demand_score > 0.6:
            reasons.append(f"High demand ({demand_score:.2f})")
        elif demand_score < 0.3:
            reasons.append(f"Low demand ({demand_score:.2f})")
        if stock_msg != "Normal stock":
            reasons.append(stock_msg)
        if exp_msg not in ("Non-perishable", "Fresh stock"):
            reasons.append(exp_msg)
        if weather_msg:
            reasons.append(weather_msg)
        if comp_ceil and final_price >= comp_ceil * 1.03:
            reasons.append(f"Near competitor ceiling ₹{comp_ceil:.2f}")

        return {
            "product_id":        product_id,
            "warehouse_id":      None,
            "recommended_price": final_price,
            "base_price":        base,
            "demand_score":      round(demand_score,   4),
            "stock_factor":      round(stock_factor,   4),
            "expiry_factor":     round(expiry_factor,  4),
            "final_margin":      margin,
            "price_reason":      "; ".join(reasons) if reasons else "Stable demand and stock",
            "product_name":      product["name"],
            "competitor_ceil":   comp_ceil,
            "weather_mult":      weather_mult,
        }
