import { DEFAULT_ANALYTICS_ASSUMPTIONS, DEFAULT_ANALYTICS_FIELD_MAP } from "../../config/analyticsFieldMapping";

const numberFields = [
  "basePrice",
  "adjustedPrice",
  "cost",
  "quantity",
  "revenue",
  "profit",
  "margin",
  "demand",
  "inventory",
  "deliveryMinutes",
];

function getFirstPresentValue(row, candidates) {
  for (const key of candidates || []) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }
  return undefined;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTimeBlock(hour) {
  if (hour < 6) return "Night";
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  if (hour < 22) return "Evening";
  return "Night";
}

function getPricingState(basePrice, adjustedPrice, explicitState) {
  if (explicitState) return String(explicitState);
  if (adjustedPrice > basePrice + 0.01) return "uplift";
  if (adjustedPrice < basePrice - 0.01) return "discount";
  return "flat";
}

function getBand(value, thresholds) {
  if (value >= thresholds.high) return "high";
  if (value >= thresholds.medium) return "medium";
  return "low";
}

function safeDivide(a, b) {
  if (!b || Number.isNaN(b)) return 0;
  return a / b;
}

export function mapRecordToBusinessFields(row, fieldMap = DEFAULT_ANALYTICS_FIELD_MAP) {
  const mapped = {
    timestamp: toTimestamp(getFirstPresentValue(row, fieldMap.timestamp)),
    product: getFirstPresentValue(row, fieldMap.product) || "Unknown Product",
    productId: getFirstPresentValue(row, fieldMap.productId) || null,
    category: getFirstPresentValue(row, fieldMap.category) || "Uncategorized",
    location: getFirstPresentValue(row, fieldMap.location) || "Single Store",
    pricingState: getFirstPresentValue(row, fieldMap.pricingState) || "",
  };

  numberFields.forEach((field) => {
    mapped[field] = toNumber(getFirstPresentValue(row, fieldMap[field]), 0);
  });

  return mapped;
}

export function normalizeAnalyticsRows(rawRows, fieldMap = DEFAULT_ANALYTICS_FIELD_MAP, assumptions = DEFAULT_ANALYTICS_ASSUMPTIONS) {
  return (rawRows || [])
    .map((row, index) => {
      const mapped = mapRecordToBusinessFields(row, fieldMap);

      if (!mapped.timestamp) {
        return null;
      }

      const quantity = Math.max(1, mapped.quantity || 1);
      const basePrice = mapped.basePrice || mapped.adjustedPrice || 0;
      const adjustedPrice = mapped.adjustedPrice || mapped.basePrice || 0;
      const inferredCost = mapped.cost || basePrice * assumptions.inferredCostRatio;
      const revenue = mapped.revenue || adjustedPrice * quantity;
      const baselineRevenue = basePrice * quantity;
      const profit = mapped.profit || (adjustedPrice - inferredCost) * quantity;
      const baselineProfit = (basePrice - inferredCost) * quantity;
      const margin = mapped.margin || safeDivide(profit, revenue);
      const priceUpliftPct = safeDivide(adjustedPrice - basePrice, basePrice) * 100;

      const demandIntensity = mapped.demand > 1 ? mapped.demand : mapped.demand * 100;
      const dailyDemandProxy = Math.max(1, quantity + demandIntensity * 0.12);
      const inventoryCoverage = safeDivide(mapped.inventory, dailyDemandProxy);
      const stockRiskScore = Math.max(0, Math.min(100, 100 - inventoryCoverage * 16 + demandIntensity * 0.18));
      const stockoutProbability = Math.max(0, Math.min(1, stockRiskScore / 100));
      const lostRevenueEstimate = stockRiskScore > 60 ? baselineRevenue * (stockRiskScore / 100) * 0.45 : 0;
      const lostProfitEstimate = stockRiskScore > 60 ? baselineProfit * (stockRiskScore / 100) * 0.45 : 0;

      const deliveryMinutes = mapped.deliveryMinutes || 0;
      const deliveryPerformanceBand =
        deliveryMinutes === 0 ? "unknown" : deliveryMinutes <= assumptions.onTimeDeliveryTargetMin ? "on-time" : deliveryMinutes <= 45 ? "watch" : "delayed";

      const timeBlock = getTimeBlock(mapped.timestamp.getHours());

      return {
        id: `${mapped.productId || mapped.product}-${mapped.timestamp.toISOString()}-${index}`,
        ...mapped,
        quantity,
        basePrice,
        adjustedPrice,
        cost: inferredCost,
        revenue,
        baselineRevenue,
        profit,
        baselineProfit,
        margin,
        marginPct: margin * 100,
        priceUpliftPct,
        demandIntensity,
        inventoryCoverage,
        stockRiskScore,
        stockoutProbability,
        lostRevenueEstimate,
        lostProfitEstimate,
        pricingState: getPricingState(basePrice, adjustedPrice, mapped.pricingState),
        profitBand: getBand(margin * 100, { medium: 12, high: 22 }),
        stockRiskBand: getBand(stockRiskScore, { medium: 45, high: 70 }),
        deliveryBand: deliveryPerformanceBand,
        timeBlock,
        eventDate: mapped.timestamp.toISOString().slice(0, 10),
      };
    })
    .filter(Boolean);
}

export function formatTickDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
