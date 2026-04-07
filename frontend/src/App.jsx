import { useState } from "react";
import ProductsPage   from "./pages/ProductsPage";
import AdminDashboard from "./pages/AdminDashboard";

export default function App() {
  const [page, setPage]   = useState("shop");   // "shop" | "admin"
  const [cart, setCart]   = useState([]);        // [{ product, quantity }]
  const [toast, setToast] = useState(null);

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

  const removeFromCart = (product_id) =>
    setCart((prev) => prev.filter((i) => i.product.product_id !== product_id));

  const clearCart = () => setCart([]);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Nav ── */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-gray-900">QuickPrice</span>
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
              Live
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage("shop")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                page === "shop"
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Shop
            </button>
            <button
              onClick={() => setPage("admin")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                page === "admin"
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Admin
            </button>

            {/* Cart badge */}
            {page === "shop" && (
              <button
                onClick={() => setPage("cart")}
                className="relative ml-2 p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}
                  viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6h13" />
                </svg>
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs
                    rounded-full w-4 h-4 flex items-center justify-center font-medium">
                    {cartCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ── Pages ── */}
      {page === "shop" && (
        <ProductsPage
          cart={cart}
          addToCart={addToCart}
          removeFromCart={removeFromCart}
          clearCart={clearCart}
          showToast={showToast}
        />
      )}
      {page === "admin"  && <AdminDashboard />}

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl
          shadow-lg text-sm font-medium z-50 transition-all
          ${toast.type === "success"
            ? "bg-gray-900 text-white"
            : "bg-red-600 text-white"
          }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}