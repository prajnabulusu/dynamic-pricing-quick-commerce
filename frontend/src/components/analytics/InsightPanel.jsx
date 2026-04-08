const cx = (...classes) => classes.filter(Boolean).join(" ");

export default function InsightPanel({ insights, summary, theme }) {
  const isDark = theme === "dark";
  const tone = {
    opportunity: isDark ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-emerald-200 bg-emerald-50 text-emerald-800",
    risk: isDark ? "border-rose-400/30 bg-rose-500/10 text-rose-100" : "border-rose-200 bg-rose-50 text-rose-800",
    strategy: isDark ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-100" : "border-cyan-200 bg-cyan-50 text-cyan-800",
    info: isDark ? "border-slate-500/30 bg-slate-500/10 text-slate-100" : "border-slate-200 bg-slate-50 text-slate-800",
  };

  return (
    <div className="space-y-3">
      <div className={cx("rounded-2xl border px-4 py-3 text-sm", isDark ? "border-white/10 bg-white/[0.04] text-slate-200" : "border-slate-200 bg-slate-50 text-slate-700")}>
        {summary}
      </div>
      {insights.map((insight, index) => (
        <article key={`${insight.title}-${index}`} className={cx("rounded-2xl border px-4 py-4", tone[insight.type] || tone.info)}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">{insight.type}</p>
          <h4 className="mt-2 text-sm font-bold">{insight.title}</h4>
          <p className="mt-2 text-sm leading-6 opacity-90">{insight.detail}</p>
          <p className="mt-3 text-xs font-medium">Action: {insight.recommendation}</p>
        </article>
      ))}
    </div>
  );
}
