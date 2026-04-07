import { useEffect, useState } from "react";
import ProductsPage from "./pages/ProductsPage";
import AdminDashboard from "./pages/AdminDashboard";

const THEME_KEY = "quickprice-theme";

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
          ? "border-white/15 bg-white/8 text-slate-100 hover:bg-white/12"
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
  const [toast, setToast] = useState(null);
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.body.style.backgroundColor = theme === "dark" ? "#020617" : "#f8fafc";
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
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
      className={`min-h-screen transition-colors duration-300 ${
        isDark
          ? "bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_32%),linear-gradient(180deg,_#020617_0%,_#0f172a_46%,_#111827_100%)] text-slate-100"
          : "bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_38%,_#f8fafc_100%)] text-slate-900"
      }`}
    >
      <nav
        className={`sticky top-0 z-40 border-b backdrop-blur-xl ${
          isDark
            ? "border-white/10 bg-slate-950/70"
            : "border-slate-200/80 bg-white/75"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-2xl border text-sm font-black tracking-[0.3em] ${
                isDark
                  ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                  : "border-cyan-200 bg-cyan-50 text-cyan-700"
              }`}
            >
              QP
            </div>
            <div>
              <p className={`text-lg font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>
                QuickPrice
              </p>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Demand-aware pricing console
              </p>
            </div>
            <span
              className={`hidden rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${
                isDark
                  ? "bg-emerald-400/10 text-emerald-200 ring-1 ring-emerald-400/20"
                  : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
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
                    ? "bg-cyan-400 text-slate-950 shadow-[0_10px_30px_rgba(34,211,238,0.28)]"
                    : "bg-slate-900 text-white shadow-[0_10px_25px_rgba(15,23,42,0.18)]"
                  : isDark
                    ? "text-slate-300 hover:bg-white/8 hover:text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              Shop
            </button>
            <button
              onClick={() => setPage("admin")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                page === "admin"
                  ? isDark
                    ? "bg-cyan-400 text-slate-950 shadow-[0_10px_30px_rgba(34,211,238,0.28)]"
                    : "bg-slate-900 text-white shadow-[0_10px_25px_rgba(15,23,42,0.18)]"
                  : isDark
                    ? "text-slate-300 hover:bg-white/8 hover:text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              Admin
            </button>

            {page === "shop" && (
              <button
                onClick={() => setPage("cart")}
                className={`relative ml-1 rounded-xl p-2.5 transition-colors ${
                  isDark
                    ? "text-slate-200 hover:bg-white/8"
                    : "text-slate-600 hover:bg-slate-100"
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
                      isDark ? "bg-cyan-400 text-slate-950" : "bg-slate-900 text-white"
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
        />
      )}
      {page === "admin" && <AdminDashboard theme={theme} />}

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-medium shadow-2xl transition-all ${
            toast.type === "success"
              ? isDark
                ? "border border-emerald-400/20 bg-slate-900 text-slate-50"
                : "bg-slate-900 text-white"
              : "bg-rose-600 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}


