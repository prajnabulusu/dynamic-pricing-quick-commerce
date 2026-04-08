const cx = (...classes) => classes.filter(Boolean).join(" ");

export function AnalyticsSection({ title, subtitle, right, children, theme }) {
  const isDark = theme === "dark";

  return (
    <section className={cx("rounded-[30px] border shadow-[0_14px_40px_rgba(15,23,42,0.10)]", isDark ? "border-slate-700/80 bg-slate-900/72" : "border-white bg-white/95")}>
      <div className={cx("flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4", isDark ? "border-white/10" : "border-slate-100")}>
        <div>
          <h3 className={cx("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>{title}</h3>
          {subtitle && <p className={cx("mt-1 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function ChartBlock({ title, subtitle, children, theme }) {
  const isDark = theme === "dark";
  return (
    <div className={cx("rounded-2xl border p-4", isDark ? "border-white/10 bg-slate-900/60" : "border-slate-100 bg-slate-50/80")}>
      <div className="mb-3">
        <p className={cx("text-sm font-semibold", isDark ? "text-white" : "text-slate-800")}>{title}</p>
        {subtitle && <p className={cx("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

