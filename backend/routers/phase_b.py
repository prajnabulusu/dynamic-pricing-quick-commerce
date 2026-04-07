"""
Phase B API endpoints:
  /phase-b/competitor-prices     — latest competitor prices per product
  /phase-b/weather               — current weather across all cities
  /phase-b/cold-chain            — recent cold chain readings + breach alerts
  /phase-b/social-impact         — kg saved, CO2 offset, meals equivalent
  /phase-b/spike/{product_id}    — trigger demand spike (admin demo tool)
"""
import sys, os
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.models.database import get_db

router = APIRouter(prefix="/phase-b", tags=["Phase B"])


@router.get("/competitor-prices")
def get_competitor_prices(db: Session = Depends(get_db)):
    """Returns the latest competitor price for every product from all platforms."""
    rows = db.execute(text("""
        SELECT DISTINCT ON (cp.product_id, cp.competitor_name)
            p.name          AS product_name,
            cp.competitor_name,
            cp.their_price,
            p.base_price    AS our_base,
            COALESCE(
                (SELECT pr.recommended_price FROM pricing pr
                 WHERE pr.product_id = p.product_id
                 ORDER BY pr.created_at DESC LIMIT 1),
                p.base_price
            )               AS our_current_price,
            cp.scraped_at
        FROM competitor_prices cp
        JOIN products p ON cp.product_id = p.product_id
        ORDER BY cp.product_id, cp.competitor_name, cp.scraped_at DESC;
    """)).fetchall()

    return [
        {
            "product_name":     r.product_name,
            "competitor":       r.competitor_name,
            "their_price":      float(r.their_price),
            "our_base":         float(r.our_base),
            "our_current":      float(r.our_current_price),
            "difference_pct":   round(
                (float(r.our_current_price) - float(r.their_price))
                / float(r.their_price) * 100, 1
            ),
        }
        for r in rows
    ]


@router.get("/weather")
def get_current_weather(db: Session = Depends(get_db)):
    """Returns the latest weather reading per city."""
    rows = db.execute(text("""
        SELECT DISTINCT ON (ef.location_id)
            l.city,
            ef.weather,
            ef.temperature,
            ef.rain_intensity,
            ef.festival_flag,
            ef.event_name,
            ef.event_demand_multiplier,
            ef.timestamp
        FROM external_factors ef
        JOIN locations l ON ef.location_id = l.location_id
        ORDER BY ef.location_id, ef.timestamp DESC;
    """)).fetchall()

    return [
        {
            "city":              r.city,
            "weather":           r.weather,
            "temperature":       float(r.temperature) if r.temperature else None,
            "rain_intensity":    float(r.rain_intensity) if r.rain_intensity else 0,
            "festival_active":   r.festival_flag,
            "event_name":        r.event_name,
            "demand_multiplier": float(r.event_demand_multiplier) if r.event_demand_multiplier else 1.0,
            "updated_at":        r.timestamp,
        }
        for r in rows
    ]


@router.get("/cold-chain")
def get_cold_chain_status(db: Session = Depends(get_db)):
    """Returns latest temperature reading per product with breach status."""
    rows = db.execute(text("""
        SELECT DISTINCT ON (cl.product_id)
            p.name              AS product_name,
            ds.name             AS store_name,
            ds.city,
            cl.temperature_c,
            cl.required_temp_c,
            cl.breach_detected,
            cl.breach_severity,
            cl.logged_at
        FROM cold_chain_logs cl
        JOIN products    p  ON cl.product_id = p.product_id
        JOIN dark_stores ds ON cl.store_id   = ds.store_id
        ORDER BY cl.product_id, cl.logged_at DESC;
    """)).fetchall()

    return [
        {
            "product_name":   r.product_name,
            "store":          r.store_name,
            "city":           r.city,
            "actual_temp":    float(r.temperature_c),
            "required_temp":  float(r.required_temp_c),
            "breach":         r.breach_detected,
            "severity":       r.breach_severity,
            "logged_at":      r.logged_at,
        }
        for r in rows
    ]


@router.get("/cold-chain/alerts")
def get_cold_chain_alerts(db: Session = Depends(get_db)):
    """Returns only active breach alerts (major + critical) from last hour."""
    rows = db.execute(text("""
        SELECT
            p.name,
            ds.name AS store_name, ds.city,
            cl.temperature_c, cl.required_temp_c,
            cl.breach_severity, cl.logged_at,
            COUNT(*) OVER (PARTITION BY cl.product_id) AS breach_count
        FROM cold_chain_logs cl
        JOIN products    p  ON cl.product_id = p.product_id
        JOIN dark_stores ds ON cl.store_id   = ds.store_id
        WHERE cl.breach_detected = TRUE
          AND cl.breach_severity IN ('major','critical')
          AND cl.logged_at >= NOW() - INTERVAL '1 hour'
        ORDER BY
            CASE cl.breach_severity
                WHEN 'critical' THEN 1
                WHEN 'major'    THEN 2
                ELSE 3
            END,
            cl.logged_at DESC;
    """)).fetchall()

    return [
        {
            "product":        r.name,
            "store":          r.store_name,
            "city":           r.city,
            "actual_temp":    float(r.temperature_c),
            "required_temp":  float(r.required_temp_c),
            "severity":       r.breach_severity,
            "breach_count":   r.breach_count,
            "logged_at":      r.logged_at,
        }
        for r in rows
    ]


@router.get("/social-impact")
def get_social_impact(db: Session = Depends(get_db)):
    """
    Live social impact metrics — computed fresh from redistribution data.
    Used by the admin dashboard impact panel.
    """
    # Total from redistribution dispatches
    dispatch_stats = db.execute(text("""
        SELECT
            COALESCE(SUM(rd.quantity_dispatched), 0)        AS total_units,
            COALESCE(SUM(rd.quantity_dispatched * 0.25), 0) AS total_kg,
            COUNT(DISTINCT rd.partner_id)                   AS partners_used,
            COUNT(*)                                        AS total_dispatches
        FROM redistribution_dispatch rd
        WHERE rd.delivery_status IN ('in_transit','delivered');
    """)).fetchone()

    # Perishable waste saved (items discounted and sold vs would-have-expired)
    perishable_stats = db.execute(text("""
        SELECT
            COALESCE(SUM(pb.kg_saved), 0)        AS kg_saved,
            COALESCE(SUM(pb.co2_offset_kg), 0)   AS co2_offset
        FROM perishable_batches pb
        WHERE pb.redistribution_status IN ('dispatched','available')
          AND pb.kg_saved > 0;
    """)).fetchone()

    total_kg    = float(dispatch_stats.total_kg or 0) + float(perishable_stats.kg_saved or 0)
    co2_offset  = float(perishable_stats.co2_offset or 0) + total_kg * 1.5
    meals       = int(total_kg / 0.4)   # ~400g per meal

    # Today's revenue recovered from near-expiry discounts
    revenue_recovered = db.execute(text("""
        SELECT COALESCE(SUM(oi.quantity * oi.selling_price), 0)
        FROM order_items oi
        JOIN pricing pr ON oi.product_id = pr.product_id
        WHERE pr.expiry_factor > 0
          AND oi.order_id IN (
              SELECT order_id FROM orders
              WHERE order_timestamp::date = CURRENT_DATE
          );
    """)).fetchone()[0]

    # Partner breakdown
    partners = db.execute(text("""
        SELECT
            rp.name,
            rp.type,
            COUNT(rd.dispatch_id)              AS dispatches,
            SUM(rd.quantity_dispatched)        AS total_units
        FROM redistribution_dispatch rd
        JOIN redistribution_partners rp ON rd.partner_id = rp.partner_id
        GROUP BY rp.name, rp.type
        ORDER BY total_units DESC;
    """)).fetchall()

    return {
        "total_kg_saved":       round(total_kg, 2),
        "co2_offset_kg":        round(co2_offset, 2),
        "meals_equivalent":     meals,
        "total_dispatches":     dispatch_stats.total_dispatches,
        "partners_used":        dispatch_stats.partners_used,
        "revenue_recovered":    round(float(revenue_recovered), 2),
        "partners": [
            {
                "name":       r.name,
                "type":       r.type,
                "dispatches": r.dispatches,
                "units":      r.total_units,
            }
            for r in partners
        ],
    }


@router.get("/perishable-lifecycle")
def get_perishable_lifecycle(db: Session = Depends(get_db)):
    """Full lifecycle view of all perishable batches — for the impact dashboard."""
    rows = db.execute(text("""
        SELECT
            pb.batch_id,
            pb.batch_code,
            p.name              AS product_name,
            c.category_name,
            pb.quantity,
            pb.manufacture_date,
            pb.expiry_date,
            (pb.expiry_date - CURRENT_DATE)::int AS days_left,
            pb.redistribution_status,
            pb.kg_saved,
            pb.co2_offset_kg,
            COALESCE(
                (SELECT pr.recommended_price FROM pricing pr
                 WHERE pr.product_id = pb.product_id
                 ORDER BY pr.created_at DESC LIMIT 1),
                p.base_price
            ) AS current_price,
            p.base_price,
            COALESCE(
                (SELECT pr.expiry_factor FROM pricing pr
                 WHERE pr.product_id = pb.product_id
                 ORDER BY pr.created_at DESC LIMIT 1),
                0
            ) AS expiry_factor
        FROM perishable_batches pb
        JOIN products    p ON pb.product_id = p.product_id
        JOIN categories  c ON p.category_id  = c.category_id
        ORDER BY pb.expiry_date ASC;
    """)).fetchall()

    return [
        {
            "batch_id":     r.batch_id,
            "batch_code":   r.batch_code,
            "product":      r.product_name,
            "category":     r.category_name,
            "quantity":     r.quantity,
            "expiry_date":  str(r.expiry_date) if r.expiry_date else None,
            "days_left":    r.days_left,
            "status":       r.redistribution_status,
            "kg_saved":     float(r.kg_saved or 0),
            "co2_offset":   float(r.co2_offset_kg or 0),
            "base_price":   float(r.base_price),
            "current_price":float(r.current_price),
            "discount_pct": round(
                (1 - float(r.current_price) / max(float(r.base_price), 0.01)) * 100, 1
            ),
        }
        for r in rows
    ]