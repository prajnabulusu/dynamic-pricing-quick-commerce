import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
  ComposedChart,
} from "recharts";
import { DASHBOARD_TABS, EXECUTIVE_KPI_DEFINITIONS } from "../config/analyticsMetricDefinitions";
import { getInitialAnalyticsFilters } from "../config/analyticsFieldMapping";
import { useAnalyticsData } from "../hooks/useAnalyticsData";
import {
  aggregateByDimension,
  aggregateByTime,
  applyAnalyticsFilters,
  buildComparativeMetrics,
  buildExecutiveMetrics,
  buildPriceChangeDistribution,
  buildStockRiskMatrix,
  getFilterOptions,
  sortRows,
} from "../utils/analytics/analyticsEngine";
import { buildInsights, buildNarrativeSummary } from "../utils/analytics/insightEngine";
import { formatTickDate } from "../utils/analytics/schemaMapper";
import KpiCard from "../components/analytics/KpiCard";
import AnalyticsFilterBar from "../components/analytics/AnalyticsFilterBar";
import { AnalyticsSection, ChartBlock } from "../components/analytics/AnalyticsSection";
import InsightPanel from "../components/analytics/InsightPanel";
import SortableRiskTable from "../components/analytics/SortableRiskTable";

const cx = (...classes) => classes.filter(Boolean).join(" ");

function formatMetric(value, format) {
  if (format === "currency") return `Rs. ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  if (format === "percent") return `${(Number(value || 0) * 100).toFixed(1)}%`;
  if (format === "score") return Number(value || 0).toFixed(1);
  if (format === "number") return Number(value || 0).toLocaleString("en-IN");
  if (format === "text") return String(value || "n/a");
  return String(value || "-");
}

function buildSummaryExport(rows, metrics, comparative) {
  const lines = [
    ["metric", "value"],
    ["total_revenue", metrics.totalRevenue],
    ["total_profit", metrics.totalProfit],
    ["profit_margin", metrics.profitMargin],
    ["pricing_uplift", metrics.pricingUplift],
    ["dynamic_pricing_impact", metrics.dynamicPricingImpact],
    ["avg_order_value", metrics.avgOrderValue],
    ["inventory_stress", metrics.inventoryStress],
    ["stockout_risk", metrics.stockoutRisk],
    ["delivery_performance", metrics.deliveryPerformance],
    ["baseline_revenue", comparative.baselineRevenue],
    ["baseline_profit", comparative.baselineProfit],
    ["records_count", rows.length],
  ];
  return lines.map((row) => row.join(",")).join("\n");
}

function EmptyState({ theme, message }) {
  return (
    <div className={cx("rounded-2xl border px-4 py-6 text-sm", theme === "dark" ? "border-white/10 bg-slate-900/70 text-slate-300" : "border-slate-100 bg-slate-50 text-slate-600")}>
      {message}
    </div>
  );
}

export default function AnalyticsIntelligencePage({ theme }) {
  const isDark = theme === "dark";
  const { rows, loading, error, lastUpdated, refresh } = useAnalyticsData({ source: "api", autoRefreshMs: 18000 });
  const [filters, setFilters] = useState(getInitialAnalyticsFilters);
  const [activeTab, setActiveTab] = useState("overview");
  const [sortBy, setSortBy] = useState("risk");
  const [sortDirection, setSortDirection] = useState("desc");

  const options = useMemo(() => getFilterOptions(rows), [rows]);
  const filteredRows = useMemo(() => applyAnalyticsFilters(rows, filters), [rows, filters]);
  const metrics = useMemo(() => buildExecutiveMetrics(filteredRows), [filteredRows]);
  const comparative = useMemo(() => buildComparativeMetrics(filteredRows), [filteredRows]);
  const trendsByDay = useMemo(() => aggregateByTime(filteredRows, "day"), [filteredRows]);
  const trendsByHour = useMemo(() => aggregateByTime(filteredRows, "hour"), [filteredRows]);

  const categoryRevenue = useMemo(() => aggregateByDimension(filteredRows, "category", {
    revenue: (r) => r.revenue,
    profit: (r) => r.profit,
    avgMargin: (r) => r.marginPct,
    avgUplift: (r) => r.priceUpliftPct,
  }), [filteredRows]);

  const productRevenue = useMemo(() => aggregateByDimension(filteredRows, "product", {
    revenue: (r) => r.revenue,
    profit: (r) => r.profit,
    avgRisk: (r) => r.stockRiskScore,
  }), [filteredRows]);

  const locationPerformance = useMemo(() => aggregateByDimension(filteredRows, "location", {
    revenue: (r) => r.revenue,
    avgDelivery: (r) => r.deliveryMinutes,
    avgRisk: (r) => r.stockRiskScore,
  }), [filteredRows]);

  const priceDistribution = useMemo(() => buildPriceChangeDistribution(filteredRows), [filteredRows]);
  const stockRiskRows = useMemo(() => buildStockRiskMatrix(filteredRows), [filteredRows]);
  const sortedRiskRows = useMemo(() => sortRows(stockRiskRows, sortBy, sortDirection), [stockRiskRows, sortBy, sortDirection]);

  const insights = useMemo(() => buildInsights(filteredRows, metrics, comparative, stockRiskRows), [filteredRows, metrics, comparative, stockRiskRows]);
  const narrativeSummary = useMemo(() => buildNarrativeSummary(metrics, filters), [metrics, filters]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => setFilters(getInitialAnalyticsFilters());

  const toggleSort = (nextKey) => {
    if (nextKey === sortBy) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(nextKey);
    setSortDirection("desc");
  };

  const exportSummary = () => {
    const csv = buildSummaryExport(filteredRows, metrics, comparative);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `analytics-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className={cx("h-8 w-8 animate-spin rounded-full border-2 border-t-transparent", isDark ? "border-cyan-300" : "border-slate-900")} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      <section className={cx("rounded-[34px] border p-6", isDark ? "border-slate-700/80 bg-slate-900/72" : "border-white bg-white/95")}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className={cx("inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]", isDark ? "bg-cyan-400/15 text-cyan-100" : "bg-cyan-100 text-cyan-800")}>Analytics</span>
            <h1 className={cx("mt-3 text-3xl font-black tracking-tight sm:text-4xl", isDark ? "text-white" : "text-slate-900")}>Pricing and Retail Analytics</h1>
            <p className={cx("mt-2 max-w-3xl text-sm leading-6", isDark ? "text-slate-300" : "text-slate-600")}>
              Track pricing, profit, demand, stock risk, and operations in one place.
            </p>
          </div>
          <button onClick={exportSummary} className={cx("rounded-xl px-4 py-2 text-xs font-semibold", isDark ? "bg-amber-300 text-zinc-950" : "bg-slate-900 text-white")}>Download Summary</button>
        </div>
        {error && <p className={cx("mt-3 text-xs", isDark ? "text-rose-200" : "text-rose-700")}>{error}</p>}
      </section>

      <AnalyticsFilterBar
        filters={filters}
        options={options}
        onChange={handleFilterChange}
        onReset={resetFilters}
        onRefresh={refresh}
        lastUpdated={lastUpdated}
        theme={theme}
      />

      <div className={cx("flex gap-2 overflow-x-auto rounded-2xl border p-2", isDark ? "border-slate-700/80 bg-slate-900/72" : "border-white bg-white/90")}>
        {DASHBOARD_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cx(
              "shrink-0 rounded-xl px-3 py-2 text-xs font-semibold",
              activeTab === tab.id
                ? isDark ? "bg-amber-300 text-zinc-950" : "bg-slate-900 text-white"
                : isDark ? "text-slate-300 hover:bg-white/[0.08]" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {(activeTab === "overview" || activeTab === "insights") && (
        <AnalyticsSection
          title="Executive Overview"
          subtitle="Key metrics with quick comparisons"
          right={<span className={cx("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{filteredRows.length} records in scope</span>}
          theme={theme}
        >
          {filteredRows.length === 0 ? <EmptyState theme={theme} message="No records match current filters." /> : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {EXECUTIVE_KPI_DEFINITIONS.map((kpi) => {
                const value = metrics[kpi.id];
                const delta = kpi.id === "totalRevenue" ? metrics.deltaRevenue * 100 : kpi.id === "totalProfit" ? metrics.deltaProfit * 100 : undefined;
                const subLabel = kpi.id === "dynamicPricingImpact" ? "vs baseline" : kpi.id === "inventoryStress" ? "risk index" : "";
                return (
                  <KpiCard
                    key={kpi.id}
                    title={kpi.label}
                    value={formatMetric(value, kpi.format)}
                    delta={delta}
                    subLabel={subLabel}
                    accent={kpi.accent}
                    theme={theme}
                  />
                );
              })}
            </div>
          )}
        </AnalyticsSection>
      )}

      {(activeTab === "pricing" || activeTab === "overview") && (
        <AnalyticsSection title="Pricing Analytics" subtitle="Price trends and pricing impact" theme={theme}>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartBlock title="Base vs Adjusted Price Trend" subtitle="Daily average pricing behavior" theme={theme}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendsByDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.26)"} />
                    <XAxis dataKey="time" tickFormatter={formatTickDate} stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <YAxis stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="avgBasePrice" name="Base Price" stroke="#14b8a6" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="avgAdjustedPrice" name="Adjusted Price" stroke="#f97316" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartBlock>

            <ChartBlock title="Pricing Uplift by Category" subtitle="Average uplift and realized revenue contribution" theme={theme}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={categoryRevenue.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.26)"} />
                    <XAxis dataKey="dimension" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <YAxis yAxisId="left" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <YAxis yAxisId="right" orientation="right" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#22d3ee" radius={[6, 6, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="avgUplift" name="Avg Uplift %" stroke="#fb7185" strokeWidth={2.5} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </ChartBlock>

            <ChartBlock title="Demand vs Uplift" subtitle="How demand and uplift move together" theme={theme}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.26)"} />
                    <XAxis dataKey="demandIntensity" name="Demand" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <YAxis dataKey="priceUpliftPct" name="Price Uplift %" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                    <Scatter data={filteredRows.slice(0, 500)} fill="#38bdf8" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </ChartBlock>

            <ChartBlock title="Price Change Distribution" subtitle="Distribution of price changes" theme={theme}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={priceDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.26)"} />
                    <XAxis dataKey="band" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <YAxis stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartBlock>
          </div>
        </AnalyticsSection>
      )}

      {(activeTab === "profitability" || activeTab === "overview") && (
        <AnalyticsSection title="Profitability Analytics" subtitle="Profit trends and margin quality" theme={theme}>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartBlock title="Revenue vs Profit Trend" subtitle="Daily financial trajectory" theme={theme}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendsByDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.26)"} />
                    <XAxis dataKey="time" tickFormatter={formatTickDate} stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <YAxis stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.24} />
                    <Area type="monotone" dataKey="profit" name="Profit" stroke="#22c55e" fill="#22c55e" fillOpacity={0.22} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartBlock>

            <ChartBlock title="Margin by Category" subtitle="Average margin and profit" theme={theme}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={categoryRevenue.slice(0, 12)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.26)"} />
                    <XAxis dataKey="dimension" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <YAxis yAxisId="left" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <YAxis yAxisId="right" orientation="right" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="profit" name="Profit" fill="#34d399" radius={[6, 6, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="avgMargin" name="Avg Margin %" stroke="#f97316" strokeWidth={2.5} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </ChartBlock>
          </div>
        </AnalyticsSection>
      )}

      {(activeTab === "revenue" || activeTab === "overview") && (
        <AnalyticsSection title="Revenue and Sales" subtitle="Revenue trend and top contributors" theme={theme}>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartBlock title="Revenue and Units Trend" subtitle="Daily commercial flow" theme={theme}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trendsByDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.26)"} />
                    <XAxis dataKey="time" tickFormatter={formatTickDate} stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <YAxis yAxisId="left" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <YAxis yAxisId="right" orientation="right" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                    <Line yAxisId="right" dataKey="units" name="Units" stroke="#a78bfa" strokeWidth={2.5} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </ChartBlock>

            <ChartBlock title="Top Revenue Contributors" subtitle="Top products by revenue" theme={theme}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={productRevenue.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.26)"} />
                    <XAxis type="number" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <YAxis dataKey="dimension" type="category" width={140} stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <Tooltip />
                    <Bar dataKey="revenue" fill="#14b8a6" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartBlock>
          </div>
        </AnalyticsSection>
      )}

      {(activeTab === "inventory" || activeTab === "overview") && (
        <AnalyticsSection title="Inventory Risk" subtitle="Coverage, stockout risk, and potential loss" theme={theme}>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartBlock title="Risk and Lost Revenue by Product" subtitle="Highest risk products" theme={theme}>
              <SortableRiskTable
                rows={sortedRiskRows}
                sortBy={sortBy}
                sortDirection={sortDirection}
                onSort={toggleSort}
                theme={theme}
              />
            </ChartBlock>

            <ChartBlock title="Inventory Coverage vs Demand" subtitle="Coverage and demand view" theme={theme}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.26)"} />
                    <XAxis dataKey="inventoryCoverage" name="Coverage (days)" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <YAxis dataKey="stockRiskScore" name="Risk Score" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <Tooltip />
                    <Scatter data={filteredRows.slice(0, 500)} fill="#fb7185" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </ChartBlock>
          </div>
        </AnalyticsSection>
      )}

      {(activeTab === "demand" || activeTab === "overview") && (
        <AnalyticsSection title="Demand Analytics" subtitle="Demand trend and demand impact" theme={theme}>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartBlock title="Demand Trend (Hourly)" subtitle="Demand by hour" theme={theme}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendsByHour.slice(-36)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.26)"} />
                    <XAxis dataKey="time" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <YAxis stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <Tooltip />
                    <Line type="monotone" dataKey="avgDemand" stroke="#fb923c" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartBlock>

            <ChartBlock title="Demand vs Margin" subtitle="Demand and margin relationship" theme={theme}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.26)"} />
                    <XAxis dataKey="demandIntensity" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <YAxis dataKey="marginPct" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <Tooltip />
                    <Scatter data={filteredRows.slice(0, 500)} fill="#60a5fa" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </ChartBlock>
          </div>
        </AnalyticsSection>
      )}

      {(activeTab === "operations" || activeTab === "overview") && (
        <AnalyticsSection title="Operations" subtitle="Delivery trends and operational impact" theme={theme}>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartBlock title="Delivery Time Trend" subtitle="Average delivery time over time" theme={theme}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendsByDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.26)"} />
                    <XAxis dataKey="time" tickFormatter={formatTickDate} stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <YAxis stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <Tooltip />
                    <Line type="monotone" dataKey="avgDelivery" stroke="#f43f5e" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartBlock>

            <ChartBlock title="Location Comparison" subtitle="Delivery and risk by location" theme={theme}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={locationPerformance}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.26)"} />
                    <XAxis dataKey="dimension" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <YAxis yAxisId="left" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <YAxis yAxisId="right" orientation="right" stroke={isDark ? "#94a3b8" : "#64748b"} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="avgDelivery" name="Avg Delivery (min)" fill="#a78bfa" radius={[6, 6, 0, 0]} />
                    <Line yAxisId="right" dataKey="avgRisk" name="Risk Score" stroke="#f97316" strokeWidth={2.5} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </ChartBlock>
          </div>
        </AnalyticsSection>
      )}

      {(activeTab === "insights" || activeTab === "overview") && (
        <AnalyticsSection title="Insights and Recommendations" subtitle="Auto-generated findings and actions" theme={theme}>
          <div className="grid gap-4 lg:grid-cols-2">
            <InsightPanel insights={insights} summary={narrativeSummary} theme={theme} />
            <div className="space-y-4">
              <ChartBlock title="Baseline vs Dynamic" subtitle="Comparison under current filters" theme={theme}>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { scenario: "Baseline", revenue: comparative.baselineRevenue, profit: comparative.baselineProfit },
                      { scenario: "Dynamic", revenue: comparative.dynamicRevenue, profit: comparative.dynamicProfit },
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.26)"} />
                      <XAxis dataKey="scenario" stroke={isDark ? "#94a3b8" : "#64748b"} />
                      <YAxis stroke={isDark ? "#94a3b8" : "#64748b"} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="revenue" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="profit" fill="#22c55e" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartBlock>

              <ChartBlock title="Top Opportunities" subtitle="Top segments by revenue and margin" theme={theme}>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {categoryRevenue.slice(0, 8).map((entry) => (
                    <div key={entry.dimension} className={cx("rounded-xl border p-3", isDark ? "border-white/10 bg-slate-900/70" : "border-slate-100 bg-slate-50")}>
                      <p className={cx("text-xs uppercase tracking-[0.15em]", isDark ? "text-slate-400" : "text-slate-500")}>{entry.dimension}</p>
                      <p className={cx("mt-1 text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>Rs. {entry.revenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
                      <p className={cx("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Avg margin {entry.avgMargin.toFixed(1)}%</p>
                    </div>
                  ))}
                </div>
              </ChartBlock>
            </div>
          </div>
        </AnalyticsSection>
      )}
    </div>
  );
}

