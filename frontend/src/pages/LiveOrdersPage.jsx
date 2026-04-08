import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLiveOrderItems } from "../api";

const cx = (...classes) => classes.filter(Boolean).join(" ");
const getRowKey = (row) =>
  `${row.order_id}|${row.product_id}|${row.timestamp}|${row.quantity}|${Number(row.selling_price || 0).toFixed(2)}|${Number(row.line_total || 0).toFixed(2)}`;

export default function LiveOrdersPage({ theme }) {
  const isDark = theme === "dark";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [query, setQuery] = useState("");
  const [flashingKeys, setFlashingKeys] = useState(() => new Set());
  const previousKeysRef = useRef(new Set());
  const flashTimersRef = useRef([]);

  const fetchRows = useCallback(async () => {
    try {
      const { data } = await getLiveOrderItems(1000);
      const nextRows = Array.isArray(data) ? data : [];
      const nextKeys = new Set(nextRows.map(getRowKey));
      const newKeys = nextRows
        .map(getRowKey)
        .filter((key) => previousKeysRef.current.size > 0 && !previousKeysRef.current.has(key));

      setRows(nextRows);
      if (newKeys.length > 0) {
        setFlashingKeys((prev) => new Set([...prev, ...newKeys]));
        const timer = setTimeout(() => {
          setFlashingKeys((prev) => {
            const copy = new Set(prev);
            newKeys.forEach((key) => copy.delete(key));
            return copy;
          });
        }, 2200);
        flashTimersRef.current.push(timer);
      }
      previousKeysRef.current = nextKeys;
      setLastRefresh(new Date());
    } catch {
      // keep existing rows if feed is temporarily unavailable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
    const id = setInterval(fetchRows, 4000);
    const timerBucket = flashTimersRef.current;
    return () => {
      clearInterval(id);
      timerBucket.forEach((timer) => clearTimeout(timer));
    };
  }, [fetchRows]);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      String(row.product_name || "").toLowerCase().includes(term)
      || String(row.order_id || "").includes(term)
      || String(row.product_id || "").includes(term)
    );
  }, [rows, query]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className={cx("h-8 w-8 animate-spin rounded-full border-2 border-t-transparent", isDark ? "border-amber-300" : "border-stone-900")} />
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-8">
      <section className={cx(
        "rounded-[30px] border p-6 shadow-[0_18px_60px_rgba(15,23,42,0.10)]",
        isDark ? "border-slate-700/80 bg-slate-900/72" : "border-white bg-white/90"
      )}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className={cx(
              "inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]",
              isDark ? "bg-amber-400/15 text-amber-100" : "bg-amber-100 text-amber-800"
            )}>
              Live Orders
            </span>
            <h1 className={cx("mt-3 text-3xl font-black tracking-tight", isDark ? "text-white" : "text-slate-900")}>
              Live Orders
            </h1>
            <p className={cx("mt-2 text-sm", isDark ? "text-slate-300" : "text-slate-600")}>
              All order rows in one live view.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by product, order id, product id..."
            className={cx(
              "w-full max-w-md rounded-xl border px-3 py-2 text-sm outline-none",
              isDark ? "border-white/10 bg-slate-900/80 text-slate-100 focus:border-amber-300/40" : "border-slate-200 bg-white text-slate-800 focus:border-amber-500"
            )}
          />
          <p className={cx("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
            {lastRefresh ? `Last refresh: ${lastRefresh.toLocaleTimeString()}` : "Waiting for first refresh..."}
          </p>
          <button
            onClick={fetchRows}
            className={cx(
              "rounded-xl px-3 py-2 text-xs font-semibold",
              isDark ? "bg-amber-300 text-zinc-950 hover:bg-amber-200" : "bg-stone-900 text-white hover:bg-stone-800"
            )}
          >
            Refresh
          </button>
        </div>
      </section>

      <section className={cx(
        "mt-5 rounded-[30px] border p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)]",
        isDark ? "border-slate-700/80 bg-slate-900/72" : "border-white bg-white/90"
      )}>
        {filteredRows.length === 0 ? (
          <p className={cx("px-2 py-10 text-center text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
            No order product records found.
          </p>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className={cx("sticky top-0 border-b text-xs uppercase tracking-[0.18em]", isDark ? "border-white/10 bg-slate-950/90 text-slate-500" : "border-slate-100 bg-white text-slate-400")}>
                  <th className="px-3 py-3 text-left font-medium">Time</th>
                  <th className="px-3 py-3 text-left font-medium">Order</th>
                  <th className="px-3 py-3 text-left font-medium">Product</th>
                  <th className="px-3 py-3 text-right font-medium">Qty</th>
                  <th className="px-3 py-3 text-right font-medium">Unit Price</th>
                  <th className="px-3 py-3 text-right font-medium">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, idx) => {
                  const rowKey = getRowKey(row);
                  const isFlashing = flashingKeys.has(rowKey);
                  return (
                  <tr
                    key={`${row.order_id}-${row.product_id}-${row.timestamp}-${idx}`}
                    className={cx(
                      "border-b last:border-0 transition-colors duration-700",
                      isDark ? "border-white/6 hover:bg-slate-800/70" : "border-slate-50 hover:bg-slate-50/70",
                      isFlashing && (isDark ? "bg-emerald-400/20" : "bg-emerald-100")
                    )}
                  >
                    <td className={cx("px-3 py-3 text-xs", isDark ? "text-slate-300" : "text-slate-600")}>
                      {row.timestamp ? new Date(row.timestamp).toLocaleTimeString() : "--"}
                    </td>
                    <td className={cx("px-3 py-3 font-mono text-xs", isDark ? "text-slate-300" : "text-slate-700")}>
                      #{String(row.order_id).padStart(5, "0")}
                    </td>
                    <td className={cx("px-3 py-3", isDark ? "text-slate-100" : "text-slate-800")}>
                      <p className="font-semibold">{row.product_name}</p>
                      <p className={cx("text-[11px]", isDark ? "text-slate-500" : "text-slate-400")}>Product ID: {row.product_id}</p>
                    </td>
                    <td className={cx("px-3 py-3 text-right font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>{row.quantity}</td>
                    <td className={cx("px-3 py-3 text-right", isDark ? "text-slate-300" : "text-slate-600")}>Rs. {Number(row.selling_price || 0).toFixed(2)}</td>
                    <td className={cx("px-3 py-3 text-right font-semibold", isDark ? "text-amber-200" : "text-amber-700")}>
                      Rs. {Number(row.line_total || 0).toFixed(2)}
                      {isFlashing && (
                        <span className={cx("ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold", isDark ? "bg-emerald-400/25 text-emerald-100" : "bg-emerald-200 text-emerald-800")}>
                          NEW
                        </span>
                      )}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

