export const DEFAULT_ANALYTICS_FIELD_MAP = {
  timestamp: ["timestamp", "event_time", "order_timestamp", "created_at", "date"],
  product: ["product_name", "name", "product", "sku", "item", "product_id"],
  productId: ["product_id", "sku_id", "item_id"],
  category: ["category_name", "category", "product_category"],
  location: ["location", "city", "warehouse", "store", "hub"],
  basePrice: ["base_price", "list_price", "price_base"],
  adjustedPrice: ["adjusted_price", "recommended_price", "selling_price", "current_price", "dynamic_price"],
  cost: ["cost", "cost_price", "unit_cost", "procurement_cost"],
  quantity: ["quantity", "units", "units_sold", "qty"],
  revenue: ["line_total", "revenue", "order_value", "sales"],
  profit: ["profit", "gross_profit", "contribution"],
  margin: ["margin", "gross_margin", "margin_pct"],
  demand: ["demand_score", "demand_units", "demand", "views"],
  inventory: ["stock_quantity", "inventory_units", "stock", "available_qty"],
  deliveryMinutes: ["delivery_minutes", "delivery_time", "eta_minutes", "fulfillment_minutes"],
  pricingState: ["pricing_state", "price_state"],
};

export const DEFAULT_ANALYTICS_ASSUMPTIONS = {
  inferredCostRatio: 0.72,
  lowCoverageThreshold: 3,
  highRiskScoreThreshold: 70,
  onTimeDeliveryTargetMin: 30,
};

export const TIME_BLOCKS = ["Night", "Morning", "Afternoon", "Evening"];

export function getInitialAnalyticsFilters() {
  return {
    dateFrom: "",
    dateTo: "",
    category: "all",
    product: "all",
    location: "all",
    timeBlock: "all",
    pricingState: "all",
    profitBand: "all",
    stockRiskBand: "all",
    deliveryBand: "all",
  };
}
