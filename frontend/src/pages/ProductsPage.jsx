import { useState, useEffect, useCallback, useRef } from "react";
import { getProducts, placeOrder, recordEvent, getViewStats } from "../api";

const SESSION_ID = Math.random().toString(36).slice(2, 10);

function ExpiryBadge({ product }) {
  if (!product.is_perishable) return null;
  const reason = (product.price_reason || "").toLowerCase();
  if (reason.includes("expired"))
    return <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full font-semibold animate-pulse">Expired — redistributing</span>;
  if (reason.includes("tomorrow"))
    return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">Expires tomorrow</span>;
  if (reason.includes("2 day"))
    return <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">Expires in 2 days</span>;
  if (reason.includes("expir"))
    return <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Expiring soon</span>;
  return null;
}

function usePriceFlash(price) {
  const prevRef = useRef(null);
  const [flash, setFlash] = useState(null);
  useEffect(() => {
    if (prevRef.current === null) { prevRef.current = price; return; }
    if (price > prevRef.current) { setFlash("up"); setTimeout(() => setFlash(null), 1400); }
    else if (price < prevRef.current) { setFlash("down"); setTimeout(() => setFlash(null), 1400); }
    prevRef.current = price;
  }, [price]);
  return flash;
}

function ViewingNow({ productId }) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try { const { data } = await getViewStats(productId); if (!cancelled) setLabel(data.viewing_now_label || ""); }
      catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [productId]);
  if (!label) return null;
  return <span className="text-xs text-orange-600 font-medium">{label}</span>;
}

function ProductCard({ product, inCart, onAdd, onRemove, onView, clickCount }) {
  const flash        = usePriceFlash(product.current_price);
  const demand       = product.demand_score ?? 0;
  const isHighDemand = demand > 0.7;
  const isExpiring   = (product.price_reason || "").toLowerCase().includes("expir");
  const isLowStock   = product.stock_quantity > 0 && product.stock_quantity <= 5;
  const isOutOfStock = product.stock_quantity === 0;
  const pctChange    = product.base_price
    ? ((product.current_price - product.base_price) / product.base_price) * 100 : 0;
  const priceUp   = pctChange >  0.5;
  const priceDown = pctChange < -0.5;

  const borderCls = flash === "up"   ? "border-red-300 shadow-red-100 shadow-md"
                  : flash === "down" ? "border-green-300 shadow-green-100 shadow-md"
                  : "border-gray-100";

  return (
    <div
      onClick={() => onView(product)}
      className={`bg-white rounded-2xl border p-4 flex flex-col gap-2.5
        hover:shadow-md transition-all cursor-pointer select-none ${borderCls}`}
    >
      {/* Badges row */}
      <div className="flex items-center justify-between gap-1 flex-wrap">
        <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">
          {product.category_name}
        </span>
        <div className="flex gap-1 flex-wrap">
          {isHighDemand && (
            <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-semibold">Hot</span>
          )}
          {isExpiring
            ? <ExpiryBadge product={product} />
            : product.is_perishable && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Fresh</span>
          }
        </div>
      </div>

      {/* Name */}
      <div>
        <p className="font-semibold text-gray-900 leading-tight text-sm">{product.name}</p>
        {product.brand && <p className="text-xs text-gray-400">{product.brand}</p>}
      </div>

      {/* Price with flash */}
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className={`text-xl font-bold transition-colors duration-300
          ${flash === "up" ? "text-red-600" : flash === "down" ? "text-green-600" : "text-gray-900"}`}>
          ₹{product.current_price.toFixed(2)}
        </span>
        {(priceUp || priceDown) && (
          <>
            <span className="text-sm text-gray-400 line-through">₹{product.base_price.toFixed(2)}</span>
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full
              ${priceUp ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
              {priceUp ? "▲" : "▼"} {Math.abs(pctChange).toFixed(1)}%
            </span>
          </>
        )}
        {flash && (
          <span className={`text-xs font-bold animate-bounce
            ${flash === "up" ? "text-red-500" : "text-green-500"}`}>
            {flash === "up" ? "↑ rising!" : "↓ dropped!"}
          </span>
        )}
      </div>

      {/* Demand bar */}
      {product.demand_score != null && (
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Demand</span><span>{Math.round(demand * 100)}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700
              ${demand > 0.7 ? "bg-red-400" : demand > 0.4 ? "bg-amber-400" : "bg-green-400"}`}
              style={{ width: `${Math.round(demand * 100)}%` }} />
          </div>
        </div>
      )}

      {/* Viewing now */}
      <ViewingNow productId={product.product_id} />

      {/* Click counter */}
      {clickCount > 0 && (
        <p className="text-xs text-orange-500 font-medium">
          You clicked {clickCount}× — demand signal sent
        </p>
      )}

      {/* Price reason */}
      {product.price_reason && (
        <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{product.price_reason}</p>
      )}

      {/* Stock indicator */}
      <div className="flex items-center gap-1.5 text-xs">
        {isLowStock ? (
          <><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
          <span className="text-red-600 font-semibold">Only {product.stock_quantity} left!</span></>
        ) : isOutOfStock ? (
          <><span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
          <span className="text-gray-400">Out of stock</span></>
        ) : (
          <><span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
          <span className="text-gray-500">In stock</span></>
        )}
      </div>

      {/* Cart button */}
      {inCart ? (
        <button onClick={(e) => { e.stopPropagation(); onRemove(product.product_id); }}
          className="mt-auto w-full py-2 rounded-xl border border-gray-200 text-sm
            font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          Remove from cart
        </button>
      ) : (
        <button disabled={isOutOfStock}
          onClick={(e) => {
            e.stopPropagation();
            onAdd(product);
            recordEvent({ product_id: product.product_id, event_type: "cart_add", session_id: SESSION_ID }).catch(() => {});
          }}
          className="mt-auto w-full py-2 rounded-xl bg-blue-600 text-white text-sm
            font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors">
          {isLowStock ? "Add — almost gone!" : "Add to cart"}
        </button>
      )}
    </div>
  );
}

function CartPanel({ cart, removeFromCart, clearCart, onOrderPlaced }) {
  const [locationId, setLocationId] = useState(1);
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState(null);

  useEffect(() => {
    if (cart.length === 0) return;
    const id = setTimeout(() => {
      cart.forEach(({ product }) =>
        recordEvent({ product_id: product.product_id, event_type: "cart_abandon", session_id: SESSION_ID }).catch(() => {})
      );
    }, 60000);
    return () => clearTimeout(id);
  }, [cart]);

  const total = cart.reduce((s, i) => s + i.product.current_price * i.quantity, 0);

  const submitOrder = async () => {
    setLoading(true);
    try {
      const { data } = await placeOrder({
        location_id: locationId,
        items: cart.map((i) => ({ product_id: i.product.product_id, quantity: i.quantity })),
      });
      setResult({ success: true, data });
      clearCart();
      onOrderPlaced?.();
    } catch (err) {
      setResult({ success: false, msg: err.response?.data?.detail || "Order failed." });
    } finally {
      setLoading(false);
    }
  };

  if (result?.success) return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
      </div>
      <p className="font-semibold text-gray-900 mb-1">Order placed!</p>
      <p className="text-sm text-gray-500 mb-4">₹{result.data.total_amount.toFixed(2)} · Kafka is updating prices</p>
      <button onClick={() => setResult(null)} className="text-sm text-blue-600 hover:underline">Place another</button>
    </div>
  );

  if (cart.length === 0) return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
      <p className="text-gray-400 text-sm">Cart is empty</p>
      <p className="text-xs text-gray-300 mt-1">Click products to send demand signals</p>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
      <p className="font-semibold text-gray-900">Cart ({cart.length})</p>
      <div className="flex flex-col gap-2">
        {cart.map(({ product, quantity }) => (
          <div key={product.product_id} className="flex items-center justify-between text-sm py-2 border-b border-gray-50 last:border-0">
            <div>
              <p className="font-medium text-gray-800 text-xs">{product.name}</p>
              <p className="text-xs text-gray-400">₹{product.current_price.toFixed(2)} × {quantity}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 text-sm">₹{(product.current_price * quantity).toFixed(2)}</span>
              <button onClick={() => removeFromCart(product.product_id)} className="text-gray-300 hover:text-red-400 text-lg">×</button>
            </div>
          </div>
        ))}
      </div>
      <select value={locationId} onChange={(e) => setLocationId(Number(e.target.value))}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value={1}>Hyderabad</option>
        <option value={2}>Bangalore</option>
        <option value={3}>Chennai</option>
        <option value={4}>Mumbai</option>
        <option value={5}>Delhi</option>
      </select>
      <div className="border-t border-gray-100 pt-3">
        <div className="flex justify-between items-center mb-3">
          <span className="font-semibold text-gray-700 text-sm">Total</span>
          <span className="text-xl font-bold text-gray-900">₹{total.toFixed(2)}</span>
        </div>
        {result?.success === false && <p className="text-xs text-red-500 mb-2">{result.msg}</p>}
        <button onClick={submitOrder} disabled={loading}
          className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
          {loading ? "Placing..." : "Place order"}
        </button>
        <button onClick={clearCart} className="w-full mt-2 text-xs text-gray-400 hover:text-gray-600">Clear cart</button>
      </div>
    </div>
  );
}

export default function ProductsPage({ cart, addToCart, removeFromCart, clearCart, showToast }) {
  const [products,    setProducts]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [filter,      setFilter]      = useState("All");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [clickCounts, setClickCounts] = useState({});

  const cartIds = new Set(cart.map((i) => i.product.product_id));

  const fetchProducts = useCallback(async () => {
    try {
      const { data } = await getProducts();
      setProducts(data);
      setError(null);
      setLastRefresh(new Date());
    } catch {
      setError("Cannot reach API. Is FastAPI running on port 8000?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    const id = setInterval(fetchProducts, 5000);
    return () => clearInterval(id);
  }, [fetchProducts]);

  const handleProductView = useCallback((product) => {
    setClickCounts((prev) => ({ ...prev, [product.product_id]: (prev[product.product_id] || 0) + 1 }));
    recordEvent({ product_id: product.product_id, event_type: "view", session_id: SESSION_ID }).catch(() => {});
  }, []);

  const categories = ["All", ...new Set(products.map((p) => p.category_name))];
  const filtered   = filter === "All" ? products : products.filter((p) => p.category_name === filter);
  const totalClicks = Object.values(clickCounts).reduce((a, b) => a + b, 0);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="max-w-md mx-auto mt-16 text-center px-4">
      <p className="text-red-500 text-sm">{error}</p>
      <button onClick={fetchProducts} className="mt-3 text-blue-600 text-sm hover:underline">Retry</button>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Products</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Prices refresh every 5s · click to drive demand
                {lastRefresh && ` · ${lastRefresh.toLocaleTimeString()}`}
              </p>
            </div>
            {totalClicks > 0 && (
              <p className="text-xs text-orange-600 font-medium">
                {totalClicks} demand signal{totalClicks !== 1 ? "s" : ""} sent
              </p>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 mb-4 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
            <p className="text-xs text-blue-700">
              <span className="font-semibold">Live system active.</span>{" "}
              Click a product card to send a Kafka demand event. Click rapidly to watch the price rise in real time.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap mb-5">
            {categories.map((c) => (
              <button key={c} onClick={() => setFilter(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filter === c ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-blue-300"
                }`}>
                {c}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((product) => (
              <div key={product.product_id} className="relative">
                {(clickCounts[product.product_id] || 0) > 0 && (
                  <div className="absolute -top-2 -right-2 z-10 bg-orange-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">
                    {clickCounts[product.product_id]}
                  </div>
                )}
                <ProductCard
                  product={product}
                  inCart={cartIds.has(product.product_id)}
                  onAdd={addToCart}
                  onRemove={removeFromCart}
                  onView={handleProductView}
                  clickCount={clickCounts[product.product_id] || 0}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="w-72 flex-shrink-0">
          <div className="sticky top-20 flex flex-col gap-3">
            <CartPanel
              cart={cart}
              removeFromCart={removeFromCart}
              clearCart={clearCart}
              onOrderPlaced={() => {
                showToast("Order sent to Kafka — prices updating!");
                setTimeout(fetchProducts, 3000);
              }}
            />
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-xs text-amber-800">
              <p className="font-semibold mb-1">Demo tip</p>
              <p className="leading-relaxed">
                Click the same product 5–10 times rapidly. Each click fires a Kafka event. The demand consumer detects the spike and the price updates within seconds.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}