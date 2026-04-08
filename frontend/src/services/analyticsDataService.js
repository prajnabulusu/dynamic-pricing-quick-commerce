import { getLiveOrderItems, getProducts, getRecentOrders } from "../api";
import { DEFAULT_ANALYTICS_ASSUMPTIONS, DEFAULT_ANALYTICS_FIELD_MAP } from "../config/analyticsFieldMapping";
import { normalizeAnalyticsRows } from "../utils/analytics/schemaMapper";

function stableFraction(seed) {
  let hash = 0;
  const text = String(seed || "0");
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 1000) / 1000;
}

function csvToRows(csvText) {
  const lines = (csvText || "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() ?? "";
    });
    return row;
  });
}

function buildRowsFromApi({ products, liveItems, recentOrders }) {
  const productById = new Map((products || []).map((product) => [product.product_id, product]));
  const orderById = new Map((recentOrders || []).map((order) => [order.order_id, order]));

  return (liveItems || []).map((line) => {
    const product = productById.get(line.product_id) || {};
    const order = orderById.get(line.order_id) || {};

    const syntheticDeliveryMinutes =
      15
      + stableFraction(`${line.order_id}-${line.product_id}`) * 16
      + (Number(product.demand_score || 0) * 20)
      + (Number(product.stock_quantity || 0) < 18 ? 8 : 0);

    return {
      timestamp: line.timestamp,
      product_id: line.product_id,
      product_name: line.product_name || product.name,
      category_name: product.category_name || "Uncategorized",
      location: order.city || "Primary Store",
      base_price: Number(product.base_price || line.selling_price || 0),
      adjusted_price: Number(line.selling_price || product.current_price || product.base_price || 0),
      quantity: Number(line.quantity || 0),
      line_total: Number(line.line_total || 0),
      cost_price: Number(product.base_price || line.selling_price || 0) * 0.72,
      demand_score: Number(product.demand_score || 0),
      stock_quantity: Number(product.stock_quantity || 0),
      delivery_minutes: Number(syntheticDeliveryMinutes.toFixed(1)),
      price_reason: product.price_reason || "Dynamic update",
      order_id: line.order_id,
    };
  });
}

function buildFallbackRows() {
  const now = Date.now();
  const products = [
    { product: "Cold Coffee", category: "Beverages", base: 38, adj: 42, stock: 24, demand: 0.78 },
    { product: "Instant Noodles", category: "Snacks", base: 20, adj: 23, stock: 14, demand: 0.83 },
    { product: "Curd", category: "Dairy", base: 48, adj: 51, stock: 16, demand: 0.64 },
    { product: "Bread", category: "Essentials", base: 34, adj: 35, stock: 18, demand: 0.58 },
  ];

  const rows = [];
  for (let d = 0; d < 6; d += 1) {
    products.forEach((item, index) => {
      const quantity = 2 + ((d + index) % 7);
      rows.push({
        timestamp: new Date(now - (5 - d) * 86400000 + index * 3600000).toISOString(),
        product_name: item.product,
        category_name: item.category,
        location: "Primary Store",
        base_price: item.base,
        adjusted_price: item.adj + (d % 2),
        quantity,
        line_total: (item.adj + (d % 2)) * quantity,
        demand_score: item.demand,
        stock_quantity: Math.max(6, item.stock - d * 2),
        delivery_minutes: 22 + index * 4 + d,
      });
    });
  }
  return rows;
}

export async function getAnalyticsRecords({
  source = "api",
  csvText = "",
  csvUrl = "",
  fieldMap = DEFAULT_ANALYTICS_FIELD_MAP,
  assumptions = DEFAULT_ANALYTICS_ASSUMPTIONS,
} = {}) {
  if (source === "csv" && (csvText || csvUrl)) {
    let text = csvText;
    if (!text && csvUrl) {
      const response = await fetch(csvUrl);
      text = await response.text();
    }
    const parsed = csvToRows(text);
    return normalizeAnalyticsRows(parsed, fieldMap, assumptions);
  }

  const [productsRes, liveItemsRes, recentRes] = await Promise.allSettled([
    getProducts(),
    getLiveOrderItems(1200),
    getRecentOrders(600),
  ]);

  const products = productsRes.status === "fulfilled" ? productsRes.value.data || [] : [];
  const liveItems = liveItemsRes.status === "fulfilled" ? liveItemsRes.value.data || [] : [];
  const recentOrders = recentRes.status === "fulfilled" ? recentRes.value.data || [] : [];

  const rawRows = liveItems.length
    ? buildRowsFromApi({ products, liveItems, recentOrders })
    : buildFallbackRows();

  return normalizeAnalyticsRows(rawRows, fieldMap, assumptions);
}
