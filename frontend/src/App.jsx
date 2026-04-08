import { useEffect, useState } from "react";
import ProductsPage from "./pages/ProductsPage";
import AdminDashboard from "./pages/AdminDashboard";
import LiveOrdersPage from "./pages/LiveOrdersPage";
import AnalyticsIntelligencePage from "./pages/AnalyticsIntelligencePage";

const THEME_KEY = "warehouseops-theme";

function getInitialTheme() {
  const saved = window.localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") {
    return saved;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";

  return (
    <button
      onClick={onToggle}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-all ${
        isDark
          ? "border-slate-600/70 bg-slate-900/80 text-slate-100 hover:bg-slate-800/85"
          : "border-slate-200 bg-white/80 text-slate-700 hover:bg-slate-50"
      }`}
      aria-label="Toggle color theme"
    >
      {isDark ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3c0 0 0 0 0 0A7 7 0 0 0 21 12.79z" />
        </svg>
      )}
      <span>{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}

export default function App() {
  const [page, setPage] = useState("shop");
  const [cart, setCart] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.body.style.backgroundColor = theme === "dark" ? "#070b14" : "#f4f2ea";
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const showToast = (msg, type = "success", options = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [{ id, msg, type, ...options }, ...prev].slice(0, 4));
    setTimeout(() => removeToast(id), 3500);
  };

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.product_id === product.product_id);
      if (existing) {
        return prev.map((i) =>
          i.product.product_id === product.product_id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    showToast(`${product.name} added to cart`);
  };

  const removeFromCart = (productId) =>
    setCart((prev) => prev.filter((i) => i.product.product_id !== productId));

  const clearCart = () => setCart([]);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const isDark = theme === "dark";

  return (
    <div
      className={`relative min-h-screen overflow-x-hidden transition-colors duration-300 ${
        isDark
          ? "bg-[radial-gradient(circle_at_10%_0%,_rgba(14,165,233,0.18),_transparent_38%),radial-gradient(circle_at_88%_8%,_rgba(16,185,129,0.14),_transparent_42%),radial-gradient(circle_at_50%_100%,_rgba(245,158,11,0.12),_transparent_45%),linear-gradient(180deg,_#070b14_0%,_#0b1220_45%,_#060a12_100%)] text-slate-100"
          : "bg-[radial-gradient(circle_at_12%_8%,_rgba(217,119,6,0.14),_transparent_32%),radial-gradient(circle_at_85%_10%,_rgba(13,148,136,0.12),_transparent_38%),linear-gradient(180deg,_#f4f2ea_0%,_#efe8d8_40%,_#f8f4eb_100%)] text-stone-900"
      }`}
    >
      <div className={`pointer-events-none absolute -left-16 top-24 h-52 w-52 rounded-full blur-3xl ${isDark ? "bg-cyan-400/18" : "bg-amber-300/20"}`} />
      <div className={`pointer-events-none absolute -right-20 top-44 h-64 w-64 rounded-full blur-3xl ${isDark ? "bg-emerald-300/12" : "bg-teal-300/20"}`} />
      <div className={`pointer-events-none absolute bottom-0 left-1/3 h-40 w-72 -translate-x-1/2 blur-3xl ${isDark ? "bg-amber-300/10" : "bg-orange-200/20"}`} />
      <nav
        className={`sticky top-0 z-40 border-b backdrop-blur-xl ${
          isDark
            ? "border-slate-700/70 bg-slate-950/78 shadow-[0_10px_30px_rgba(2,8,23,0.45)]"
            : "border-stone-300/70 bg-[#f7f2e7]/80"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-2xl border text-sm font-black tracking-[0.3em] ${
                isDark
                  ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
                  : "border-amber-300 bg-amber-100 text-amber-800"
              }`}
            >
              WH
            </div>
            <div>
              <p className={`text-lg font-semibold ${isDark ? "text-white" : "text-stone-900"}`}>
                Retail Hub
              </p>
              <p className={`text-xs ${isDark ? "text-zinc-400" : "text-stone-600"}`}>
                Pricing and operations dashboard
              </p>
            </div>
            <span
              className={`hidden rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${
                isDark
                  ? "bg-teal-400/10 text-teal-200 ring-1 ring-teal-400/25"
                  : "bg-teal-100 text-teal-800 ring-1 ring-teal-200"
              }`}
            >
              Live
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle
              theme={theme}
              onToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            />

            <button
              onClick={() => setPage("shop")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                page === "shop"
                  ? isDark
                    ? "bg-amber-300 text-zinc-950 shadow-[0_10px_30px_rgba(251,191,36,0.28)]"
                    : "bg-stone-900 text-white shadow-[0_10px_25px_rgba(68,64,60,0.24)]"
                  : isDark
                    ? "text-zinc-300 hover:bg-white/8 hover:text-white"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              }`}
            >
              Shop
            </button>
            <button
              onClick={() => setPage("admin")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                page === "admin"
                  ? isDark
                    ? "bg-amber-300 text-zinc-950 shadow-[0_10px_30px_rgba(251,191,36,0.28)]"
                    : "bg-stone-900 text-white shadow-[0_10px_25px_rgba(68,64,60,0.24)]"
                  : isDark
                    ? "text-zinc-300 hover:bg-white/8 hover:text-white"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setPage("live_orders")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                page === "live_orders"
                  ? isDark
                    ? "bg-amber-300 text-zinc-950 shadow-[0_10px_30px_rgba(251,191,36,0.28)]"
                    : "bg-stone-900 text-white shadow-[0_10px_25px_rgba(68,64,60,0.24)]"
                  : isDark
                    ? "text-zinc-300 hover:bg-white/8 hover:text-white"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              }`}
            >
              Live Orders
            </button>
            <button
              onClick={() => setPage("analytics")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                page === "analytics"
                  ? isDark
                    ? "bg-amber-300 text-zinc-950 shadow-[0_10px_30px_rgba(251,191,36,0.28)]"
                    : "bg-stone-900 text-white shadow-[0_10px_25px_rgba(68,64,60,0.24)]"
                  : isDark
                    ? "text-zinc-300 hover:bg-white/8 hover:text-white"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              }`}
            >
              Analytics
            </button>

            {page === "shop" && (
              <button
                onClick={() => setPage("cart")}
                className={`relative ml-1 rounded-xl p-2.5 transition-colors ${
                  isDark
                    ? "text-zinc-200 hover:bg-white/8"
                    : "text-stone-600 hover:bg-stone-100"
                }`}
                aria-label="Cart summary"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6h13"
                  />
                </svg>
                {cartCount > 0 && (
                  <span
                    className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold ${
                      isDark ? "bg-amber-300 text-zinc-950" : "bg-stone-900 text-white"
                    }`}
                  >
                    {cartCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </nav>

      {page === "shop" && (
        <ProductsPage
          theme={theme}
          cart={cart}
          addToCart={addToCart}
          removeFromCart={removeFromCart}
          clearCart={clearCart}
          showToast={showToast}
          goToLiveOrders={() => setPage("live_orders")}
        />
      )}
      {page === "admin" && <AdminDashboard theme={theme} />}
      {page === "live_orders" && <LiveOrdersPage theme={theme} />}
      {page === "analytics" && <AnalyticsIntelligencePage theme={theme} />}

      {toasts.length > 0 && (
        <div className="fixed right-4 top-20 z-50 flex w-[min(92vw,380px)] flex-col gap-3">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-2xl px-4 py-3 text-sm font-medium shadow-2xl transition-all ${
                toast.type === "success"
                  ? isDark
                    ? "border border-emerald-400/20 bg-slate-900 text-slate-50"
                    : "bg-slate-900 text-white"
                  : "bg-rose-600 text-white"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="flex-1 leading-relaxed">{toast.msg}</span>
                <button
                  onClick={() => removeToast(toast.id)}
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isDark ? "bg-white/10 hover:bg-white/20" : "bg-white/20 hover:bg-white/30"
                  }`}
                >
                  x
                </button>
              </div>
              {toast.actionLabel && (
                <div className="mt-2">
                  <button
                    onClick={() => {
                      toast.onAction?.();
                      removeToast(toast.id);
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      isDark
                        ? "bg-amber-300 text-zinc-950 hover:bg-amber-200"
                        : "bg-white text-stone-900 hover:bg-stone-100"
                    }`}
                  >
                    {toast.actionLabel}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

