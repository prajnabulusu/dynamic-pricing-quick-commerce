const cx = (...classes) => classes.filter(Boolean).join(" ");

const accentMap = {
  teal: "from-teal-400/18 to-teal-500/6 text-teal-100",
  emerald: "from-emerald-400/18 to-emerald-500/6 text-emerald-100",
  cyan: "from-cyan-400/18 to-cyan-500/6 text-cyan-100",
  amber: "from-amber-300/20 to-amber-400/6 text-amber-100",
  orange: "from-orange-300/20 to-orange-500/6 text-orange-100",
  violet: "from-violet-400/18 to-violet-500/6 text-violet-100",
  indigo: "from-indigo-400/18 to-indigo-500/6 text-indigo-100",
  fuchsia: "from-fuchsia-400/18 to-fuchsia-500/6 text-fuchsia-100",
  rose: "from-rose-400/18 to-rose-500/6 text-rose-100",
  red: "from-red-400/18 to-red-500/6 text-red-100",
  sky: "from-sky-400/18 to-sky-500/6 text-sky-100",
  lime: "from-lime-400/18 to-lime-500/6 text-lime-100",
  slate: "from-slate-400/18 to-slate-500/6 text-slate-200",
};

export default function KpiCard({ title, value, delta, subLabel, accent = "teal", theme }) {
  const isDark = theme === "dark";
  const deltaUp = Number(delta || 0) >= 0;

  return (
    <div className={cx(
      "rounded-[24px] border p-4 shadow-[0_14px_34px_rgba(15,23,42,0.10)]",
      isDark
        ? `border-white/10 bg-gradient-to-br ${accentMap[accent] || accentMap.teal}`
        : "border-white bg-white"
    )}>
      <p className={cx("text-[11px] font-semibold uppercase tracking-[0.2em]", isDark ? "text-white/70" : "text-slate-500")}>{title}</p>
      <p className={cx("mt-3 text-2xl font-black tracking-tight", isDark ? "text-white" : "text-slate-900")}>{value}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={cx(
          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
          deltaUp
            ? isDark ? "bg-emerald-500/20 text-emerald-200" : "bg-emerald-100 text-emerald-700"
            : isDark ? "bg-rose-500/20 text-rose-200" : "bg-rose-100 text-rose-700"
        )}>
          {delta === undefined ? "stable" : `${deltaUp ? "up" : "down"} ${Math.abs(delta).toFixed(1)}%`}
        </span>
        {subLabel && <span className={cx("text-[11px]", isDark ? "text-white/75" : "text-slate-500")}>{subLabel}</span>}
      </div>
    </div>
  );
}
