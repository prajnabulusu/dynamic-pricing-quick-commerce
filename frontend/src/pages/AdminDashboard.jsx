import { useState, useEffect, useCallback } from "react";
import {
  getDashboardStats,
  getNearExpiry,
  getRedistribution,
  getRescueRouting,
  getRecentOrders,
  getAllPrices,
  simulateSpike,
} from "../api";
import axios from "axios";

const api = axios.create({ baseURL: "http://localhost:8000", timeout: 10000 });
const getWeather = () => api.get("/phase-b/weather");
const getColdChainAlerts = () => api.get("/phase-b/cold-chain/alerts");
const getSocialImpact = () => api.get("/phase-b/social-impact");
const getPerishableLife = () => api.get("/phase-b/perishable-lifecycle");

const cx = (...classes) => classes.filter(Boolean).join(" ");

function StatCard({ label, value, sub, accent, theme }) {
  const isDark = theme === "dark";
  const tones = {
    cyan: isDark ? "from-cyan-400/18 to-cyan-500/5 text-cyan-100 ring-cyan-400/15" : "from-cyan-100 to-white text-cyan-900 ring-cyan-100",
    emerald: isDark ? "from-emerald-400/18 to-emerald-500/5 text-emerald-100 ring-emerald-400/15" : "from-emerald-100 to-white text-emerald-900 ring-emerald-100",
    amber: isDark ? "from-amber-400/18 to-amber-500/5 text-amber-100 ring-amber-400/15" : "from-amber-100 to-white text-amber-900 ring-amber-100",
    rose: isDark ? "from-rose-400/18 to-rose-500/5 text-rose-100 ring-rose-400/15" : "from-rose-100 to-white text-rose-900 ring-rose-100",
    violet: isDark ? "from-violet-400/18 to-violet-500/5 text-violet-100 ring-violet-400/15" : "from-violet-100 to-white text-violet-900 ring-violet-100",
    teal: isDark ? "from-teal-400/18 to-teal-500/5 text-teal-100 ring-teal-400/15" : "from-teal-100 to-white text-teal-900 ring-teal-100",
  };

  return (
    <div className={cx(
      "min-w-0 rounded-[26px] bg-gradient-to-br p-4 ring-1",
      tones[accent] || tones.cyan
    )}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] opacity-75">{label}</p>
      <p className="mt-3 break-words text-[clamp(1.2rem,2.4vw,1.875rem)] font-black leading-tight tracking-tight">{value}</p>
      {sub && <p className="mt-2 text-xs opacity-70">{sub}</p>}
    </div>
  );
}

function Section({ title, children, right, theme }) {
  const isDark = theme === "dark";

  return (
    <section className={cx(
      "overflow-hidden rounded-[30px] border shadow-[0_18px_60px_rgba(15,23,42,0.10)]",
      isDark ? "border-white/10 bg-white/[0.04]" : "border-white bg-white/90"
    )}>
      <div className={cx(
        "flex items-center justify-between gap-3 border-b px-5 py-4",
        isDark ? "border-white/10" : "border-slate-100"
      )}>
        <h2 className={cx("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>{title}</h2>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function SeverityPill({ severity, theme }) {
  const isDark = theme === "dark";
  const map = {
    critical: isDark ? "bg-rose-500/15 text-rose-200" : "bg-rose-100 text-rose-700",
    major: isDark ? "bg-orange-500/15 text-orange-200" : "bg-orange-100 text-orange-700",
    minor: isDark ? "bg-amber-500/15 text-amber-200" : "bg-amber-100 text-amber-700",
    none: isDark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-100 text-emerald-700",
  };

  return (
    <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold capitalize", map[severity] || (isDark ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-600"))}>
      {severity}
    </span>
  );
}

function WeatherIcon({ weather }) {
  const icons = {
    Sunny: "Sun",
    Hot: "Heat",
    Rainy: "Rain",
    "Heavy Rain": "Storm",
    Cloudy: "Cloud",
    Drizzle: "Mist",
    Foggy: "Fog",
    Humid: "Humid",
    Monsoon: "Wave",
    Smoggy: "Smog",
    "Cyclone Warning": "Alert",
  };

  return <span className="text-xs font-semibold uppercase tracking-[0.24em] opacity-70">{icons[weather] || "Sky"}</span>;
}

function SpikeSimulator({ products, theme }) {
  const isDark = theme === "dark";
  const [selectedId, setSelectedId] = useState("");
  const [count, setCount] = useState(20);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const run = async () => {
    if (!selectedId) return;
    setLoading(true);
    setResult(null);
    try {
      const { data } = await simulateSpike(Number(selectedId), count);
      setResult({ success: true, msg: data.message });
    } catch (e) {
      setResult({ success: false, msg: e.response?.data?.detail || "Failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className={cx("text-sm leading-6", isDark ? "text-slate-300" : "text-slate-600")}>
        Flood Kafka with synthetic demand for one product and verify that pricing responds on the storefront without changing any backend behavior.
      </p>
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className={cx(
          "w-full rounded-2xl border px-4 py-3 text-sm outline-none",
          isDark ? "border-white/10 bg-slate-900/80 text-slate-100" : "border-slate-200 bg-white text-slate-800"
        )}
      >
        <option value="">Select a product...</option>
        {products.map((product) => (
          <option key={product.product_id} value={product.product_id}>{product.name}</option>
        ))}
      </select>
      <div className={cx(
        "rounded-2xl border px-4 py-4",
        isDark ? "border-white/10 bg-slate-900/75" : "border-slate-100 bg-slate-50"
      )}>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className={isDark ? "text-slate-400" : "text-slate-500"}>Events</span>
          <span className={cx("font-semibold", isDark ? "text-white" : "text-slate-800")}>{count}</span>
        </div>
        <input type="range" min={5} max={50} step={5} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full accent-cyan-400" />
      </div>
      <button
        onClick={run}
        disabled={loading || !selectedId}
        className={cx(
          "w-full rounded-2xl px-4 py-3 text-sm font-semibold transition-all",
          isDark
            ? "bg-orange-400 text-slate-950 hover:bg-orange-300 disabled:bg-slate-800 disabled:text-slate-500"
            : "bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
        )}
      >
        {loading ? "Sending spike..." : `Send ${count} demand events`}
      </button>
      {result && (
        <p className={cx("text-xs font-medium", result.success ? (isDark ? "text-emerald-300" : "text-emerald-600") : (isDark ? "text-rose-300" : "text-rose-500"))}>
          {result.msg}
        </p>
      )}
    </div>
  );
}

function PerishableLifecycle({ items, theme }) {
  const isDark = theme === "dark";
  const statusColors = {
    available: isDark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-100 text-emerald-700",
    discounting: isDark ? "bg-amber-500/15 text-amber-200" : "bg-amber-100 text-amber-700",
    dispatched: isDark ? "bg-cyan-500/15 text-cyan-200" : "bg-cyan-100 text-cyan-700",
    wasted: isDark ? "bg-rose-500/15 text-rose-200" : "bg-rose-100 text-rose-700",
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className={cx("border-b text-xs uppercase tracking-[0.18em]", isDark ? "border-white/10 text-slate-500" : "border-slate-100 text-slate-400")}>
            <th className="pb-3 text-left font-medium">Product</th>
            <th className="pb-3 text-left font-medium">Batch</th>
            <th className="pb-3 text-right font-medium">Qty</th>
            <th className="pb-3 text-right font-medium">Days left</th>
            <th className="pb-3 text-right font-medium">Discount</th>
            <th className="pb-3 text-right font-medium">kg saved</th>
            <th className="pb-3 pl-3 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} className={cx("border-b last:border-0", isDark ? "border-white/6 hover:bg-white/[0.03]" : "border-slate-50 hover:bg-slate-50/80")}>
              <td className={cx("py-3 font-medium", isDark ? "text-slate-100" : "text-slate-800")}>{item.product}</td>
              <td className={cx("py-3 font-mono text-xs", isDark ? "text-slate-400" : "text-slate-400")}>{item.batch_code || "-"}</td>
              <td className={cx("py-3 text-right", isDark ? "text-slate-300" : "text-slate-600")}>{item.quantity}</td>
              <td className="py-3 text-right">
                <span className={cx(
                  "font-semibold",
                  item.days_left <= 1 ? (isDark ? "text-rose-300" : "text-rose-600") : item.days_left <= 2 ? (isDark ? "text-orange-200" : "text-orange-600") : (isDark ? "text-slate-300" : "text-slate-600")
                )}>
                  {item.days_left}d
                </span>
              </td>
              <td className="py-3 text-right">
                {item.discount_pct > 0 ? (
                  <span className={cx("font-semibold", isDark ? "text-emerald-300" : "text-emerald-600")}>-{item.discount_pct}%</span>
                ) : (
                  <span className={isDark ? "text-slate-500" : "text-slate-400"}>-</span>
                )}
              </td>
              <td className={cx("py-3 text-right font-medium", isDark ? "text-teal-200" : "text-teal-600")}>
                {item.kg_saved > 0 ? `${item.kg_saved}kg` : "-"}
              </td>
              <td className="py-3 pl-3">
                <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold", statusColors[item.status] || (isDark ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-600"))}>
                  {item.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ message, theme }) {
  return <p className={cx("text-sm", theme === "dark" ? "text-slate-400" : "text-slate-500")}>{message}</p>;
}

export default function AdminDashboard({ theme }) {
  const isDark = theme === "dark";
  const [stats, setStats] = useState(null);
  const [expiry, setExpiry] = useState([]);
  const [redistrib, setRedistrib] = useState([]);
  const [rescueRouting, setRescueRouting] = useState([]);
  const [rescueSummary, setRescueSummary] = useState(null);
  const [rescueOnboarding, setRescueOnboarding] = useState([]);
  const [rescueAnalytics, setRescueAnalytics] = useState(null);
  const [orders, setOrders] = useState([]);
  const [prices, setPrices] = useState([]);
  const [weather, setWeather] = useState([]);
  const [coldAlerts, setColdAlerts] = useState([]);
  const [impact, setImpact] = useState(null);
  const [perishLife, setPerishLife] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchAll = useCallback(async () => {
    const [s, e, r, rr, o, p, w, ca, si, pl] = await Promise.allSettled([
      getDashboardStats(),
      getNearExpiry(),
      getRedistribution(),
      getRescueRouting(),
      getRecentOrders(),
      getAllPrices(),
      getWeather(),
      getColdChainAlerts(),
      getSocialImpact(),
      getPerishableLife(),
    ]);

    if (s.status === "fulfilled") setStats(s.value.data);
    if (e.status === "fulfilled") setExpiry(e.value.data);
    if (r.status === "fulfilled") setRedistrib(r.value.data);
    if (rr.status === "fulfilled") {
      setRescueRouting(rr.value.data.routes || []);
      setRescueSummary(rr.value.data.summary || null);
      setRescueOnboarding(rr.value.data.onboarding || []);
      setRescueAnalytics(rr.value.data.analytics || null);
    }
    if (o.status === "fulfilled") setOrders(o.value.data);
    if (p.status === "fulfilled") setPrices(p.value.data);
    if (w.status === "fulfilled") setWeather(w.value.data);
    if (ca.status === "fulfilled") setColdAlerts(ca.value.data);
    if (si.status === "fulfilled") setImpact(si.value.data);
    if (pl.status === "fulfilled") setPerishLife(pl.value.data);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 8000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "pricing", label: "Live Pricing" },
    { id: "perishable", label: "Perishable" },
    { id: "weather", label: "Weather" },
    { id: "coldchain", label: "Cold Chain" },
    { id: "impact", label: "Impact" },
    { id: "rescue", label: "Rescue Routing MVP" },
    { id: "simulator", label: "Simulator" },
  ];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className={cx("h-8 w-8 animate-spin rounded-full border-2 border-t-transparent", isDark ? "border-cyan-300" : "border-slate-900")} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <section className={cx(
        "overflow-hidden rounded-[34px] border p-6 shadow-[0_20px_70px_rgba(15,23,42,0.10)]",
        isDark ? "border-white/10 bg-white/[0.04]" : "border-white bg-white/90"
      )}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
          <div>
            <span className={cx(
              "inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em]",
              isDark ? "bg-violet-400/12 text-violet-200" : "bg-violet-50 text-violet-700"
            )}>
              Admin control plane
            </span>
            <h1 className={cx("mt-4 text-3xl font-black tracking-tight sm:text-4xl", isDark ? "text-white" : "text-slate-900")}>
              Operational pricing, freshness, and event visibility
            </h1>
            <p className={cx("mt-3 max-w-3xl text-sm leading-6", isDark ? "text-slate-300" : "text-slate-600")}>
              The dashboard keeps the same live data, but now presents it with clearer grouping, stronger contrast, and a full dark mode designed for long sessions.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className={cx("rounded-2xl border px-4 py-4", isDark ? "border-white/10 bg-slate-900/75" : "border-slate-100 bg-slate-50")}>
              <p className={cx("text-[11px] uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-400")}>Refresh</p>
              <p className={cx("mt-2 text-lg font-black", isDark ? "text-white" : "text-slate-900")}>8 sec</p>
            </div>
            <div className={cx("rounded-2xl border px-4 py-4", isDark ? "border-white/10 bg-slate-900/75" : "border-slate-100 bg-slate-50")}>
              <p className={cx("text-[11px] uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-400")}>Updated</p>
              <p className={cx("mt-2 text-lg font-black", isDark ? "text-white" : "text-slate-900")}>
                {lastRefresh ? lastRefresh.toLocaleTimeString() : "--"}
              </p>
            </div>
          </div>
        </div>

        {coldAlerts.length > 0 && (
          <div className={cx(
            "mt-6 flex items-start gap-4 rounded-2xl border px-4 py-4",
            isDark ? "border-rose-400/15 bg-rose-500/10" : "border-rose-100 bg-rose-50"
          )}>
            <div className={cx("mt-1 h-2.5 w-2.5 rounded-full", isDark ? "bg-rose-300" : "bg-rose-500")} />
            <div>
              <p className={cx("text-sm font-semibold", isDark ? "text-rose-100" : "text-rose-700")}>
                {coldAlerts.length} cold chain breach{coldAlerts.length > 1 ? "es" : ""} detected
              </p>
              <p className={cx("mt-1 text-xs", isDark ? "text-rose-200/80" : "text-rose-600")}>
                {coldAlerts.filter((item) => item.severity === "critical").length} critical and {coldAlerts.filter((item) => item.severity === "major").length} major alerts are currently active.
              </p>
            </div>
          </div>
        )}
      </section>

      <div className={cx(
        "mt-6 flex gap-2 overflow-x-auto rounded-[26px] border p-2 whitespace-nowrap",
        isDark ? "border-white/10 bg-white/[0.04]" : "border-white bg-white/80"
      )}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cx(
              "shrink-0 rounded-2xl px-4 py-2 text-xs font-semibold transition-all",
              activeTab === tab.id
                ? isDark ? "bg-cyan-400 text-slate-950" : "bg-slate-900 text-white"
                : isDark ? "text-slate-300 hover:bg-white/[0.06]" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            {tab.label}
            {tab.id === "coldchain" && coldAlerts.length > 0 && (
              <span className={cx("ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold", isDark ? "bg-rose-500/15 text-rose-200" : "bg-rose-100 text-rose-700")}>
                {coldAlerts.length}
              </span>
            )}
          </button>
        ))}
        <button onClick={fetchAll} className={cx("ml-auto shrink-0 rounded-2xl px-4 py-2 text-xs font-semibold", isDark ? "text-cyan-300" : "text-slate-900")}>
          Refresh now
        </button>
      </div>

      {activeTab === "overview" && (
        <div className="mt-6 space-y-6">
          {stats && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Orders today" value={stats.total_orders_today.toLocaleString()} accent="cyan" theme={theme} />
              <StatCard label="Revenue today" value={`Rs. ${stats.total_revenue_today.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} accent="emerald" theme={theme} />
              <StatCard label="Avg demand" value={`${Math.round(stats.avg_demand_score * 100)}%`} accent="violet" theme={theme} />
              <StatCard label="Low stock" value={stats.low_stock_products} sub="below reorder level" accent={stats.low_stock_products > 0 ? "amber" : "emerald"} theme={theme} />
              <StatCard label="Near expiry" value={stats.near_expiry_products} sub="within 3 days" accent={stats.near_expiry_products > 0 ? "rose" : "emerald"} theme={theme} />
              <StatCard label="Pending dispatch" value={stats.pending_redistributions} accent={stats.pending_redistributions > 0 ? "amber" : "emerald"} theme={theme} />
              {impact && <StatCard label="Food saved" value={`${impact.total_kg_saved}kg`} sub="rescued from waste" accent="teal" theme={theme} />}
              {impact && <StatCard label="CO2 offset" value={`${impact.co2_offset_kg}kg`} accent="emerald" theme={theme} />}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title={`Near-expiry alerts (${expiry.length})`} theme={theme}>
              <div className="space-y-3">
                {expiry.length === 0 ? <EmptyState message="No near-expiry items." theme={theme} /> : expiry.map((item) => (
                  <div key={item.product_id} className={cx("flex items-center justify-between gap-3 rounded-2xl border px-4 py-3", isDark ? "border-white/8 bg-slate-900/70" : "border-slate-100 bg-slate-50/70")}>
                    <div>
                      <p className={cx("text-sm font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>{item.product_name}</p>
                      <p className={cx("mt-1 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{item.quantity} units · {item.expiry_date}</p>
                    </div>
                    <div className="text-right">
                      <p className={cx("text-sm font-semibold", isDark ? "text-white" : "text-slate-800")}>Rs. {item.current_price.toFixed(2)}</p>
                      <span className={cx(
                        "mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                        item.days_left <= 1 ? (isDark ? "bg-rose-500/15 text-rose-200" : "bg-rose-100 text-rose-700") : item.days_left <= 2 ? (isDark ? "bg-orange-500/15 text-orange-200" : "bg-orange-100 text-orange-700") : (isDark ? "bg-amber-500/15 text-amber-200" : "bg-amber-100 text-amber-700")
                      )}>
                        {item.days_left}d
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title={`Redistribution (${redistrib.length})`} theme={theme}>
              <div className="space-y-3">
                {redistrib.length === 0 ? <EmptyState message="No requests yet." theme={theme} /> : redistrib.map((item) => (
                  <div key={item.request_id} className={cx("flex items-center justify-between gap-3 rounded-2xl border px-4 py-3", isDark ? "border-white/8 bg-slate-900/70" : "border-slate-100 bg-slate-50/70")}>
                    <div>
                      <p className={cx("text-sm font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>{item.product_name}</p>
                      <p className={cx("mt-1 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{item.quantity} units · {item.partner_name || "unassigned"}</p>
                    </div>
                    <span className={cx(
                      "rounded-full px-2.5 py-1 text-xs font-semibold",
                      {
                        pending: isDark ? "bg-amber-500/15 text-amber-200" : "bg-amber-100 text-amber-700",
                        accepted: isDark ? "bg-cyan-500/15 text-cyan-200" : "bg-cyan-100 text-cyan-700",
                        completed: isDark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-100 text-emerald-700",
                        in_transit: isDark ? "bg-violet-500/15 text-violet-200" : "bg-violet-100 text-violet-700",
                      }[item.status] || (isDark ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-600")
                    )}>
                      {item.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          <Section title="Recent orders" theme={theme}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className={cx("border-b text-xs uppercase tracking-[0.18em]", isDark ? "border-white/10 text-slate-500" : "border-slate-100 text-slate-400")}>
                    <th className="pb-3 text-left font-medium">Order</th>
                    <th className="pb-3 text-left font-medium">Time</th>
                    <th className="pb-3 text-left font-medium">City</th>
                    <th className="pb-3 text-right font-medium">Items</th>
                    <th className="pb-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.order_id} className={cx("border-b last:border-0", isDark ? "border-white/6 hover:bg-white/[0.03]" : "border-slate-50 hover:bg-slate-50/70")}>
                      <td className={cx("py-3 font-mono text-xs", isDark ? "text-slate-400" : "text-slate-400")}>#{String(order.order_id).padStart(5, "0")}</td>
                      <td className={cx("py-3 text-xs", isDark ? "text-slate-300" : "text-slate-600")}>{new Date(order.timestamp).toLocaleTimeString()}</td>
                      <td className={cx("py-3", isDark ? "text-slate-300" : "text-slate-600")}>{order.city || "-"}</td>
                      <td className={cx("py-3 text-right", isDark ? "text-slate-300" : "text-slate-600")}>{order.item_count}</td>
                      <td className={cx("py-3 text-right font-semibold", isDark ? "text-white" : "text-slate-800")}>Rs. {order.total_amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}

      {activeTab === "pricing" && (
        <div className="mt-6">
          <Section title="Live pricing - all products" theme={theme}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className={cx("border-b text-xs uppercase tracking-[0.18em]", isDark ? "border-white/10 text-slate-500" : "border-slate-100 text-slate-400")}>
                    <th className="pb-3 text-left font-medium">Product</th>
                    <th className="pb-3 text-right font-medium">Base</th>
                    <th className="pb-3 text-right font-medium">Current</th>
                    <th className="pb-3 text-right font-medium">Demand</th>
                    <th className="pb-3 pl-3 text-left font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.map((product) => {
                    const up = product.recommended_price > product.base_price;
                    const down = product.recommended_price < product.base_price;
                    return (
                      <tr key={product.product_id} className={cx("border-b last:border-0", isDark ? "border-white/6 hover:bg-white/[0.03]" : "border-slate-50 hover:bg-slate-50/70")}>
                        <td className={cx("py-3 font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>{product.name}</td>
                        <td className={cx("py-3 text-right", isDark ? "text-slate-400" : "text-slate-400")}>Rs. {product.base_price.toFixed(2)}</td>
                        <td className="py-3 text-right">
                          <span className={cx("font-semibold", up ? (isDark ? "text-rose-300" : "text-rose-600") : down ? (isDark ? "text-emerald-300" : "text-emerald-600") : (isDark ? "text-slate-200" : "text-slate-700"))}>
                            {up ? "UP" : down ? "DOWN" : "FLAT"} Rs. {product.recommended_price.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className={cx("h-2 w-20 overflow-hidden rounded-full", isDark ? "bg-slate-800" : "bg-slate-100")}>
                              <div className={cx("h-full rounded-full", product.demand_score > 0.7 ? "bg-rose-400" : product.demand_score > 0.4 ? "bg-amber-400" : "bg-emerald-400")} style={{ width: `${Math.round(product.demand_score * 100)}%` }} />
                            </div>
                            <span className={cx("w-9 text-right text-xs", isDark ? "text-slate-400" : "text-slate-400")}>{Math.round(product.demand_score * 100)}%</span>
                          </div>
                        </td>
                        <td className={cx("max-w-xs py-3 pl-3 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{product.price_reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}

      {activeTab === "perishable" && (
        <div className="mt-6">
          <Section title="Perishable batch lifecycle" theme={theme}>
            {perishLife.length === 0 ? <EmptyState message="No perishable batch data yet." theme={theme} /> : <PerishableLifecycle items={perishLife} theme={theme} />}
          </Section>
        </div>
      )}

      {activeTab === "weather" && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {weather.map((item) => (
              <div key={item.city} className={cx("rounded-[28px] border p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]", isDark ? "border-white/10 bg-white/[0.04]" : "border-white bg-white/90")}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={cx("text-lg font-semibold", isDark ? "text-white" : "text-slate-900")}>{item.city}</p>
                    <p className={cx("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{item.weather}</p>
                  </div>
                  <WeatherIcon weather={item.weather} />
                </div>
                <p className={cx("mt-5 text-4xl font-black tracking-tight", isDark ? "text-white" : "text-slate-900")}>
                  {item.temperature ? `${item.temperature} C` : "-"}
                </p>
                {item.rain_intensity > 0 && (
                  <div className="mt-4">
                    <div className="mb-2 flex justify-between text-xs">
                      <span className={isDark ? "text-slate-400" : "text-slate-500"}>Rain intensity</span>
                      <span className={cx("font-semibold", isDark ? "text-slate-200" : "text-slate-700")}>{item.rain_intensity}/10</span>
                    </div>
                    <div className={cx("h-2 overflow-hidden rounded-full", isDark ? "bg-slate-800" : "bg-slate-100")}>
                      <div className="h-full rounded-full bg-cyan-400" style={{ width: `${item.rain_intensity * 10}%` }} />
                    </div>
                  </div>
                )}
                {item.event_name && (
                  <div className={cx("mt-4 rounded-2xl px-3 py-2 text-xs font-semibold", isDark ? "bg-violet-400/12 text-violet-200" : "bg-violet-50 text-violet-700")}>
                    {item.event_name} · x{item.demand_multiplier} demand
                  </div>
                )}
              </div>
            ))}
          </div>
          {weather.length === 0 && (
            <div className={cx("rounded-2xl border px-4 py-4 text-sm", isDark ? "border-amber-400/15 bg-amber-500/10 text-amber-200" : "border-amber-100 bg-amber-50 text-amber-700")}>
              No weather data yet. Run <code>python scripts/weather_events_simulator.py</code>.
            </div>
          )}
        </div>
      )}

      {activeTab === "coldchain" && (
        <div className="mt-6 space-y-6">
          {coldAlerts.length > 0 && (
            <Section title="Active breach alerts" theme={theme}>
              <div className="space-y-3">
                {coldAlerts.map((alert, index) => (
                  <div key={index} className={cx("flex items-center justify-between gap-3 rounded-2xl border px-4 py-3", isDark ? "border-white/8 bg-slate-900/70" : "border-slate-100 bg-slate-50/70")}>
                    <div>
                      <p className={cx("text-sm font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>{alert.product}</p>
                      <p className={cx("mt-1 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{alert.store} · {alert.city}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className={cx("text-sm font-semibold", isDark ? "text-rose-300" : "text-rose-600")}>{alert.actual_temp} C</p>
                        <p className={cx("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>required {"<="} {alert.required_temp} C</p>
                      </div>
                      <SeverityPill severity={alert.severity} theme={theme} />
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {coldAlerts.length === 0 && (
            <div className={cx("rounded-2xl border px-4 py-4 text-sm", isDark ? "border-emerald-400/15 bg-emerald-500/10 text-emerald-200" : "border-emerald-100 bg-emerald-50 text-emerald-700")}>
              No active cold chain breaches. All products are within range.
            </div>
          )}
          <div className={cx("rounded-2xl border px-4 py-4 text-xs leading-6", isDark ? "border-amber-400/15 bg-amber-500/10 text-amber-200" : "border-amber-100 bg-amber-50 text-amber-700")}>
            Run <code>python scripts/cold_chain_monitor.py</code> to keep continuous temperature monitoring active.
          </div>
        </div>
      )}

      {activeTab === "impact" && impact && (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard label="Food saved" value={`${impact.total_kg_saved}kg`} sub="from landfill" accent="emerald" theme={theme} />
            <StatCard label="CO2 offset" value={`${impact.co2_offset_kg}kg`} sub="carbon equivalent" accent="teal" theme={theme} />
            <StatCard label="Meals provided" value={impact.meals_equivalent.toLocaleString()} sub="about 400g each" accent="violet" theme={theme} />
            <StatCard label="NGO dispatches" value={impact.total_dispatches} accent="cyan" theme={theme} />
            <StatCard label="Partners active" value={impact.partners_used} accent="cyan" theme={theme} />
            <StatCard label="Recovered revenue" value={`Rs. ${impact.revenue_recovered.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} accent="amber" theme={theme} />
          </div>

          {impact.partners.length > 0 && (
            <Section title="Partner breakdown" theme={theme}>
              <div className="space-y-3">
                {impact.partners.map((partner, index) => (
                  <div key={index} className={cx("flex items-center justify-between gap-3 rounded-2xl border px-4 py-3", isDark ? "border-white/8 bg-slate-900/70" : "border-slate-100 bg-slate-50/70")}>
                    <div>
                      <p className={cx("text-sm font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>{partner.name}</p>
                      <p className={cx("mt-1 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{partner.type}</p>
                    </div>
                    <div className="text-right">
                      <p className={cx("text-sm font-semibold", isDark ? "text-white" : "text-slate-800")}>{partner.units} units</p>
                      <p className={cx("mt-1 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{partner.dispatches} dispatches</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}

      {activeTab === "rescue" && (
        <div className="mt-6 space-y-6">
          {rescueSummary && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
              <StatCard label="Candidates" value={rescueSummary.total_candidates || 0} accent="cyan" theme={theme} />
              <StatCard label="Shelter route" value={rescueSummary.animal_shelter || 0} accent="emerald" theme={theme} />
              <StatCard label="NGO/orphanage" value={rescueSummary.ngo_orphanage || 0} accent="violet" theme={theme} />
              <StatCard label="Compost/biogas" value={rescueSummary.compost_biogas || 0} accent="amber" theme={theme} />
              <StatCard
                label="Needs onboarding"
                value={rescueSummary.needs_onboarding || 0}
                accent={(rescueSummary.needs_onboarding || 0) > 0 ? "rose" : "teal"}
                theme={theme}
              />
              <StatCard label="Meals (est.)" value={rescueSummary.estimated_meals || 0} accent="teal" theme={theme} />
              <StatCard label="CO2 saved" value={`${rescueSummary.estimated_co2_kg || 0}kg`} accent="emerald" theme={theme} />
              <StatCard label="Kg diverted" value={`${rescueSummary.estimated_kg_diverted || 0}kg`} accent="cyan" theme={theme} />
            </div>
          )}

          <Section title={`Rescue routing queue (${rescueRouting.length})`} theme={theme}>
            {rescueRouting.length === 0 ? (
              <EmptyState
                message="No perishable batches need rescue routing in the current time window."
                theme={theme}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1540px] text-sm">
                  <thead>
                    <tr className={cx("border-b text-xs uppercase tracking-[0.18em]", isDark ? "border-white/10 text-slate-500" : "border-slate-100 text-slate-400")}>
                      <th className="pb-3 text-left font-medium">Product</th>
                      <th className="pb-3 text-left font-medium">Category</th>
                      <th className="pb-3 text-right font-medium">Qty</th>
                      <th className="pb-3 text-right font-medium">Days left</th>
                      <th className="pb-3 text-right font-medium">Rescue score</th>
                      <th className="pb-3 text-left font-medium">Route</th>
                      <th className="pb-3 text-left font-medium">Assigned partner</th>
                      <th className="pb-3 text-left font-medium">Distance / ETA</th>
                      <th className="pb-3 text-left font-medium">Pickup by</th>
                      <th className="pb-3 text-left font-medium">Movement</th>
                      <th className="pb-3 text-left font-medium">Contact</th>
                      <th className="pb-3 text-left font-medium">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rescueRouting.map((item) => (
                      <tr key={`${item.batch_id}-${item.product_id}`} className={cx("border-b last:border-0", isDark ? "border-white/6 hover:bg-white/[0.03]" : "border-slate-50 hover:bg-slate-50/70")}>
                        <td className={cx("py-3 font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>{item.product_name}</td>
                        <td className={cx("py-3", isDark ? "text-slate-300" : "text-slate-600")}>{item.category_name}</td>
                        <td className={cx("py-3 text-right", isDark ? "text-slate-300" : "text-slate-600")}>{item.quantity}</td>
                        <td className="py-3 text-right">
                          <span className={cx("rounded-full px-2 py-0.5 text-xs font-semibold", item.days_left < 0 ? (isDark ? "bg-rose-500/15 text-rose-200" : "bg-rose-100 text-rose-700") : item.days_left <= 1 ? (isDark ? "bg-orange-500/15 text-orange-200" : "bg-orange-100 text-orange-700") : (isDark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-100 text-emerald-700"))}>
                            {item.days_left}d
                          </span>
                        </td>
                        <td className={cx("py-3 text-right font-semibold", item.rescue_score >= 85 ? (isDark ? "text-rose-300" : "text-rose-600") : item.rescue_score >= 65 ? (isDark ? "text-amber-200" : "text-amber-700") : (isDark ? "text-emerald-300" : "text-emerald-700"))}>
                          {item.rescue_score}
                        </td>
                        <td className="py-3">
                          <span className={cx("rounded-full px-2 py-0.5 text-xs font-semibold", item.route_channel === "animal_shelter" ? (isDark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-100 text-emerald-700") : item.route_channel === "ngo_orphanage" ? (isDark ? "bg-violet-500/15 text-violet-200" : "bg-violet-100 text-violet-700") : (isDark ? "bg-amber-500/15 text-amber-200" : "bg-amber-100 text-amber-700"))}>
                            {item.route_channel === "animal_shelter" ? "Animal shelter" : item.route_channel === "ngo_orphanage" ? "NGO/Orphanage" : "Compost/Biogas"}
                          </span>
                        </td>
                        <td className={cx("py-3", isDark ? "text-cyan-200" : "text-cyan-700")}>
                          {item.partner_name ? `${item.partner_name} (${item.partner_city || "N/A"})` : "Partner onboarding needed"}
                        </td>
                        <td className={cx("py-3 text-xs", isDark ? "text-slate-300" : "text-slate-600")}>
                          {item.distance_km != null ? `${item.distance_km} km` : "Distance N/A"}
                          {" · "}
                          {item.eta_mins != null ? `${item.eta_mins} min` : "ETA N/A"}
                        </td>
                        <td className={cx("py-3 text-xs", isDark ? "text-slate-300" : "text-slate-600")}>
                          {item.pickup_by || "-"}
                        </td>
                        <td className="py-3">
                          <span className={cx(
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            item.dispatch_status === "in_transit"
                              ? (isDark ? "bg-cyan-500/15 text-cyan-200" : "bg-cyan-100 text-cyan-700")
                              : item.dispatch_status === "completed"
                                ? (isDark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-100 text-emerald-700")
                                : item.dispatch_status === "route_planned" || item.dispatch_status === "accepted" || item.dispatch_status === "pending"
                                  ? (isDark ? "bg-amber-500/15 text-amber-200" : "bg-amber-100 text-amber-700")
                                  : (isDark ? "bg-rose-500/15 text-rose-200" : "bg-rose-100 text-rose-700")
                          )}>
                            {String(item.dispatch_status || "unknown").replace("_", " ")}
                          </span>
                        </td>
                        <td className={cx("py-3", isDark ? "text-slate-300" : "text-slate-600")}>{item.partner_contact || "-"}</td>
                        <td className={cx("max-w-[320px] py-3 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{item.route_reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {rescueAnalytics && (
            <div className="grid gap-6 lg:grid-cols-3">
              <Section title="Urgency Mix" theme={theme}>
                <div className="space-y-2">
                  {Object.entries(rescueAnalytics.urgency_breakdown || {}).map(([k, v]) => (
                    <div key={k} className={cx("flex items-center justify-between rounded-xl px-3 py-2", isDark ? "bg-slate-900/70" : "bg-slate-50")}>
                      <span className={cx("text-xs uppercase", isDark ? "text-slate-400" : "text-slate-500")}>{k}</span>
                      <span className={cx("text-sm font-semibold", isDark ? "text-white" : "text-slate-800")}>{v}</span>
                    </div>
                  ))}
                </div>
              </Section>
              <Section title="City Hotspots" theme={theme}>
                <div className="space-y-2">
                  {(rescueAnalytics.city_breakdown || []).slice(0, 6).map((row) => (
                    <div key={row.city} className={cx("flex items-center justify-between rounded-xl px-3 py-2", isDark ? "bg-slate-900/70" : "bg-slate-50")}>
                      <span className={cx("text-sm", isDark ? "text-slate-200" : "text-slate-700")}>{row.city}</span>
                      <span className={cx("text-sm font-semibold", isDark ? "text-white" : "text-slate-800")}>{row.count}</span>
                    </div>
                  ))}
                </div>
              </Section>
              <Section title="Category Pressure" theme={theme}>
                <div className="space-y-2">
                  {(rescueAnalytics.category_breakdown || []).slice(0, 6).map((row) => (
                    <div key={row.category} className={cx("flex items-center justify-between rounded-xl px-3 py-2", isDark ? "bg-slate-900/70" : "bg-slate-50")}>
                      <span className={cx("text-sm", isDark ? "text-slate-200" : "text-slate-700")}>{row.category}</span>
                      <span className={cx("text-sm font-semibold", isDark ? "text-white" : "text-slate-800")}>{row.count}</span>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}

          {rescueAnalytics && (rescueAnalytics.partner_utilization || []).length > 0 && (
            <Section title="Partner Utilization" theme={theme}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-sm">
                  <thead>
                    <tr className={cx("border-b text-xs uppercase tracking-[0.18em]", isDark ? "border-white/10 text-slate-500" : "border-slate-100 text-slate-400")}>
                      <th className="pb-3 text-left font-medium">Partner</th>
                      <th className="pb-3 text-left font-medium">Type</th>
                      <th className="pb-3 text-left font-medium">City</th>
                      <th className="pb-3 text-right font-medium">Batches</th>
                      <th className="pb-3 text-right font-medium">Assigned Qty</th>
                      <th className="pb-3 text-right font-medium">Capacity</th>
                      <th className="pb-3 text-right font-medium">Utilization</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rescueAnalytics.partner_utilization || []).map((p) => (
                      <tr key={p.partner_id} className={cx("border-b last:border-0", isDark ? "border-white/6 hover:bg-white/[0.03]" : "border-slate-50 hover:bg-slate-50/70")}>
                        <td className={cx("py-3 font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>{p.partner_name}</td>
                        <td className={cx("py-3 text-xs uppercase", isDark ? "text-slate-400" : "text-slate-500")}>{p.partner_type}</td>
                        <td className={cx("py-3", isDark ? "text-slate-300" : "text-slate-600")}>{p.partner_city}</td>
                        <td className={cx("py-3 text-right", isDark ? "text-slate-300" : "text-slate-600")}>{p.assigned_batches}</td>
                        <td className={cx("py-3 text-right", isDark ? "text-slate-300" : "text-slate-600")}>{p.assigned_quantity}</td>
                        <td className={cx("py-3 text-right", isDark ? "text-slate-300" : "text-slate-600")}>{p.capacity}</td>
                        <td className={cx("py-3 text-right font-semibold", p.utilization_pct >= 80 ? (isDark ? "text-rose-300" : "text-rose-600") : p.utilization_pct >= 60 ? (isDark ? "text-amber-200" : "text-amber-700") : (isDark ? "text-emerald-300" : "text-emerald-700"))}>
                          {p.utilization_pct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {rescueOnboarding.length > 0 && (
            <Section title="Partner onboarding gaps" theme={theme}>
              <div className="space-y-3">
                {rescueOnboarding.map((item, index) => (
                  <div key={index} className={cx("rounded-2xl border px-4 py-3", isDark ? "border-amber-400/20 bg-amber-500/10" : "border-amber-100 bg-amber-50/80")}>
                    <p className={cx("text-sm font-semibold", isDark ? "text-amber-200" : "text-amber-700")}>
                      Need partner type: {item.needed_partner_type}
                    </p>
                    <p className={cx("mt-1 text-xs", isDark ? "text-amber-100/80" : "text-amber-700/80")}>{item.why}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}

      {activeTab === "simulator" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <Section title="Demand spike simulator" theme={theme}>
            <SpikeSimulator products={prices.map((product) => ({ product_id: product.product_id, name: product.name }))} theme={theme} />
          </Section>
          <div className={cx("rounded-[30px] border p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]", isDark ? "border-white/10 bg-white/[0.04]" : "border-white bg-white/90")}>
            <p className={cx("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>How it works</p>
            <p className={cx("mt-3 text-sm leading-7", isDark ? "text-slate-300" : "text-slate-600")}>
              The simulator calls <code>/events/spike-simulator/{"{id}"}</code>, which floods the <code>demand_events</code> Kafka topic. The demand consumer detects the spike at &gt;= 5 events within 5 minutes and triggers repricing. Switch to the shop page to watch the updated price surface there.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}



