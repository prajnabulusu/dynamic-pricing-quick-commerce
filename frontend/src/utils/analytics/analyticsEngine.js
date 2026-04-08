const sortByTimestamp = (rows) => [...rows].sort((a, b) => a.timestamp - b.timestamp);

const sumBy = (rows, accessor) => rows.reduce((sum, row) => sum + accessor(row), 0);

const avgBy = (rows, accessor) => {
  if (!rows.length) return 0;
  return sumBy(rows, accessor) / rows.length;
};

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

export function applyAnalyticsFilters(rows, filters) {
  return (rows || []).filter((row) => {
    if (filters.dateFrom && row.eventDate < filters.dateFrom) return false;
    if (filters.dateTo && row.eventDate > filters.dateTo) return false;
    if (filters.category !== "all" && row.category !== filters.category) return false;
    if (filters.product !== "all" && row.product !== filters.product) return false;
    if (filters.location !== "all" && row.location !== filters.location) return false;
    if (filters.timeBlock !== "all" && row.timeBlock !== filters.timeBlock) return false;
    if (filters.pricingState !== "all" && row.pricingState !== filters.pricingState) return false;
    if (filters.profitBand !== "all" && row.profitBand !== filters.profitBand) return false;
    if (filters.stockRiskBand !== "all" && row.stockRiskBand !== filters.stockRiskBand) return false;
    if (filters.deliveryBand !== "all" && row.deliveryBand !== filters.deliveryBand) return false;
    return true;
  });
}

export function getFilterOptions(rows) {
  const unique = (key) => [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  return {
    categories: unique("category"),
    products: unique("product"),
    locations: unique("location"),
    timeBlocks: unique("timeBlock"),
    pricingStates: unique("pricingState"),
  };
}

export function buildExecutiveMetrics(rows) {
  const ordered = sortByTimestamp(rows);
  const half = Math.floor(ordered.length / 2);
  const previous = ordered.slice(0, half);
  const current = ordered.slice(half);
  const working = current.length ? current : ordered;

  const totalRevenue = sumBy(working, (r) => r.revenue);
  const totalProfit = sumBy(working, (r) => r.profit);
  const baselineProfit = sumBy(working, (r) => r.baselineProfit);
  const baselineRevenue = sumBy(working, (r) => r.baselineRevenue);
  const totalUnits = sumBy(working, (r) => r.quantity);

  const prevRevenue = sumBy(previous, (r) => r.revenue);
  const prevProfit = sumBy(previous, (r) => r.profit);

  const byCategory = aggregateByDimension(working, "category", {
    revenue: (r) => r.revenue,
    profit: (r) => r.profit,
    marginPct: (r) => r.marginPct,
  });

  const top = byCategory[0];
  const weak = byCategory[byCategory.length - 1];

  return {
    totalRevenue,
    totalProfit,
    profitMargin: totalRevenue ? totalProfit / totalRevenue : 0,
    pricingUplift: baselineRevenue ? (totalRevenue - baselineRevenue) / baselineRevenue : 0,
    dynamicPricingImpact: totalProfit - baselineProfit,
    totalUnits,
    avgOrderValue: working.length ? totalRevenue / working.length : 0,
    avgAdjustedPrice: totalUnits ? totalRevenue / totalUnits : 0,
    inventoryStress: avgBy(working, (r) => r.stockRiskScore),
    stockoutRisk: avgBy(working, (r) => r.stockoutProbability),
    deliveryPerformance: avgBy(working, (r) => (r.deliveryBand === "on-time" ? 1 : 0)),
    bestSegment: top?.dimension || "n/a",
    worstSegment: weak?.dimension || "n/a",
    deltaRevenue: prevRevenue ? (totalRevenue - prevRevenue) / prevRevenue : 0,
    deltaProfit: prevProfit ? (totalProfit - prevProfit) / prevProfit : 0,
  };
}

export function aggregateByTime(rows, interval = "day") {
  const bucket = new Map();
  rows.forEach((row) => {
    const date = row.timestamp;
    if (!(date instanceof Date)) return;
    const key = interval === "hour"
      ? `${row.eventDate} ${String(date.getHours()).padStart(2, "0")}:00`
      : row.eventDate;

    const current = bucket.get(key) || {
      time: key,
      revenue: 0,
      profit: 0,
      units: 0,
      avgBasePrice: 0,
      avgAdjustedPrice: 0,
      avgDemand: 0,
      avgMargin: 0,
      avgDelivery: 0,
      count: 0,
    };

    current.revenue += row.revenue;
    current.profit += row.profit;
    current.units += row.quantity;
    current.avgBasePrice += row.basePrice;
    current.avgAdjustedPrice += row.adjustedPrice;
    current.avgDemand += row.demandIntensity;
    current.avgMargin += row.marginPct;
    current.avgDelivery += row.deliveryMinutes;
    current.count += 1;
    bucket.set(key, current);
  });

  return [...bucket.values()]
    .map((entry) => ({
      ...entry,
      avgBasePrice: entry.count ? entry.avgBasePrice / entry.count : 0,
      avgAdjustedPrice: entry.count ? entry.avgAdjustedPrice / entry.count : 0,
      avgDemand: entry.count ? entry.avgDemand / entry.count : 0,
      avgMargin: entry.count ? entry.avgMargin / entry.count : 0,
      avgDelivery: entry.count ? entry.avgDelivery / entry.count : 0,
    }))
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

export function aggregateByDimension(rows, key, metricMap) {
  const bucket = new Map();
  rows.forEach((row) => {
    const dimension = row[key] || "Unknown";
    if (!bucket.has(dimension)) {
      const seed = { dimension, count: 0 };
      Object.keys(metricMap).forEach((metric) => {
        seed[metric] = 0;
      });
      bucket.set(dimension, seed);
    }

    const current = bucket.get(dimension);
    current.count += 1;
    Object.entries(metricMap).forEach(([metric, accessor]) => {
      current[metric] += accessor(row);
    });
  });

  return [...bucket.values()]
    .map((row) => {
      const next = { ...row };
      Object.keys(metricMap).forEach((metric) => {
        if (metric.toLowerCase().includes("avg") || metric.toLowerCase().includes("margin")) {
          next[metric] = row.count ? row[metric] / row.count : 0;
        }
      });
      return next;
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export function buildPriceChangeDistribution(rows) {
  const bins = [
    { band: "<= -5%", low: -Infinity, high: -5, count: 0 },
    { band: "-5% to -1%", low: -5, high: -1, count: 0 },
    { band: "-1% to 1%", low: -1, high: 1, count: 0 },
    { band: "1% to 5%", low: 1, high: 5, count: 0 },
    { band: "> 5%", low: 5, high: Infinity, count: 0 },
  ];

  rows.forEach((row) => {
    const pct = row.priceUpliftPct;
    const bucket = bins.find((bin) => pct > bin.low && pct <= bin.high);
    if (bucket) bucket.count += 1;
  });

  return bins.map((bin) => ({ band: bin.band, count: bin.count }));
}

export function buildStockRiskMatrix(rows) {
  return rows
    .map((row) => ({
      product: row.product,
      category: row.category,
      risk: clamp(row.stockRiskScore, 0, 100),
      coverage: row.inventoryCoverage,
      demand: row.demandIntensity,
      lostRevenue: row.lostRevenueEstimate,
      lostProfit: row.lostProfitEstimate,
      location: row.location,
    }))
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 18);
}

export function buildComparativeMetrics(rows) {
  const dynamic = rows.filter((row) => row.pricingState === "uplift");
  const nonDynamic = rows.filter((row) => row.pricingState !== "uplift");

  const dynamicRevenue = sumBy(dynamic, (r) => r.revenue);
  const dynamicProfit = sumBy(dynamic, (r) => r.profit);
  const baselineRevenue = sumBy(rows, (r) => r.baselineRevenue);
  const baselineProfit = sumBy(rows, (r) => r.baselineProfit);

  return {
    dynamicRevenue,
    dynamicProfit,
    baselineRevenue,
    baselineProfit,
    revenueDelta: baselineRevenue ? (dynamicRevenue - baselineRevenue) / baselineRevenue : 0,
    profitDelta: baselineProfit ? (dynamicProfit - baselineProfit) / baselineProfit : 0,
    upliftShare: rows.length ? dynamic.length / rows.length : 0,
    flatShare: rows.length ? nonDynamic.length / rows.length : 0,
  };
}

export function sortRows(rows, sortBy, sortDirection) {
  const factor = sortDirection === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[sortBy];
    const bv = b[sortBy];
    if (typeof av === "number" && typeof bv === "number") {
      return (av - bv) * factor;
    }
    return String(av).localeCompare(String(bv)) * factor;
  });
}
