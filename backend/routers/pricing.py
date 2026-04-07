from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from math import radians, sin, cos, sqrt, atan2
from datetime import date, timedelta

from backend.models.database import get_db
from backend.schemas.schemas import (
    PriceResponse, DashboardStats,
    NearExpiryItem, RedistributionItem,
)

# ── Pricing router ────────────────────────────────────────────────────────────
router = APIRouter(prefix="/price", tags=["Pricing"])


@router.get("/{product_id}", response_model=PriceResponse)
def get_current_price(product_id: int, db: Session = Depends(get_db)):
    """
    Returns the latest dynamic price for a product with full breakdown.
    Frontend shows this on the product detail page.
    """
    row = db.execute(text("""
        SELECT
            p.product_id,
            p.name,
            p.base_price,
            pr.recommended_price,
            pr.demand_score,
            pr.stock_factor,
            pr.expiry_factor,
            pr.final_margin,
            pr.price_reason,
            pr.created_at
        FROM pricing pr
        JOIN products p ON pr.product_id = p.product_id
        WHERE pr.product_id = :pid
        ORDER BY pr.created_at DESC
        LIMIT 1;
    """), {"pid": product_id}).fetchone()

    if not row:
        # Product exists but no price computed yet — return base price
        base = db.execute(
            text("SELECT product_id, name, base_price FROM products WHERE product_id = :pid"),
            {"pid": product_id},
        ).fetchone()
        if not base:
            raise HTTPException(status_code=404, detail="Product not found")
        return PriceResponse(
            product_id=base.product_id,
            product_name=base.name,
            base_price=float(base.base_price),
            recommended_price=float(base.base_price),
            demand_score=0.0, stock_factor=0.0,
            expiry_factor=0.0, final_margin=0.0,
            price_reason="No dynamic price yet — base price used",
            last_updated=None,
        )

    return PriceResponse(
        product_id=row.product_id,
        product_name=row.name,
        base_price=float(row.base_price),
        recommended_price=float(row.recommended_price),
        demand_score=float(row.demand_score or 0),
        stock_factor=float(row.stock_factor or 0),
        expiry_factor=float(row.expiry_factor or 0),
        final_margin=float(row.final_margin or 0),
        price_reason=row.price_reason or "",
        last_updated=row.created_at,
    )


@router.get("/all/latest", tags=["Pricing"])
def get_all_latest_prices(db: Session = Depends(get_db)):
    """Returns the latest price for every product — used by Power BI."""
    rows = db.execute(text("""
        SELECT DISTINCT ON (pr.product_id)
            p.product_id,
            p.name,
            p.base_price,
            pr.recommended_price,
            pr.demand_score,
            pr.stock_factor,
            pr.expiry_factor,
            pr.price_reason,
            pr.created_at
        FROM pricing pr
        JOIN products p ON pr.product_id = p.product_id
        ORDER BY pr.product_id, pr.created_at DESC;
    """)).fetchall()

    return [
        {
            "product_id":        r.product_id,
            "name":              r.name,
            "base_price":        float(r.base_price),
            "recommended_price": float(r.recommended_price),
            "demand_score":      float(r.demand_score or 0),
            "stock_factor":      float(r.stock_factor or 0),
            "expiry_factor":     float(r.expiry_factor or 0),
            "price_reason":      r.price_reason,
            "last_updated":      r.created_at,
        }
        for r in rows
    ]


# ── Dashboard router ──────────────────────────────────────────────────────────
dashboard_router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@dashboard_router.get("/stats", response_model=DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Aggregated stats for the admin dashboard — all in one query batch."""

    orders_today = db.execute(text("""
        SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
        FROM orders
        WHERE order_timestamp::date = CURRENT_DATE;
    """)).fetchone()

    avg_demand = db.execute(text("""
        SELECT COALESCE(AVG(demand_score), 0)
        FROM (
            SELECT DISTINCT ON (product_id) demand_score
            FROM pricing
            ORDER BY product_id, created_at DESC
        ) latest;
    """)).fetchone()

    low_stock = db.execute(text("""
        SELECT COUNT(*) FROM inventory
        WHERE stock_quantity <= reorder_level;
    """)).fetchone()

    near_expiry = db.execute(text("""
        SELECT COUNT(*) FROM perishable_batches
        WHERE expiry_date <= CURRENT_DATE + INTERVAL '3 days'
          AND expiry_date >= CURRENT_DATE;
    """)).fetchone()

    pending_redis = db.execute(text("""
        SELECT COUNT(*) FROM redistribution_requests
        WHERE status = 'pending';
    """)).fetchone()

    top_selling = db.execute(text("""
        SELECT p.name
        FROM order_items oi
        JOIN products p ON oi.product_id = p.product_id
        JOIN orders o   ON oi.order_id   = o.order_id
        WHERE o.order_timestamp::date = CURRENT_DATE
        GROUP BY p.name
        ORDER BY SUM(oi.quantity) DESC
        LIMIT 1;
    """)).fetchone()

    most_dynamic = db.execute(text("""
        SELECT p.name
        FROM price_history ph
        JOIN products p ON ph.product_id = p.product_id
        WHERE ph.timestamp::date = CURRENT_DATE
        GROUP BY p.name
        ORDER BY AVG(ABS(ph.new_price - ph.old_price)) DESC
        LIMIT 1;
    """)).fetchone()

    return DashboardStats(
        total_orders_today=orders_today[0],
        total_revenue_today=round(float(orders_today[1]), 2),
        avg_demand_score=round(float(avg_demand[0]), 3),
        low_stock_products=low_stock[0],
        near_expiry_products=near_expiry[0],
        pending_redistributions=pending_redis[0],
        top_selling_product=top_selling[0] if top_selling else None,
        most_dynamic_product=most_dynamic[0] if most_dynamic else None,
    )


@dashboard_router.get("/near-expiry",
                       response_model=list[NearExpiryItem])
def get_near_expiry(db: Session = Depends(get_db)):
    """Products expiring within 4 days — shown as alerts in admin view."""
    rows = db.execute(text("""
        SELECT
            pb.product_id,
            p.name,
            (pb.expiry_date - CURRENT_DATE)::int AS days_left,
            pb.quantity,
            pb.expiry_date::text,
            COALESCE(
                (SELECT pr.recommended_price FROM pricing pr
                 WHERE pr.product_id = pb.product_id
                 ORDER BY pr.created_at DESC LIMIT 1),
                p.base_price
            ) AS current_price
        FROM perishable_batches pb
        JOIN products p ON pb.product_id = p.product_id
        WHERE pb.expiry_date >= CURRENT_DATE
          AND pb.expiry_date <= CURRENT_DATE + INTERVAL '4 days'
        ORDER BY pb.expiry_date ASC;
    """)).fetchall()

    return [
        NearExpiryItem(
            product_id=r.product_id,
            product_name=r.name,
            days_left=r.days_left,
            quantity=r.quantity,
            expiry_date=r.expiry_date,
            current_price=float(r.current_price),
        )
        for r in rows
    ]


@dashboard_router.get("/redistribution",
                       response_model=list[RedistributionItem])
def get_redistribution(db: Session = Depends(get_db)):
    """Active redistribution requests — shown in admin dashboard."""
    rows = db.execute(text("""
        SELECT
            rr.request_id,
            p.name,
            rr.quantity_available,
            rr.expiry_date::text,
            rr.status,
            rp.name AS partner_name
        FROM redistribution_requests rr
        JOIN products p ON rr.product_id = p.product_id
        LEFT JOIN redistribution_dispatch rd ON rr.request_id = rd.request_id
        LEFT JOIN redistribution_partners rp ON rd.partner_id  = rp.partner_id
        ORDER BY rr.created_at DESC
        LIMIT 20;
    """)).fetchall()

    return [
        RedistributionItem(
            request_id=r.request_id,
            product_name=r.name,
            quantity=r.quantity_available,
            expiry_date=r.expiry_date,
            status=r.status,
            partner_name=r.partner_name,
        )
        for r in rows
    ]


@dashboard_router.get("/animal-shelter-routing")
def get_animal_shelter_routing(db: Session = Depends(get_db)):
    """
    Route last-day expiring fruits/vegetables to nearest animal shelters.
    Nearest is approximated by same-city match first, then highest-capacity fallback.
    """
    rows = db.execute(text("""
        WITH candidates AS (
            SELECT
                pb.batch_id,
                pb.product_id,
                p.name AS product_name,
                c.category_name,
                pb.quantity,
                (pb.expiry_date - CURRENT_DATE)::int AS days_left,
                COALESCE(w.location, 'Unknown') AS warehouse_city
            FROM perishable_batches pb
            JOIN products p   ON pb.product_id = p.product_id
            JOIN categories c ON p.category_id = c.category_id
            LEFT JOIN warehouses w ON pb.warehouse_id = w.warehouse_id
            WHERE p.is_perishable = TRUE
              AND c.category_name IN ('Fruits', 'Vegetables')
              AND pb.expiry_date >= CURRENT_DATE
              AND pb.expiry_date <= CURRENT_DATE + INTERVAL '1 day'
              AND pb.quantity > 0
        )
        SELECT
            c.batch_id,
            c.product_id,
            c.product_name,
            c.category_name,
            c.quantity,
            c.days_left,
            c.warehouse_city,
            s.partner_id,
            s.name AS shelter_name,
            s.location AS shelter_city,
            s.contact_details,
            s.capacity,
            CASE
                WHEN LOWER(COALESCE(s.location, '')) = LOWER(COALESCE(c.warehouse_city, '')) THEN 'same_city'
                ELSE 'fallback_capacity'
            END AS match_type
        FROM candidates c
        JOIN LATERAL (
            SELECT
                rp.partner_id,
                rp.name,
                rp.location,
                rp.contact_details,
                rp.capacity
            FROM redistribution_partners rp
            WHERE rp.type = 'animal_shelter'
            ORDER BY
                CASE
                    WHEN LOWER(COALESCE(rp.location, '')) = LOWER(COALESCE(c.warehouse_city, '')) THEN 0
                    ELSE 1
                END,
                rp.capacity DESC,
                rp.partner_id ASC
            LIMIT 1
        ) s ON TRUE
        ORDER BY c.days_left ASC, c.category_name, c.product_name;
    """)).fetchall()

    return [
        {
            "batch_id": r.batch_id,
            "product_id": r.product_id,
            "product_name": r.product_name,
            "category_name": r.category_name,
            "quantity": int(r.quantity),
            "days_left": int(r.days_left),
            "warehouse_city": r.warehouse_city,
            "shelter_id": r.partner_id,
            "shelter_name": r.shelter_name,
            "shelter_city": r.shelter_city,
            "shelter_contact": r.contact_details,
            "shelter_capacity": int(r.capacity or 0),
            "match_type": r.match_type,
        }
        for r in rows
    ]


def _normalize_partner_type(value: str | None) -> str:
    if not value:
        return ""
    return value.strip().lower().replace("-", "_").replace(" ", "_")


CITY_COORDS = {
    "hyderabad": (17.3850, 78.4867),
    "bangalore": (12.9716, 77.5946),
    "bengaluru": (12.9716, 77.5946),
    "chennai": (13.0827, 80.2707),
    "mumbai": (19.0760, 72.8777),
    "delhi": (28.6139, 77.2090),
}


def _normalize_city_name(raw: str | None) -> str:
    if not raw:
        return ""
    city = raw.strip().lower()
    city = city.replace(" warehouse", "")
    city = city.replace("warehouse", "")
    city = " ".join(city.split())
    return city


def _distance_km(city_a: str | None, city_b: str | None) -> float | None:
    a = CITY_COORDS.get(_normalize_city_name(city_a))
    b = CITY_COORDS.get(_normalize_city_name(city_b))
    if not a or not b:
        return None
    lat1, lon1 = radians(a[0]), radians(a[1])
    lat2, lon2 = radians(b[0]), radians(b[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    x = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(x), sqrt(1 - x))
    return round(6371.0 * c, 1)


@dashboard_router.get("/rescue-routing")
def get_rescue_routing(db: Session = Depends(get_db)):
    """
    MVP rescue routing:
    - Last-day fruits/vegetables -> animal shelters
    - Other near-expiry perishables -> NGOs/orphanages
    - Spoiled perishables -> compost/biogas processors
    """
    candidate_rows = db.execute(text("""
        SELECT
            pb.batch_id,
            pb.product_id,
            p.name AS product_name,
            c.category_name,
            pb.quantity,
            pb.expiry_date::text AS expiry_date,
            (pb.expiry_date - CURRENT_DATE)::int AS days_left,
            COALESCE(w.location, 'Unknown') AS warehouse_city
        FROM perishable_batches pb
        JOIN products p   ON pb.product_id = p.product_id
        JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN warehouses w ON pb.warehouse_id = w.warehouse_id
        WHERE p.is_perishable = TRUE
          AND pb.quantity > 0
          AND pb.expiry_date <= CURRENT_DATE + INTERVAL '3 days'
          AND pb.expiry_date >= CURRENT_DATE - INTERVAL '2 days'
        ORDER BY pb.expiry_date ASC, c.category_name, p.name;
    """)).fetchall()

    partner_rows = db.execute(text("""
        SELECT
            partner_id,
            name,
            type,
            location,
            contact_details,
            capacity
        FROM redistribution_partners
        ORDER BY capacity DESC, partner_id ASC;
    """)).fetchall()

    dispatch_rows = db.execute(text("""
        SELECT
            rr.batch_id,
            rr.status AS request_status,
            rd.delivery_status
        FROM redistribution_requests rr
        LEFT JOIN redistribution_dispatch rd ON rr.request_id = rd.request_id;
    """)).fetchall()

    dispatch_map: dict[int, dict] = {}
    for row in dispatch_rows:
        batch_id = int(row.batch_id) if row.batch_id is not None else None
        if batch_id is None:
            continue
        existing = dispatch_map.get(batch_id)
        incoming_delivery = row.delivery_status or ""
        incoming_status = row.request_status or "pending"
        incoming_rank = 2 if incoming_delivery == "in_transit" else 1 if incoming_status in {"accepted", "completed"} else 0
        if not existing or incoming_rank >= existing["rank"]:
            dispatch_map[batch_id] = {
                "rank": incoming_rank,
                "request_status": incoming_status,
                "delivery_status": incoming_delivery,
            }

    partner_groups = {
        "animal_shelter": [],
        "ngo_orphanage": [],
        "compost_biogas": [],
    }

    animal_aliases = {"animal_shelter", "animal", "shelter", "animal_care"}
    ngo_aliases = {"ngo", "orphanage", "charity", "non_profit", "nonprofit"}
    compost_aliases = {"compost", "biogas", "waste_processor", "compost_biogas", "recycler"}

    for row in partner_rows:
        normalized = _normalize_partner_type(row.type)
        if normalized in animal_aliases:
            partner_groups["animal_shelter"].append(row)
        if normalized in ngo_aliases:
            partner_groups["ngo_orphanage"].append(row)
        if normalized in compost_aliases:
            partner_groups["compost_biogas"].append(row)

    summary = {
        "total_candidates": len(candidate_rows),
        "animal_shelter": 0,
        "ngo_orphanage": 0,
        "compost_biogas": 0,
        "assigned": 0,
        "needs_onboarding": 0,
    }
    routes = []
    urgency_breakdown = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    category_breakdown: dict[str, int] = {}
    city_breakdown: dict[str, int] = {}
    partner_load: dict[int, dict] = {}
    total_estimated_meals = 0
    total_estimated_co2_kg = 0.0
    total_estimated_kg_diverted = 0.0

    for row in candidate_rows:
        category = (row.category_name or "").strip()
        category_lc = category.lower()
        days_left = int(row.days_left)

        if days_left < 0:
            channel = "compost_biogas"
            route_reason = "Spoiled stock should be diverted to compost/biogas processing."
            urgency = "critical"
        elif category_lc in {"fruits", "vegetables"} and days_left <= 1:
            channel = "animal_shelter"
            route_reason = "Last-day fruits/vegetables are prioritized for animal feeding support."
            urgency = "high"
        else:
            channel = "ngo_orphanage"
            route_reason = "Near-expiry edible inventory is routed to NGOs/orphanages for quick human use."
            urgency = "medium" if days_left <= 2 else "low"

        summary[channel] += 1
        urgency_breakdown[urgency] = urgency_breakdown.get(urgency, 0) + 1
        category_breakdown[category] = category_breakdown.get(category, 0) + 1
        city_key = _normalize_city_name(row.warehouse_city) or "unknown"
        city_breakdown[city_key] = city_breakdown.get(city_key, 0) + 1

        city = _normalize_city_name(row.warehouse_city)
        partners = partner_groups[channel]
        sorted_partners = sorted(
            partners,
            key=lambda p: (
                0 if _normalize_city_name(p.location) == city and city else 1,
                -(int(p.capacity) if p.capacity is not None else 0),
                int(p.partner_id),
            ),
        )
        assigned = sorted_partners[0] if sorted_partners else None
        if assigned:
            summary["assigned"] += 1
            match_type = "same_city" if _normalize_city_name(assigned.location) == city and city else "capacity_fallback"
        else:
            summary["needs_onboarding"] += 1
            match_type = "needs_onboarding"

        distance_km = _distance_km(row.warehouse_city, assigned.location if assigned else None)
        eta_mins = None
        if distance_km is not None:
            eta_mins = max(15, int(round(distance_km * 3.0)))
        elif assigned:
            eta_mins = 45 if match_type == "same_city" else 180

        dispatch = dispatch_map.get(int(row.batch_id), None)
        if dispatch and dispatch.get("delivery_status"):
            dispatch_status = dispatch["delivery_status"]
        elif dispatch:
            dispatch_status = dispatch.get("request_status", "pending")
        elif assigned:
            dispatch_status = "route_planned"
        else:
            dispatch_status = "awaiting_partner"

        edible_channels = {"animal_shelter", "ngo_orphanage"}
        estimated_kg_diverted = round(float(row.quantity) * 0.75, 2)
        estimated_meals = int(round(float(row.quantity) * 2.5)) if channel in edible_channels else 0
        estimated_co2_kg = round(estimated_kg_diverted * 2.1, 2)
        total_estimated_kg_diverted += estimated_kg_diverted
        total_estimated_meals += estimated_meals
        total_estimated_co2_kg += estimated_co2_kg

        urgency_base = {"critical": 90, "high": 75, "medium": 55, "low": 35}.get(urgency, 40)
        quantity_boost = min(20, int(row.quantity) // 8)
        assignment_penalty = 0 if assigned else 12
        dispatch_penalty = 8 if dispatch_status in {"awaiting_partner", "pending"} else 0
        rescue_score = min(100, urgency_base + quantity_boost + assignment_penalty + dispatch_penalty)

        if days_left < 0:
            pickup_by = date.today().isoformat()
        elif days_left <= 1:
            pickup_by = date.today().isoformat()
        else:
            pickup_by = (date.today() + timedelta(days=1)).isoformat()

        if assigned:
            pid = int(assigned.partner_id)
            if pid not in partner_load:
                partner_load[pid] = {
                    "partner_id": pid,
                    "partner_name": assigned.name,
                    "partner_type": assigned.type,
                    "partner_city": assigned.location,
                    "capacity": int(assigned.capacity or 0),
                    "assigned_batches": 0,
                    "assigned_quantity": 0,
                }
            partner_load[pid]["assigned_batches"] += 1
            partner_load[pid]["assigned_quantity"] += int(row.quantity)

        routes.append(
            {
                "batch_id": int(row.batch_id),
                "product_id": int(row.product_id),
                "product_name": row.product_name,
                "category_name": category,
                "quantity": int(row.quantity),
                "expiry_date": row.expiry_date,
                "days_left": days_left,
                "warehouse_city": row.warehouse_city,
                "route_channel": channel,
                "urgency": urgency,
                "route_reason": route_reason,
                "assignment_status": "assigned" if assigned else "needs_onboarding",
                "match_type": match_type,
                "distance_km": distance_km,
                "eta_mins": eta_mins,
                "dispatch_status": dispatch_status,
                "rescue_score": rescue_score,
                "pickup_by": pickup_by,
                "estimated_kg_diverted": estimated_kg_diverted,
                "estimated_meals": estimated_meals,
                "estimated_co2_kg": estimated_co2_kg,
                "partner_id": int(assigned.partner_id) if assigned else None,
                "partner_name": assigned.name if assigned else None,
                "partner_type": assigned.type if assigned else None,
                "partner_city": assigned.location if assigned else None,
                "partner_contact": assigned.contact_details if assigned else None,
                "partner_capacity": int(assigned.capacity) if assigned and assigned.capacity is not None else 0,
            }
        )

    summary["estimated_meals"] = int(total_estimated_meals)
    summary["estimated_co2_kg"] = round(total_estimated_co2_kg, 2)
    summary["estimated_kg_diverted"] = round(total_estimated_kg_diverted, 2)

    partner_utilization = []
    for partner in partner_load.values():
        capacity = max(int(partner["capacity"]), 1)
        utilization_pct = round((partner["assigned_quantity"] / capacity) * 100, 1)
        partner_utilization.append(
            {
                **partner,
                "utilization_pct": utilization_pct,
            }
        )
    partner_utilization.sort(key=lambda p: (p["assigned_quantity"], p["assigned_batches"]), reverse=True)

    city_rollup = [
        {"city": city.title(), "count": count}
        for city, count in sorted(city_breakdown.items(), key=lambda item: item[1], reverse=True)
    ]
    category_rollup = [
        {"category": category, "count": count}
        for category, count in sorted(category_breakdown.items(), key=lambda item: item[1], reverse=True)
    ]

    onboarding = []
    if summary["animal_shelter"] > 0 and len(partner_groups["animal_shelter"]) == 0:
        onboarding.append(
            {
                "channel": "animal_shelter",
                "needed_partner_type": "animal_shelter",
                "why": "Last-day fruits/vegetables cannot be dispatched without nearby shelter partners.",
            }
        )
    if summary["ngo_orphanage"] > 0 and len(partner_groups["ngo_orphanage"]) == 0:
        onboarding.append(
            {
                "channel": "ngo_orphanage",
                "needed_partner_type": "NGO or orphanage",
                "why": "Near-expiry edible stock needs human-distribution partners for same-day dispatch.",
            }
        )
    if summary["compost_biogas"] > 0 and len(partner_groups["compost_biogas"]) == 0:
        onboarding.append(
            {
                "channel": "compost_biogas",
                "needed_partner_type": "compost or biogas processor",
                "why": "Spoiled stock needs sustainable waste conversion outlets.",
            }
        )

    return {
        "summary": summary,
        "routes": routes,
        "onboarding": onboarding,
        "analytics": {
            "urgency_breakdown": urgency_breakdown,
            "city_breakdown": city_rollup,
            "category_breakdown": category_rollup,
            "partner_utilization": partner_utilization,
        },
    }
