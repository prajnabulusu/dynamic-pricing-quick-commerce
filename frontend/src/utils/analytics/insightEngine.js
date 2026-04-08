const toCurrency = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function buildInsights(rows, metrics, comparative, riskRows) {
  const insights = [];
  if (!rows.length) {
    return [{
      type: "info",
      title: "No analytics records",
      detail: "Data stream is currently empty. Start producer flows or load a CSV/API feed.",
      recommendation: "Validate ingestion source and refresh.",
    }];
  }

  if (metrics.dynamicPricingImpact > 0) {
    insights.push({
      type: "opportunity",
      title: "Dynamic pricing is adding profit",
      detail: `Observed incremental profit impact: ${toCurrency(metrics.dynamicPricingImpact)} against baseline.` ,
      recommendation: "Expand uplift strategy to adjacent categories with similar elasticity signals.",
    });
  } else {
    insights.push({
      type: "risk",
      title: "Dynamic pricing impact is weak",
      detail: "Current dynamic adjustments are not creating a positive profitability gap versus baseline.",
      recommendation: "Review uplift thresholds for low-conversion SKUs and tune price caps.",
    });
  }

  if (metrics.stockoutRisk > 0.45) {
    const exposure = riskRows.slice(0, 3).map((r) => r.product).join(", ");
    insights.push({
      type: "risk",
      title: "Stockout exposure is elevated",
      detail: `Average stockout risk is ${(metrics.stockoutRisk * 100).toFixed(1)}%. Critical items: ${exposure || "n/a"}.`,
      recommendation: "Prioritize replenishment for high-risk products and reduce aggressive uplifts where coverage is low.",
    });
  }

  if (metrics.deliveryPerformance < 0.7) {
    insights.push({
      type: "risk",
      title: "Operational delays may affect conversion",
      detail: `On-time performance is ${(metrics.deliveryPerformance * 100).toFixed(1)}%, below target.`,
      recommendation: "Increase dispatch staffing during high-demand windows and pre-stage fast movers.",
    });
  } else {
    insights.push({
      type: "opportunity",
      title: "Operational execution is supporting growth",
      detail: `On-time performance is ${(metrics.deliveryPerformance * 100).toFixed(1)}% with stable demand fulfillment.`,
      recommendation: "Leverage current delivery performance to safely test incremental pricing experiments.",
    });
  }

  insights.push({
    type: "strategy",
    title: "Highest leverage segment",
    detail: `${metrics.bestSegment} leads contribution under current filters with strong margin realization.`,
    recommendation: "Protect availability and campaign this segment during demand peaks.",
  });

  insights.push({
    type: "strategy",
    title: "Baseline vs dynamic comparison",
    detail: `Revenue delta ${(comparative.revenueDelta * 100).toFixed(1)}%, profit delta ${(comparative.profitDelta * 100).toFixed(1)}% compared to baseline proxy.`,
    recommendation: "Keep a rolling control group to sharpen pricing effectiveness attribution.",
  });

  return insights;
}

export function buildNarrativeSummary(metrics, filters) {
  const activeFilters = Object.entries(filters)
    .filter(([, value]) => value && value !== "all")
    .map(([key, value]) => `${key}: ${value}`)
    .join(" | ");

  return `BI summary: Revenue ${toCurrency(metrics.totalRevenue)}, Profit ${toCurrency(metrics.totalProfit)}, Margin ${(metrics.profitMargin * 100).toFixed(1)}%. Active scope ${activeFilters || "all records"}.`;
}
