from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

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