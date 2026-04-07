from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.models.database import get_db
from backend.schemas.schemas import ProductResponse, PriceHistoryItem

router = APIRouter(prefix="/products", tags=["Products"])


@router.get("/", response_model=list[ProductResponse])
def get_all_products(db: Session = Depends(get_db)):
    """
    Returns all products with their current dynamic price.
    This is the main endpoint the frontend product listing page calls.
    """
    rows = db.execute(text("""
        SELECT
            p.product_id,
            p.name,
            c.category_name,
            p.brand,
            p.base_price,
            COALESCE(
                (SELECT pr.recommended_price
                 FROM pricing pr
                 WHERE pr.product_id = p.product_id
                 ORDER BY pr.created_at DESC
                 LIMIT 1),
                p.base_price
            )                          AS current_price,
            (SELECT pr.demand_score
             FROM pricing pr
             WHERE pr.product_id = p.product_id
             ORDER BY pr.created_at DESC
             LIMIT 1)                  AS demand_score,
            (SELECT pr.price_reason
             FROM pricing pr
             WHERE pr.product_id = p.product_id
             ORDER BY pr.created_at DESC
             LIMIT 1)                  AS price_reason,
            COALESCE(i.stock_quantity, 0) AS stock_quantity,
            p.is_perishable,
            p.shelf_life_days
        FROM products p
        JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN inventory i ON p.product_id = i.product_id
        ORDER BY c.category_name, p.name;
    """)).fetchall()

    return [
        ProductResponse(
            product_id=r.product_id,
            name=r.name,
            category_name=r.category_name,
            brand=r.brand,
            base_price=float(r.base_price),
            current_price=float(r.current_price),
            demand_score=float(r.demand_score) if r.demand_score else None,
            price_reason=r.price_reason,
            stock_quantity=r.stock_quantity,
            is_perishable=r.is_perishable,
            shelf_life_days=r.shelf_life_days,
        )
        for r in rows
    ]


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(product_id: int, db: Session = Depends(get_db)):
    """Returns a single product with current dynamic price."""
    row = db.execute(text("""
        SELECT
            p.product_id,
            p.name,
            c.category_name,
            p.brand,
            p.base_price,
            COALESCE(
                (SELECT pr.recommended_price FROM pricing pr
                 WHERE pr.product_id = p.product_id
                 ORDER BY pr.created_at DESC LIMIT 1),
                p.base_price
            ) AS current_price,
            (SELECT pr.demand_score FROM pricing pr
             WHERE pr.product_id = p.product_id
             ORDER BY pr.created_at DESC LIMIT 1) AS demand_score,
            (SELECT pr.price_reason FROM pricing pr
             WHERE pr.product_id = p.product_id
             ORDER BY pr.created_at DESC LIMIT 1) AS price_reason,
            COALESCE(i.stock_quantity, 0) AS stock_quantity,
            p.is_perishable,
            p.shelf_life_days
        FROM products p
        JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN inventory i ON p.product_id = i.product_id
        WHERE p.product_id = :pid
        LIMIT 1;
    """), {"pid": product_id}).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Product not found")

    return ProductResponse(
        product_id=row.product_id,
        name=row.name,
        category_name=row.category_name,
        brand=row.brand,
        base_price=float(row.base_price),
        current_price=float(row.current_price),
        demand_score=float(row.demand_score) if row.demand_score else None,
        price_reason=row.price_reason,
        stock_quantity=row.stock_quantity,
        is_perishable=row.is_perishable,
        shelf_life_days=row.shelf_life_days,
    )


@router.get("/{product_id}/price-history",
            response_model=list[PriceHistoryItem])
def get_price_history(
    product_id: int,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """Returns the last N price changes for a product — used for trend charts."""
    rows = db.execute(text("""
        SELECT ph.old_price, ph.new_price, ph.change_reason, ph.timestamp
        FROM price_history ph
        WHERE ph.product_id = :pid
        ORDER BY ph.timestamp DESC
        LIMIT :lim;
    """), {"pid": product_id, "lim": limit}).fetchall()

    return [
        PriceHistoryItem(
            old_price=float(r.old_price),
            new_price=float(r.new_price),
            change_reason=r.change_reason,
            timestamp=r.timestamp,
        )
        for r in rows
    ]