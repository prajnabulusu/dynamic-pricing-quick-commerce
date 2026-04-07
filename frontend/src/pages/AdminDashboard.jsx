import { useState, useEffect, useCallback } from "react";
import {
  getDashboardStats, getNearExpiry, getRedistribution,
  getRecentOrders, getAllPrices, simulateSpike,
} from "../api";
import axios from "axios";

const api = axios.create({ baseURL: "http://localhost:8000", timeout: 10000 });
const getWeather         = ()  => api.get("/phase-b/weather");
const getColdChainAlerts = ()  => api.get("/phase-b/cold-chain/alerts");
const getSocialImpact    = ()  => api.get("/phase-b/social-impact");
const getCompetitor      = ()  => api.get("/phase-b/competitor-prices");
const getPerishableLife  = ()  => api.get("/phase-b/perishable-lifecycle");

// ── Helpers ───────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "blue" }) {
  const colors = {
    blue:   "bg-blue-50   text-blue-700",
    green:  "bg-green-50  text-green-700",
    amber:  "bg-amber-50  text-amber-700",
    red:    "bg-red-50    text-red-700",
    purple: "bg-purple-50 text-purple-700",
    teal:   "bg-teal-50   text-teal-700",
  };
  return (
    <div className={`rounded-2xl p-4 ${colors[color]}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold leading-tight">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  );
}

function Section({ title, children, right }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800 text-sm">{title}</h2>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function SeverityPill({ severity }) {
  const map = {
    critical: "bg-red-100 text-red-700 animate-pulse",
    major:    "bg-orange-100 text-orange-700",
    minor:    "bg-amber-100 text-amber-700",
    none:     "bg-green-100 text-green-700",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[severity] || "bg-gray-100 text-gray-600"}`}>
      {severity}
    </span>
  );
}

function WeatherIcon({ weather }) {
  const icons = {
    "Sunny": "☀", "Hot": "🌡", "Rainy": "🌧", "Heavy Rain": "⛈",
    "Cloudy": "☁", "Drizzle": "🌦", "Foggy": "🌫", "Humid": "💧",
    "Monsoon": "🌊", "Smoggy": "😶‍🌫", "Cyclone Warning": "🌀",
  };
  return <span style={{ fontSize: 16 }}>{icons[weather] || "🌤"}</span>;
}

// ── Spike simulator widget ────────────────────────────────────────────────────
function SpikeSimulator({ products }) {
  const [selectedId, setSelectedId] = useState("");
  const [count,      setCount]      = useState(20);
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState(null);

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
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-500 leading-relaxed">
        Floods Kafka with view events for one product. Watch the price
        update on the Shop page within 5–10 seconds.
      </p>
      <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
          focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value="">Select a product...</option>
        {products.map((p) => (
          <option key={p.product_id} value={p.product_id}>{p.name}</option>
        ))}
      </select>
      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-500 w-24">Events: {count}</label>
        <input type="range" min={5} max={50} step={5} value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="flex-1" />
      </div>
      <button onClick={run} disabled={loading || !selectedId}
        className="w-full py-2.5 rounded-xl bg-orange-500 text-white font-medium
          text-sm hover:bg-orange-600 disabled:opacity-40 transition-colors">
        {loading ? "Sending spike..." : `Send ${count} demand events →`}
      </button>
      {result && (
        <p className={`text-xs font-medium ${result.success ? "text-green-600" : "text-red-500"}`}>
          {result.msg}
        </p>
      )}
    </div>
  );
}

// ── Perishable lifecycle table ────────────────────────────────────────────────
function PerishableLifecycle({ items }) {
  const statusColors = {
    available:   "bg-green-50  text-green-700",
    discounting: "bg-amber-50  text-amber-700",
    dispatched:  "bg-blue-50   text-blue-700",
    wasted:      "bg-red-50    text-red-700",
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400 border-b border-gray-100">
            <th className="pb-2 text-left font-medium">Product</th>
            <th className="pb-2 text-left font-medium">Batch</th>
            <th className="pb-2 text-right font-medium">Qty</th>
            <th className="pb-2 text-right font-medium">Days left</th>
            <th className="pb-2 text-right font-medium">Discount</th>
            <th className="pb-2 text-right font-medium">kg saved</th>
            <th className="pb-2 text-left font-medium pl-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
              <td className="py-2 font-medium text-gray-800">{item.product}</td>
              <td className="py-2 font-mono text-gray-400">{item.batch_code || "—"}</td>
              <td className="py-2 text-right text-gray-600">{item.quantity}</td>
              <td className="py-2 text-right">
                <span className={`font-semibold ${
                  item.days_left <= 1 ? "text-red-600"
                  : item.days_left <= 2 ? "text-orange-600"
                  : "text-gray-600"
                }`}>{item.days_left}d</span>
              </td>
              <td className="py-2 text-right">
                {item.discount_pct > 0
                  ? <span className="text-green-600 font-medium">-{item.discount_pct}%</span>
                  : <span className="text-gray-400">—</span>
                }
              </td>
              <td className="py-2 text-right text-teal-600 font-medium">
                {item.kg_saved > 0 ? `${item.kg_saved}kg` : "—"}
              </td>
              <td className="py-2 pl-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                  ${statusColors[item.status] || "bg-gray-100 text-gray-600"}`}>
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

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [stats,      setStats]      = useState(null);
  const [expiry,     setExpiry]     = useState([]);
  const [redistrib,  setRedistrib]  = useState([]);
  const [orders,     setOrders]     = useState([]);
  const [prices,     setPrices]     = useState([]);
  const [weather,    setWeather]    = useState([]);
  const [coldAlerts, setColdAlerts] = useState([]);
  const [impact,     setImpact]     = useState(null);
  const [perishLife, setPerishLife] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [lastRefresh,setLastRefresh]= useState(null);
  const [activeTab,  setActiveTab]  = useState("overview");

  const fetchAll = useCallback(async () => {
    const [s,e,r,o,p,w,ca,si,pl] = await Promise.allSettled([
      getDashboardStats(), getNearExpiry(), getRedistribution(),
      getRecentOrders(), getAllPrices(), getWeather(),
      getColdChainAlerts(), getSocialImpact(), getPerishableLife(),
    ]);
    if (s.status==="fulfilled") setStats(s.value.data);
    if (e.status==="fulfilled") setExpiry(e.value.data);
    if (r.status==="fulfilled") setRedistrib(r.value.data);
    if (o.status==="fulfilled") setOrders(o.value.data);
    if (p.status==="fulfilled") setPrices(p.value.data);
    if (w.status==="fulfilled") setWeather(w.value.data);
    if (ca.status==="fulfilled") setColdAlerts(ca.value.data);
    if (si.status==="fulfilled") setImpact(si.value.data);
    if (pl.status==="fulfilled") setPerishLife(pl.value.data);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 20000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const tabs = [
    { id: "overview",   label: "Overview" },
    { id: "pricing",    label: "Live Pricing" },
    { id: "perishable", label: "Perishable" },
    { id: "weather",    label: "Weather & Events" },
    { id: "coldchain",  label: "Cold Chain" },
    { id: "impact",     label: "Social Impact" },
    { id: "simulator",  label: "Spike Simulator" },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Auto-refreshes every 20s{lastRefresh && ` · ${lastRefresh.toLocaleTimeString()}`}
          </p>
        </div>
        <button onClick={fetchAll} className="text-xs text-blue-600 hover:underline">
          Refresh now
        </button>
      </div>

      {/* Cold chain alert banner */}
      {coldAlerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4
          flex items-start gap-3">
          <span className="text-red-500 font-bold text-sm mt-0.5">!</span>
          <div>
            <p className="text-sm font-semibold text-red-700">
              {coldAlerts.length} cold chain breach{coldAlerts.length > 1 ? "es" : ""} detected
            </p>
            <p className="text-xs text-red-500 mt-0.5">
              {coldAlerts.filter(a=>a.severity==="critical").length} critical ·{" "}
              {coldAlerts.filter(a=>a.severity==="major").length} major.
              Emergency discounts applied automatically.
            </p>
          </div>
        </div>
      )}

      {/* Tab nav */}
      <div className="flex gap-1 flex-wrap mb-5 bg-gray-100 p-1 rounded-xl">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === t.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
            {t.id === "coldchain" && coldAlerts.length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full
                px-1.5 py-0.5">{coldAlerts.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatCard label="Orders today" value={stats.total_orders_today.toLocaleString()} color="blue" />
              <StatCard label="Revenue today" value={`₹${stats.total_revenue_today.toLocaleString("en-IN",{maximumFractionDigits:0})}`} color="green" />
              <StatCard label="Avg demand" value={`${Math.round(stats.avg_demand_score*100)}%`} color="purple" />
              <StatCard label="Low stock" value={stats.low_stock_products} sub="below reorder level" color={stats.low_stock_products>0?"amber":"green"} />
              <StatCard label="Near expiry" value={stats.near_expiry_products} sub="within 3 days" color={stats.near_expiry_products>0?"red":"green"} />
              <StatCard label="Pending dispatch" value={stats.pending_redistributions} color={stats.pending_redistributions>0?"amber":"green"} />
              {impact && <StatCard label="Food saved" value={`${impact.total_kg_saved}kg`} sub="from waste" color="teal" />}
              {impact && <StatCard label="CO₂ offset" value={`${impact.co2_offset_kg}kg`} color="green" />}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Section title={`Near-expiry alerts (${expiry.length})`}>
              {expiry.length === 0
                ? <p className="text-sm text-gray-400">No near-expiry items.</p>
                : expiry.map((item) => (
                  <div key={item.product_id} className="flex items-center justify-between
                    py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="font-medium text-sm text-gray-800">{item.product_name}</p>
                      <p className="text-xs text-gray-400">{item.quantity} units · {item.expiry_date}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-700">₹{item.current_price.toFixed(2)}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        item.days_left<=1?"bg-red-100 text-red-700":item.days_left<=2?"bg-orange-100 text-orange-700":"bg-amber-100 text-amber-700"
                      }`}>{item.days_left}d</span>
                    </div>
                  </div>
                ))
              }
            </Section>

            <Section title={`Redistribution (${redistrib.length})`}>
              {redistrib.length === 0
                ? <p className="text-sm text-gray-400">No requests yet.</p>
                : redistrib.map((r) => (
                  <div key={r.request_id} className="flex items-center justify-between
                    py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="font-medium text-sm text-gray-800">{r.product_name}</p>
                      <p className="text-xs text-gray-400">{r.quantity} units · {r.partner_name||"unassigned"}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      {pending:"bg-amber-100 text-amber-700",accepted:"bg-blue-100 text-blue-700",
                       completed:"bg-green-100 text-green-700",in_transit:"bg-purple-100 text-purple-700"}
                      [r.status]||"bg-gray-100 text-gray-600"}`}>
                      {r.status.replace("_"," ")}
                    </span>
                  </div>
                ))
              }
            </Section>
          </div>

          {/* Recent orders */}
          <Section title="Recent orders">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="pb-2 text-left font-medium">Order</th>
                    <th className="pb-2 text-left font-medium">Time</th>
                    <th className="pb-2 text-left font-medium">City</th>
                    <th className="pb-2 text-right font-medium">Items</th>
                    <th className="pb-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.order_id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 font-mono text-gray-400 text-xs">#{String(o.order_id).padStart(5,"0")}</td>
                      <td className="py-2 text-xs text-gray-600">{new Date(o.timestamp).toLocaleTimeString()}</td>
                      <td className="py-2 text-gray-600">{o.city||"—"}</td>
                      <td className="py-2 text-right text-gray-600">{o.item_count}</td>
                      <td className="py-2 text-right font-semibold text-gray-800">₹{o.total_amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}

      {/* ── Live pricing tab ── */}
      {activeTab === "pricing" && (
        <Section title="Live pricing — all products">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 text-left font-medium">Product</th>
                  <th className="pb-2 text-right font-medium">Base</th>
                  <th className="pb-2 text-right font-medium">Current</th>
                  <th className="pb-2 text-right font-medium">Demand</th>
                  <th className="pb-2 text-left pl-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((p) => {
                  const up = p.recommended_price > p.base_price;
                  const dn = p.recommended_price < p.base_price;
                  return (
                    <tr key={p.product_id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="py-2.5 font-medium text-gray-800">{p.name}</td>
                      <td className="py-2.5 text-right text-gray-400">₹{p.base_price.toFixed(2)}</td>
                      <td className="py-2.5 text-right">
                        <span className={`font-semibold ${up?"text-red-600":dn?"text-green-600":"text-gray-700"}`}>
                          {up?"▲":dn?"▼":"─"} ₹{p.recommended_price.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${p.demand_score>0.7?"bg-red-400":p.demand_score>0.4?"bg-amber-400":"bg-green-400"}`}
                              style={{width:`${Math.round(p.demand_score*100)}%`}} />
                          </div>
                          <span className="text-xs text-gray-400 w-7 text-right">{Math.round(p.demand_score*100)}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 pl-3 text-xs text-gray-400 max-w-xs truncate">{p.price_reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ── Perishable lifecycle tab ── */}
      {activeTab === "perishable" && (
        <Section title="Perishable batch lifecycle">
          {perishLife.length === 0
            ? <p className="text-sm text-gray-400">No perishable batch data yet.</p>
            : <PerishableLifecycle items={perishLife} />
          }
        </Section>
      )}

      {/* ── Weather & events tab ── */}
      {activeTab === "weather" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {weather.map((w) => (
              <div key={w.city} className="bg-white border border-gray-100 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-900">{w.city}</span>
                  <WeatherIcon weather={w.weather} />
                </div>
                <p className="text-2xl font-bold text-gray-800">
                  {w.temperature ? `${w.temperature}°C` : "—"}
                </p>
                <p className="text-sm text-gray-500 mt-1">{w.weather}</p>
                {w.rain_intensity > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Rain intensity</span>
                      <span>{w.rain_intensity}/10</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full"
                        style={{width:`${w.rain_intensity*10}%`}} />
                    </div>
                  </div>
                )}
                {w.event_name && (
                  <div className="mt-2 bg-purple-50 text-purple-700 text-xs font-medium
                    px-2 py-1 rounded-lg">
                    {w.event_name} · ×{w.demand_multiplier} demand
                  </div>
                )}
              </div>
            ))}
          </div>
          {weather.length === 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700">
              No weather data yet. Run: <code className="bg-amber-100 px-1 rounded">python scripts/weather_events_simulator.py</code>
            </div>
          )}
        </div>
      )}

      {/* ── Cold chain tab ── */}
      {activeTab === "coldchain" && (
        <div className="space-y-5">
          {coldAlerts.length > 0 && (
            <Section title="Active breach alerts">
              <div className="flex flex-col gap-3">
                {coldAlerts.map((a, i) => (
                  <div key={i} className="flex items-center justify-between py-2
                    border-b border-gray-50 last:border-0">
                    <div>
                      <p className="font-medium text-sm text-gray-800">{a.product}</p>
                      <p className="text-xs text-gray-400">{a.store} · {a.city}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-red-600">
                          {a.actual_temp}°C
                        </p>
                        <p className="text-xs text-gray-400">
                          required ≤{a.required_temp}°C
                        </p>
                      </div>
                      <SeverityPill severity={a.severity} />
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {coldAlerts.length === 0 && (
            <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-sm text-green-700">
              No active cold chain breaches. All products within temperature range.
            </div>
          )}
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-700">
            Run <code className="bg-amber-100 px-1 rounded">python scripts/cold_chain_monitor.py</code> to start continuous temperature monitoring.
          </div>
        </div>
      )}

      {/* ── Social impact tab ── */}
      {activeTab === "impact" && impact && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Food saved" value={`${impact.total_kg_saved}kg`} sub="from landfill" color="green" />
            <StatCard label="CO₂ offset" value={`${impact.co2_offset_kg}kg`} sub="carbon equivalent" color="teal" />
            <StatCard label="Meals provided" value={impact.meals_equivalent.toLocaleString()} sub="≈400g per meal" color="purple" />
            <StatCard label="NGO dispatches" value={impact.total_dispatches} color="blue" />
            <StatCard label="Partners active" value={impact.partners_used} color="blue" />
            <StatCard label="Revenue recovered" value={`₹${impact.revenue_recovered.toLocaleString("en-IN",{maximumFractionDigits:0})}`} sub="from near-expiry sales" color="amber" />
          </div>

          {impact.partners.length > 0 && (
            <Section title="Partner breakdown">
              <div className="flex flex-col gap-3">
                {impact.partners.map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-2
                    border-b border-gray-50 last:border-0">
                    <div>
                      <p className="font-medium text-sm text-gray-800">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.type}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm text-gray-700">{p.units} units</p>
                      <p className="text-xs text-gray-400">{p.dispatches} dispatches</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}

      {/* ── Spike simulator tab ── */}
      {activeTab === "simulator" && (
        <div className="max-w-md">
          <Section title="Demand spike simulator">
            <SpikeSimulator products={prices.map(p=>({product_id:p.product_id,name:p.name}))} />
          </Section>
          <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700 leading-relaxed">
            <p className="font-semibold mb-1">How it works</p>
            <p>The simulator calls <code className="bg-blue-100 px-1 rounded">/events/spike-simulator/{"{id}"}</code> which floods the <code className="bg-blue-100 px-1 rounded">demand_events</code> Kafka topic. The demand consumer detects the spike (≥5 events/5min) and triggers the pricing engine. Switch to the Shop page to watch the price update in real time.</p>
          </div>
        </div>
      )}
    </div>
  );
}