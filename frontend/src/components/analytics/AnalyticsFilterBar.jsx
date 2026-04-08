const cx = (...classes) => classes.filter(Boolean).join(" ");

function SelectField({ label, value, onChange, options, theme }) {
  const isDark = theme === "dark";
  return (
    <label className="flex flex-col gap-1">
      <span className={cx("text-[11px] font-semibold uppercase tracking-[0.18em]", isDark ? "text-slate-400" : "text-slate-500")}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cx("rounded-xl border px-3 py-2 text-sm outline-none", isDark ? "border-white/10 bg-slate-900/70 text-slate-100" : "border-slate-200 bg-white text-slate-800")}
      >
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

export default function AnalyticsFilterBar({ filters, options, onChange, onReset, onRefresh, lastUpdated, theme }) {
  const isDark = theme === "dark";

  return (
    <section className={cx("rounded-[30px] border p-5", isDark ? "border-slate-700/80 bg-slate-900/72" : "border-white bg-white/95")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={cx("text-base font-bold", isDark ? "text-white" : "text-slate-900")}>Filters</h2>
          <p className={cx("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Use filters to focus on the data you need.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onRefresh} className={cx("rounded-xl px-3 py-2 text-xs font-semibold", isDark ? "bg-amber-300 text-zinc-950" : "bg-slate-900 text-white")}>Refresh</button>
          <button onClick={onReset} className={cx("rounded-xl px-3 py-2 text-xs font-semibold", isDark ? "bg-slate-800 text-slate-100" : "bg-slate-100 text-slate-700")}>Reset Filters</button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        <label className="flex flex-col gap-1">
          <span className={cx("text-[11px] font-semibold uppercase tracking-[0.18em]", isDark ? "text-slate-400" : "text-slate-500")}>From</span>
          <input type="date" value={filters.dateFrom} onChange={(e) => onChange("dateFrom", e.target.value)} className={cx("rounded-xl border px-3 py-2 text-sm", isDark ? "border-white/10 bg-slate-900/70 text-slate-100" : "border-slate-200 bg-white text-slate-800")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={cx("text-[11px] font-semibold uppercase tracking-[0.18em]", isDark ? "text-slate-400" : "text-slate-500")}>To</span>
          <input type="date" value={filters.dateTo} onChange={(e) => onChange("dateTo", e.target.value)} className={cx("rounded-xl border px-3 py-2 text-sm", isDark ? "border-white/10 bg-slate-900/70 text-slate-100" : "border-slate-200 bg-white text-slate-800")} />
        </label>
        <SelectField label="Category" value={filters.category} onChange={(v) => onChange("category", v)} options={options.categories} theme={theme} />
        <SelectField label="Product" value={filters.product} onChange={(v) => onChange("product", v)} options={options.products} theme={theme} />
        <SelectField label="Location" value={filters.location} onChange={(v) => onChange("location", v)} options={options.locations} theme={theme} />
        <SelectField label="Time Block" value={filters.timeBlock} onChange={(v) => onChange("timeBlock", v)} options={options.timeBlocks} theme={theme} />
        <SelectField label="Pricing State" value={filters.pricingState} onChange={(v) => onChange("pricingState", v)} options={options.pricingStates} theme={theme} />
        <SelectField label="Profit Band" value={filters.profitBand} onChange={(v) => onChange("profitBand", v)} options={["low", "medium", "high"]} theme={theme} />
        <SelectField label="Stock Risk" value={filters.stockRiskBand} onChange={(v) => onChange("stockRiskBand", v)} options={["low", "medium", "high"]} theme={theme} />
        <SelectField label="Delivery" value={filters.deliveryBand} onChange={(v) => onChange("deliveryBand", v)} options={["on-time", "watch", "delayed", "unknown"]} theme={theme} />
      </div>

      <p className={cx("mt-3 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
        Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : "waiting"}
      </p>
    </section>
  );
}
