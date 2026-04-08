const cx = (...classes) => classes.filter(Boolean).join(" ");

export default function SortableRiskTable({ rows, sortBy, sortDirection, onSort, theme }) {
  const isDark = theme === "dark";

  const headers = [
    { key: "product", label: "Product" },
    { key: "category", label: "Category" },
    { key: "risk", label: "Risk" },
    { key: "coverage", label: "Coverage" },
    { key: "demand", label: "Demand" },
    { key: "lostRevenue", label: "Lost Revenue" },
    { key: "lostProfit", label: "Lost Profit" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className={cx("border-b text-xs uppercase tracking-[0.18em]", isDark ? "border-white/10 text-slate-500" : "border-slate-100 text-slate-400")}>
            {headers.map((header) => (
              <th key={header.key} className="px-2 py-3 text-left font-medium">
                <button onClick={() => onSort(header.key)} className="inline-flex items-center gap-1">
                  {header.label}
                  {sortBy === header.key && <span>{sortDirection === "asc" ? "^" : "v"}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.product}-${row.location}`} className={cx("border-b last:border-0", isDark ? "border-white/6 hover:bg-white/[0.03]" : "border-slate-50 hover:bg-slate-50/70")}>
              <td className={cx("px-2 py-3 font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>{row.product}</td>
              <td className={cx("px-2 py-3", isDark ? "text-slate-300" : "text-slate-600")}>{row.category}</td>
              <td className={cx("px-2 py-3 font-semibold", row.risk > 75 ? (isDark ? "text-rose-300" : "text-rose-700") : row.risk > 50 ? (isDark ? "text-amber-300" : "text-amber-700") : (isDark ? "text-emerald-300" : "text-emerald-700"))}>{row.risk.toFixed(1)}</td>
              <td className={cx("px-2 py-3", isDark ? "text-slate-300" : "text-slate-600")}>{row.coverage.toFixed(2)}d</td>
              <td className={cx("px-2 py-3", isDark ? "text-slate-300" : "text-slate-600")}>{row.demand.toFixed(1)}</td>
              <td className={cx("px-2 py-3", isDark ? "text-slate-300" : "text-slate-600")}>Rs. {row.lostRevenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
              <td className={cx("px-2 py-3", isDark ? "text-slate-300" : "text-slate-600")}>Rs. {row.lostProfit.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
