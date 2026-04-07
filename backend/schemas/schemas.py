from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ── Products ──────────────────────────────────────────────────────────────────

class ProductResponse(BaseModel):
    product_id:       int
    name:             str
    category_name:    str
    brand:            Optional[str]
    base_price:       float
    current_price:    float          # latest dynamic price
    demand_score:     Optional[float]
    price_reason:     Optional[str]
    stock_quantity:   int
    is_perishable:    bool
    shelf_life_days:  Optional[int]

    class Config:
        from_attributes = True


# ── Orders ────────────────────────────────────────────────────────────────────

class OrderItemRequest(BaseModel):
    product_id: int = Field(..., gt=0, description="Must be a valid product ID")
    quantity:   int = Field(..., gt=0, le=100)


class PlaceOrderRequest(BaseModel):
    location_id: int = Field(..., gt=0)
    items:       list[OrderItemRequest] = Field(..., min_length=1)


class OrderItemResponse(BaseModel):
    product_id:    int
    product_name:  str
    quantity:      int
    selling_price: float
    subtotal:      float


class PlaceOrderResponse(BaseModel):
    success:     bool
    message:     str
    order_id:    Optional[int]
    total_amount: float
    items:       list[OrderItemResponse]


# ── Pricing ───────────────────────────────────────────────────────────────────

class PriceResponse(BaseModel):
    product_id:        int
    product_name:      str
    base_price:        float
    recommended_price: float
    demand_score:      float
    stock_factor:      float
    expiry_factor:     float
    final_margin:      float
    price_reason:      str
    last_updated:      Optional[datetime]


class PriceHistoryItem(BaseModel):
    old_price:     float
    new_price:     float
    change_reason: str
    timestamp:     datetime


# ── Dashboard ─────────────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_orders_today:       int
    total_revenue_today:      float
    avg_demand_score:         float
    low_stock_products:       int
    near_expiry_products:     int
    pending_redistributions:  int
    top_selling_product:      Optional[str]
    most_dynamic_product:     Optional[str]   # biggest price swing today


class NearExpiryItem(BaseModel):
    product_id:   int
    product_name: str
    days_left:    int
    quantity:     int
    expiry_date:  str
    current_price: float


class RedistributionItem(BaseModel):
    request_id:   int
    product_name: str
    quantity:     int
    expiry_date:  str
    status:       str
    partner_name: Optional[str]