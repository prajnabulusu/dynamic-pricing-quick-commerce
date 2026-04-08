import { useState, useEffect, useCallback, useRef } from "react";
import { getProducts, placeOrder, recordEvent, getViewStats, getLiveOrderItems } from "../api";

const SESSION_ID = Math.random().toString(36).slice(2, 10);
const EXPIRY_ALERT_CATEGORIES = new Set(["Fruits", "Vegetables", "Dairy"]);

const cx = (...classes) => classes.filter(Boolean).join(" ");

const CATEGORY_THEMES = [
  {
    light: {
      section: "border-emerald-200/70 bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/30",
      headerPill: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
      chip: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80",
      glow: "bg-emerald-300/25",
    },
    dark: {
      section: "border-emerald-400/20 bg-gradient-to-br from-emerald-400/10 via-white/[0.03] to-transparent",
      headerPill: "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/25",
      chip: "bg-emerald-400/12 text-emerald-200 ring-1 ring-emerald-400/25",
      glow: "bg-emerald-300/20",
    },
  },
  {
    light: {
      section: "border-cyan-200/70 bg-gradient-to-br from-cyan-50/80 via-white to-cyan-50/30",
      headerPill: "bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200",
      chip: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200/80",
      glow: "bg-cyan-300/25",
    },
    dark: {
      section: "border-cyan-400/20 bg-gradient-to-br from-cyan-400/10 via-white/[0.03] to-transparent",
      headerPill: "bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-400/25",
      chip: "bg-cyan-400/12 text-cyan-200 ring-1 ring-cyan-400/25",
      glow: "bg-cyan-300/20",
    },
  },
  {
    light: {
      section: "border-amber-200/70 bg-gradient-to-br from-amber-50/80 via-white to-amber-50/30",
      headerPill: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
      chip: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/80",
      glow: "bg-amber-300/25",
    },
    dark: {
      section: "border-amber-400/20 bg-gradient-to-br from-amber-400/10 via-white/[0.03] to-transparent",
      headerPill: "bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/25",
      chip: "bg-amber-400/12 text-amber-200 ring-1 ring-amber-400/25",
      glow: "bg-amber-300/20",
    },
  },
  {
    light: {
      section: "border-violet-200/70 bg-gradient-to-br from-violet-50/80 via-white to-violet-50/30",
      headerPill: "bg-violet-100 text-violet-700 ring-1 ring-violet-200",
      chip: "bg-violet-50 text-violet-700 ring-1 ring-violet-200/80",
      glow: "bg-violet-300/25",
    },
    dark: {
      section: "border-violet-400/20 bg-gradient-to-br from-violet-400/10 via-white/[0.03] to-transparent",
      headerPill: "bg-violet-400/15 text-violet-200 ring-1 ring-violet-400/25",
      chip: "bg-violet-400/12 text-violet-200 ring-1 ring-violet-400/25",
      glow: "bg-violet-300/20",
    },
  },
];

function getCategoryTheme(categoryName) {
  const normalized = (categoryName || "general").toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash + normalized.charCodeAt(i)) % CATEGORY_THEMES.length;
  }
  return CATEGORY_THEMES[hash];
}

function getExpiryPriority(product) {
  const reason = String(product.price_reason || "").toLowerCase();
  if (reason.includes("expired")) return 0;
  if (reason.includes("tomorrow")) return 1;
  if (reason.includes("2 day")) return 2;
  if (reason.includes("3 day")) return 3;
  if (reason.includes("expir")) return 4;
  return 99;
}

function getDisplayPriceReason(product) {
  const raw = String(product.price_reason || "").trim();
  if (!raw) return "";

  const stock = Number(product.stock_quantity || 0);
  if (stock > 0) {
    return raw
      .replace(/out of stock[^;]*;?\s*/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^;\s*/, "")
      .replace(/\s*;\s*$/, "")
      .trim();
  }

  return raw;
}

function ExpiryBadge({ product, theme }) {
  if (!product.is_perishable) return null;

  const isDark = theme === "dark";
  const reason = (product.price_reason || "").toLowerCase();

  if (reason.includes("expired")) {
    return (
      <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white animate-pulse">
        Expired - redistributing
      </span>
    );
  }

  if (reason.includes("tomorrow")) {
    return (
      <span className={cx(
        "rounded-full px-2 py-0.5 text-xs font-semibold",
        isDark ? "bg-rose-500/15 text-rose-200" : "bg-rose-100 text-rose-700"
      )}>
        Expires tomorrow
      </span>
    );
  }

  if (reason.includes("2 day")) {
    return (
      <span className={cx(
        "rounded-full px-2 py-0.5 text-xs font-semibold",
        isDark ? "bg-orange-400/15 text-orange-200" : "bg-orange-100 text-orange-700"
      )}>
        Expires in 2 days
      </span>
    );
  }

  if (reason.includes("expir")) {
    return (
      <span className={cx(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        isDark ? "bg-amber-400/15 text-amber-200" : "bg-amber-100 text-amber-700"
      )}>
        Expiring soon
      </span>
    );
  }

  return null;
}

function usePriceFlash(price) {
  const prevRef = useRef(null);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    if (prevRef.current === null) {
      prevRef.current = price;
      return;
    }

    let timeoutId;

    if (price > prevRef.current) {
      setFlash("up");
      timeoutId = setTimeout(() => setFlash(null), 1400);
    } else if (price < prevRef.current) {
      setFlash("down");
      timeoutId = setTimeout(() => setFlash(null), 1400);
    }

    prevRef.current = price;
    return () => clearTimeout(timeoutId);
  }, [price]);

  return flash;
}

function ViewingNow({ productId, theme }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const { data } = await getViewStats(productId);
        if (!cancelled) {
          setLabel(data.viewing_now_label || "");
        }
      } catch {
        // ignore polling errors
      }
    };

    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [productId]);

  if (!label) return null;

  return (
    <span className={cx(
      "text-xs font-medium",
      theme === "dark" ? "text-orange-200" : "text-orange-600"
    )}>
      {label}
    </span>
  );
}

function ProductCard({ product, inCart, onAdd, onRemove, onView, clickCount, theme, categoryTheme }) {
  const isDark = theme === "dark";
  const flash = usePriceFlash(product.current_price);
  const demand = product.demand_score ?? 0;
  const isHighDemand = demand > 0.7;
  const isExpiring = (product.price_reason || "").toLowerCase().includes("expir");
  const isLowStock = product.stock_quantity > 0 && product.stock_quantity <= 5;
  const isOutOfStock = product.stock_quantity === 0;
  const displayReason = getDisplayPriceReason(product);
  const pctChange = product.base_price
    ? ((product.current_price - product.base_price) / product.base_price) * 100
    : 0;
  const priceUp = pctChange > 0.5;
  const priceDown = pctChange < -0.5;

  const shellClass = flash === "up"
    ? isDark
      ? "border-rose-400/40 shadow-[0_18px_45px_rgba(244,63,94,0.16)]"
      : "border-rose-200 shadow-[0_18px_45px_rgba(244,63,94,0.12)]"
    : flash === "down"
      ? isDark
        ? "border-emerald-400/40 shadow-[0_18px_45px_rgba(16,185,129,0.16)]"
        : "border-emerald-200 shadow-[0_18px_45px_rgba(16,185,129,0.12)]"
      : isDark
        ? "border-white/10"
        : "border-slate-200/80";

  return (
    <div
      onClick={() => onView(product)}
      className={cx(
        "group relative flex h-full cursor-pointer select-none flex-col gap-3 overflow-hidden rounded-[26px] border p-4 transition-all duration-300",
        isDark
          ? "bg-slate-900/72 hover:-translate-y-1 hover:border-cyan-300/20 hover:bg-slate-900/85"
          : "bg-white/85 hover:-translate-y-1 hover:border-cyan-200 hover:bg-white hover:shadow-[0_18px_40px_rgba(148,163,184,0.18)]",
        shellClass
      )}
    >
      <div className={cx(
        "absolute inset-x-0 top-0 h-24 opacity-70 blur-2xl transition-opacity group-hover:opacity-100",
        categoryTheme.glow
      )} />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className={cx(
            "inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]",
            categoryTheme.chip
          )}>
            {product.category_name}
          </p>
          <p className={cx(
            "mt-2 text-base font-semibold leading-tight",
            isDark ? "text-white" : "text-slate-900"
          )}>
            {product.name}
          </p>
          {product.brand && (
            <p className={cx("mt-1 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{product.brand}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5">
          {isHighDemand && (
            <span className={cx(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              isDark ? "bg-rose-500/15 text-rose-200" : "bg-rose-50 text-rose-600"
            )}>
              Hot
            </span>
          )}
          {isExpiring
            ? <ExpiryBadge product={product} theme={theme} />
            : product.is_perishable && (
              <span className={cx(
                "rounded-full px-2 py-0.5 text-[11px]",
                isDark ? "bg-emerald-400/15 text-emerald-200" : "bg-emerald-50 text-emerald-700"
              )}>
                Fresh
              </span>
            )}
        </div>
      </div>

      <div className="relative flex items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx(
              "text-2xl font-black tracking-tight transition-colors duration-300",
              flash === "up"
                ? "text-rose-500"
                : flash === "down"
                  ? "text-emerald-500"
                  : isDark
                    ? "text-white"
                    : "text-slate-900"
            )}>
              Rs. {product.current_price.toFixed(2)}
            </span>
            {(priceUp || priceDown) && (
              <span className={cx(
                "rounded-full px-2 py-1 text-[11px] font-semibold",
                priceUp
                  ? isDark ? "bg-rose-500/15 text-rose-200" : "bg-rose-50 text-rose-600"
                  : isDark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-50 text-emerald-600"
              )}>
                {priceUp ? "UP" : "DOWN"} {Math.abs(pctChange).toFixed(1)}%
              </span>
            )}
          </div>
          {(priceUp || priceDown) && (
            <p className={cx("text-xs line-through", isDark ? "text-slate-500" : "text-slate-400")}>
              Rs. {product.base_price.toFixed(2)}
            </p>
          )}
        </div>
        {flash && (
          <span className={cx(
            "rounded-full px-2 py-1 text-[11px] font-bold",
            flash === "up"
              ? isDark ? "bg-rose-500/15 text-rose-200" : "bg-rose-50 text-rose-600"
              : isDark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-50 text-emerald-600"
          )}>
            {flash === "up" ? "Rising" : "Dropped"}
          </span>
        )}
      </div>

      <div className="relative space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className={isDark ? "text-slate-400" : "text-slate-500"}>Demand pulse</span>
          <span className={cx("font-semibold", isDark ? "text-slate-200" : "text-slate-700")}>
            {Math.round(demand * 100)}%
          </span>
        </div>
        <div className={cx(
          "h-2 overflow-hidden rounded-full",
          isDark ? "bg-slate-800" : "bg-slate-100"
        )}>
          <div
            className={cx(
              "h-full rounded-full transition-all duration-700",
              demand > 0.7 ? "bg-rose-400" : demand > 0.4 ? "bg-amber-400" : "bg-emerald-400"
            )}
            style={{ width: `${Math.round(demand * 100)}%` }}
          />
        </div>
      </div>

      <div className="relative flex min-h-10 items-center justify-between gap-3">
        <ViewingNow productId={product.product_id} theme={theme} />
        {clickCount > 0 && (
          <p className={cx("text-xs font-medium", isDark ? "text-orange-200" : "text-orange-600")}>
            You clicked {clickCount}x
          </p>
        )}
      </div>

      {displayReason && (
        <p className={cx(
          "relative rounded-2xl border px-3 py-2 text-xs leading-relaxed",
          isDark
            ? "border-white/10 bg-slate-900/70 text-slate-300"
            : "border-slate-100 bg-slate-50/80 text-slate-500"
        )}>
          {displayReason}
        </p>
      )}

      <div className="relative mt-auto flex items-center justify-between gap-3 pt-1 text-xs">
        <div className="flex items-center gap-2">
          <span className={cx(
            "h-2.5 w-2.5 rounded-full",
            isLowStock ? "bg-rose-500" : isOutOfStock ? "bg-slate-400" : "bg-emerald-400"
          )} />
          <span className={cx(
            "font-medium",
            isLowStock
              ? isDark ? "text-rose-200" : "text-rose-600"
              : isOutOfStock
                ? isDark ? "text-slate-500" : "text-slate-400"
                : isDark ? "text-slate-300" : "text-slate-600"
          )}>
            {isLowStock ? `Only ${product.stock_quantity} left` : isOutOfStock ? "Out of stock" : "In stock"}
          </span>
        </div>
      </div>

      {inCart ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(product.product_id);
          }}
          className={cx(
            "relative mt-1 w-full rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors",
            isDark
              ? "border-slate-700/70 bg-slate-900/68 text-slate-100 hover:bg-white/[0.08]"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          )}
        >
          Remove from queue
        </button>
      ) : (
        <button
          disabled={isOutOfStock}
          onClick={(e) => {
            e.stopPropagation();
            onAdd(product);
            recordEvent({
              product_id: product.product_id,
              event_type: "cart_add",
              session_id: SESSION_ID,
            }).catch(() => {});
          }}
          className={cx(
            "relative mt-1 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition-all",
            isDark
              ? "bg-amber-300 text-zinc-950 hover:bg-amber-200 disabled:bg-slate-800 disabled:text-slate-500"
              : "bg-stone-900 text-white hover:bg-stone-800 disabled:bg-slate-200 disabled:text-slate-400",
            "disabled:cursor-not-allowed"
          )}
        >
          {isLowStock ? "Add now" : "Add to cart"}
        </button>
      )}
    </div>
  );
}

function CartPanel({ cart, removeFromCart, clearCart, onOrderPlaced, theme }) {
  const isDark = theme === "dark";
  const [locationId, setLocationId] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (cart.length === 0) return undefined;

    const id = setTimeout(() => {
      cart.forEach(({ product }) =>
        recordEvent({ product_id: product.product_id, event_type: "cart_abandon", session_id: SESSION_ID }).catch(() => {})
      );
    }, 60000);

    return () => clearTimeout(id);
  }, [cart]);

  const total = cart.reduce((sum, item) => sum + item.product.current_price * item.quantity, 0);

  const submitOrder = async () => {
    setLoading(true);
    try {
      const { data } = await placeOrder({
        location_id: locationId,
        items: cart.map((item) => ({ product_id: item.product.product_id, quantity: item.quantity })),
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

  const panelClass = cx(
    "rounded-[28px] border p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]",
    isDark ? "border-slate-700/80 bg-slate-900/72" : "border-white bg-white/90"
  );

  if (result?.success) {
    return (
      <div className={panelClass}>
        <div className="flex flex-col items-center text-center">
          <div className={cx(
            "mb-4 flex h-14 w-14 items-center justify-center rounded-full",
            isDark ? "bg-emerald-400/15 text-emerald-200" : "bg-emerald-100 text-emerald-600"
          )}>
            <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className={cx("text-lg font-semibold", isDark ? "text-white" : "text-slate-900")}>
            Order placed
          </p>
          <p className={cx("mt-2 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
            Rs. {result.data.total_amount.toFixed(2)} confirmed.
          </p>
          <button
            onClick={() => setResult(null)}
            className={cx("mt-4 text-sm font-semibold", isDark ? "text-amber-200" : "text-stone-900")}
          >
            Create another order
          </button>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className={panelClass}>
        <p className={cx("text-sm font-medium", isDark ? "text-slate-300" : "text-slate-600")}>
          Cart is empty
        </p>
        <p className={cx("mt-1 text-xs", isDark ? "text-slate-500" : "text-slate-400")}>
          Add items to place an order.
        </p>
      </div>
    );
  }

  return (
    <div className={panelClass}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className={cx("text-lg font-semibold", isDark ? "text-white" : "text-slate-900")}>
            Cart
          </p>
          <p className={cx("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
            {cart.length} unique item{cart.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className={cx(
          "rounded-full px-3 py-1 text-xs font-semibold",
          isDark ? "bg-teal-400/15 text-teal-200" : "bg-teal-100 text-teal-800"
        )}>
          Rs. {total.toFixed(2)}
        </div>
      </div>

      <div className="space-y-3">
        {cart.map(({ product, quantity }) => (
          <div
            key={product.product_id}
            className={cx(
              "flex items-center justify-between gap-3 rounded-2xl border px-3 py-3",
              isDark ? "border-white/8 bg-slate-900/70" : "border-slate-100 bg-slate-50/80"
            )}
          >
            <div className="min-w-0">
              <p className={cx("truncate text-sm font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>
                {product.name}
              </p>
              <p className={cx("mt-1 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
                Rs. {product.current_price.toFixed(2)} x {quantity}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={cx("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>
                Rs. {(product.current_price * quantity).toFixed(2)}
              </span>
              <button
                onClick={() => removeFromCart(product.product_id)}
                className={cx("text-lg", isDark ? "text-slate-500 hover:text-rose-300" : "text-slate-300 hover:text-rose-500")}
              >
                x
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        <select
          value={locationId}
          onChange={(e) => setLocationId(Number(e.target.value))}
          className={cx(
            "w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-colors",
            isDark
              ? "border-white/10 bg-slate-900/80 text-slate-100 focus:border-amber-300/40"
              : "border-slate-200 bg-white text-slate-800 focus:border-amber-500"
          )}
        >
          <option value={1}>Hyderabad</option>
          <option value={2}>Bangalore</option>
          <option value={3}>Chennai</option>
          <option value={4}>Mumbai</option>
          <option value={5}>Delhi</option>
        </select>

        <div className={cx(
          "rounded-2xl border px-4 py-4",
          isDark ? "border-white/10 bg-slate-900/75" : "border-slate-100 bg-slate-50/80"
        )}>
          <div className="flex items-center justify-between">
            <span className={cx("text-sm font-medium", isDark ? "text-slate-300" : "text-slate-600")}>
              Total
            </span>
            <span className={cx("text-2xl font-black", isDark ? "text-white" : "text-slate-900")}>
              Rs. {total.toFixed(2)}
            </span>
          </div>
          {result?.success === false && (
            <p className={cx("mt-2 text-xs", isDark ? "text-rose-300" : "text-rose-500")}>{result.msg}</p>
          )}
          <button
            onClick={submitOrder}
            disabled={loading}
            className={cx(
              "mt-4 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition-all",
              isDark
                ? "bg-amber-300 text-zinc-950 hover:bg-amber-200 disabled:bg-slate-800 disabled:text-slate-500"
                : "bg-stone-900 text-white hover:bg-stone-800 disabled:bg-slate-200 disabled:text-slate-400"
            )}
          >
            {loading ? "Submitting..." : "Place order"}
          </button>
          <button
            onClick={clearCart}
            className={cx("mt-3 w-full text-xs font-medium", isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-800")}
          >
            Clear cart
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage({ cart, addToCart, removeFromCart, clearCart, showToast, theme, goToLiveOrders }) {
  const isDark = theme === "dark";
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("All");
  const [stockView, setStockView] = useState("in_stock");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [liveOrderItems, setLiveOrderItems] = useState([]);
  const [clickCounts, setClickCounts] = useState({});
  const priceDropNotifiedRef = useRef({});
  const showToastRef = useRef(showToast);
  const addToCartRef = useRef(addToCart);

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    addToCartRef.current = addToCart;
  }, [addToCart]);

  const cartIds = new Set(cart.map((item) => item.product.product_id));

  const fetchProducts = useCallback(async () => {
    try {
      const { data } = await getProducts();
      setProducts((previous) => {
        const previousById = new Map(previous.map((product) => [product.product_id, product]));
        const dropAlerts = [];

        for (const product of data) {
          const older = previousById.get(product.product_id);
          if (!older) continue;

          const dropped = Number(product.current_price) < Number(older.current_price);
          if (!dropped) continue;

          const reason = (product.price_reason || "").toLowerCase();
          const nearExpiryDrop = reason.includes("expir") || reason.includes("expired");
          if (!nearExpiryDrop) continue;

          const categoryName = String(product.category_name || "").trim();
          const eligiblePerishable = product.is_perishable && EXPIRY_ALERT_CATEGORIES.has(categoryName);
          if (!eligiblePerishable) continue;

          const alertKey = `${product.product_id}:${Number(product.current_price).toFixed(2)}`;
          if (priceDropNotifiedRef.current[alertKey]) continue;
          priceDropNotifiedRef.current[alertKey] = true;

          dropAlerts.push(product);
        }

        for (const droppedProduct of dropAlerts.slice(0, 2)) {
          showToastRef.current?.(
            `Price reduced: ${droppedProduct.name} is now Rs. ${Number(droppedProduct.current_price).toFixed(2)} (near expiry)`,
            "success",
            {
              actionLabel: "Queue item",
              onAction: () => addToCartRef.current?.(droppedProduct),
            }
          );
        }

        return data;
      });
      setError(null);
      setLastRefresh(new Date());
    } catch {
      setError("Cannot reach API. Is FastAPI running on port 8000?");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLiveOrderItems = useCallback(async () => {
    try {
      const { data } = await getLiveOrderItems(300);
      setLiveOrderItems(Array.isArray(data) ? data : []);
    } catch {
      // keep UI resilient when orders feed is unavailable
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    const id = setInterval(fetchProducts, 5000);
    return () => clearInterval(id);
  }, [fetchProducts]);

  useEffect(() => {
    fetchLiveOrderItems();
    const id = setInterval(fetchLiveOrderItems, 4000);
    return () => clearInterval(id);
  }, [fetchLiveOrderItems]);

  const handleProductView = useCallback((product) => {
    setClickCounts((prev) => ({ ...prev, [product.product_id]: (prev[product.product_id] || 0) + 1 }));
    recordEvent({ product_id: product.product_id, event_type: "view", session_id: SESSION_ID }).catch(() => {});
  }, []);

  const categories = ["All", ...new Set(products.map((product) => product.category_name))];
  const categoryFiltered = filter === "All" ? products : products.filter((product) => product.category_name === filter);
  const filteredBase = stockView === "in_stock"
    ? categoryFiltered.filter((product) => Number(product.stock_quantity || 0) > 0)
    : categoryFiltered;
  const filtered = [...filteredBase].sort((a, b) => Number(b.stock_quantity || 0) - Number(a.stock_quantity || 0));
  const inStockCount = products.filter((product) => Number(product.stock_quantity || 0) > 0).length;
  const outOfStockCount = products.filter((product) => Number(product.stock_quantity || 0) === 0).length;
  const categoryOrder = categories.filter((category) => category !== "All");
  const groupedProducts = categoryOrder
    .map((category) => ({
      category,
      items: filtered.filter((product) => product.category_name === category),
    }))
    .filter((group) => group.items.length > 0);
  const expiringSoonProducts = [...products]
    .filter((product) => String(product.price_reason || "").toLowerCase().includes("expir"))
    .sort((a, b) => getExpiryPriority(a) - getExpiryPriority(b));
  const totalClicks = Object.values(clickCounts).reduce((sum, value) => sum + value, 0);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className={cx(
          "h-8 w-8 animate-spin rounded-full border-2 border-t-transparent",
          isDark ? "border-amber-300" : "border-stone-900"
        )} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto mt-16 max-w-md px-4 text-center">
        <p className={cx("text-sm", isDark ? "text-rose-300" : "text-rose-500")}>{error}</p>
        <button onClick={fetchProducts} className={cx("mt-3 text-sm font-semibold", isDark ? "text-amber-200" : "text-stone-900")}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <section className={cx(
            "overflow-hidden rounded-[32px] border p-6 shadow-[0_18px_60px_rgba(15,23,42,0.10)]",
            isDark ? "border-slate-700/80 bg-slate-900/72" : "border-white bg-white/90"
          )}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
              <div>
                <span className={cx(
                  "inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em]",
                  isDark ? "bg-amber-400/15 text-amber-100" : "bg-amber-100 text-amber-800"
                )}>
                  Store
                </span>
                <h1 className={cx("mt-4 text-3xl font-black tracking-tight sm:text-4xl", isDark ? "text-white" : "text-slate-900")}>
                  Live stock and prices
                </h1>
                <p className={cx("mt-3 max-w-2xl text-sm leading-6", isDark ? "text-slate-300" : "text-slate-600")}>
                  Prices, demand, and stock refresh every 5 seconds.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className={cx(
                  "rounded-2xl border px-4 py-4",
                  isDark ? "border-white/10 bg-slate-900/70" : "border-slate-100 bg-slate-50"
                )}>
                  <p className={cx("text-[11px] uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-400")}>
                    Visible
                  </p>
                  <p className={cx("mt-2 text-2xl font-black", isDark ? "text-white" : "text-slate-900")}>
                    {filtered.length}
                  </p>
                </div>
                <div className={cx(
                  "rounded-2xl border px-4 py-4",
                  isDark ? "border-white/10 bg-slate-900/70" : "border-slate-100 bg-slate-50"
                )}>
                  <p className={cx("text-[11px] uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-400")}>
                    Signals
                  </p>
                  <p className={cx("mt-2 text-2xl font-black", isDark ? "text-white" : "text-slate-900")}>
                    {totalClicks}
                  </p>
                </div>
                <div className={cx(
                  "rounded-2xl border px-4 py-4",
                  isDark ? "border-white/10 bg-slate-900/70" : "border-slate-100 bg-slate-50"
                )}>
                  <p className={cx("text-[11px] uppercase tracking-[0.2em]", isDark ? "text-slate-500" : "text-slate-400")}>
                    In stock
                  </p>
                  <p className={cx("mt-2 text-2xl font-black", isDark ? "text-white" : "text-slate-900")}>
                    {inStockCount}
                  </p>
                </div>
              </div>
            </div>

            <div className={cx(
              "mt-6 flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm",
              isDark ? "border-teal-300/20 bg-teal-400/10 text-teal-100" : "border-teal-200 bg-teal-50 text-teal-900"
            )}>
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <p>
                Live updates are on. Click a product card to track activity.
                {lastRefresh && ` Last refresh: ${lastRefresh.toLocaleTimeString()}`}
              </p>
            </div>
          </section>

          <section className={cx(
            "rounded-[30px] border p-4 sm:p-5",
            isDark
              ? "border-orange-300/20 bg-gradient-to-br from-orange-400/10 via-white/[0.03] to-transparent"
              : "border-orange-200/80 bg-gradient-to-br from-orange-50 via-white to-orange-50/40"
          )}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className={cx(
                  "inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]",
                  isDark ? "bg-orange-400/15 text-orange-200 ring-1 ring-orange-300/25" : "bg-orange-100 text-orange-700 ring-1 ring-orange-200"
                )}>
                  Expiring Soon
                </p>
                <p className={cx("mt-2 text-sm", isDark ? "text-slate-300" : "text-slate-600")}>
                  Products that are close to expiry.
                </p>
              </div>
              <span className={cx("text-xs font-semibold", isDark ? "text-orange-200" : "text-orange-700")}>
                {expiringSoonProducts.length} item{expiringSoonProducts.length === 1 ? "" : "s"}
              </span>
            </div>

            {expiringSoonProducts.length > 0 ? (
              <div className="overflow-x-auto pb-1">
                <div className="flex w-max min-w-full flex-nowrap gap-2">
                  {expiringSoonProducts.map((product) => (
                    <div
                      key={`expiring-item-${product.product_id}`}
                      className={cx(
                        "flex shrink-0 items-center gap-3 rounded-xl border px-3 py-2",
                        isDark ? "border-white/8 bg-slate-900/68" : "border-slate-100 bg-slate-50/80"
                      )}
                    >
                      <span className={cx(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]",
                        isDark ? "bg-orange-400/12 text-orange-200 ring-1 ring-orange-300/20" : "bg-orange-50 text-orange-700 ring-1 ring-orange-200"
                      )}>
                        {product.category_name}
                      </span>
                      <p className={cx("max-w-[180px] truncate text-sm font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>
                        {product.name}
                      </p>
                      <p className={cx("text-xs", isDark ? "text-slate-300" : "text-slate-600")}>
                        Rs. {Number(product.current_price).toFixed(2)}
                      </p>
                      <button
                        onClick={() => addToCart(product)}
                        className={cx(
                          "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                          isDark
                            ? "bg-amber-300 text-zinc-950 hover:bg-amber-200"
                            : "bg-stone-900 text-white hover:bg-stone-800"
                        )}
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={cx(
                "rounded-2xl border px-4 py-4 text-sm",
                isDark ? "border-slate-700/70 bg-slate-900/68 text-slate-300" : "border-slate-100 bg-white/80 text-slate-600"
              )}>
                No expiring products right now.
              </div>
            )}
          </section>

          <div className={cx(
            "overflow-x-auto pb-1",
            isDark ? "scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent" : ""
          )}>
            <div className="flex w-max min-w-full flex-nowrap gap-2">
              <button
                onClick={() => setStockView("in_stock")}
                className={cx(
                  "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-all",
                  stockView === "in_stock"
                    ? isDark
                      ? "bg-emerald-400 text-zinc-950"
                      : "bg-emerald-700 text-white"
                    : isDark
                      ? "border border-slate-700/70 bg-slate-900/68 text-slate-300 hover:bg-white/[0.07]"
                      : "border border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300 hover:bg-white"
                )}
              >
                In stock ({inStockCount})
              </button>
              <button
                onClick={() => setStockView("all")}
                className={cx(
                  "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-all",
                  stockView === "all"
                    ? isDark
                      ? "bg-amber-300 text-zinc-950"
                      : "bg-stone-900 text-white"
                    : isDark
                      ? "border border-slate-700/70 bg-slate-900/68 text-slate-300 hover:bg-white/[0.07]"
                      : "border border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300 hover:bg-white"
                )}
              >
                All SKUs ({products.length})
              </button>
              <span className={cx(
                "shrink-0 rounded-full px-3 py-2 text-xs font-semibold",
                isDark ? "bg-rose-500/12 text-rose-200" : "bg-rose-100 text-rose-700"
              )}>
                Out of stock: {outOfStockCount}
              </span>
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setFilter(category)}
                  className={cx(
                    "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-all",
                    filter === category
                      ? isDark
                        ? "bg-amber-300 text-zinc-950"
                        : "bg-stone-900 text-white"
                      : isDark
                        ? "border border-slate-700/70 bg-slate-900/68 text-slate-300 hover:bg-white/[0.07]"
                        : "border border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300 hover:bg-white"
                  )}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            {groupedProducts.map((group) => {
              const tone = getCategoryTheme(group.category);
              const categoryTheme = isDark ? tone.dark : tone.light;

              return (
                <section
                  key={group.category}
                  className={cx(
                    "rounded-[30px] border p-4 sm:p-5",
                    categoryTheme.section
                  )}
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={cx("rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]", categoryTheme.headerPill)}>
                        {group.category}
                      </span>
                      <span className={cx("text-xs font-medium", isDark ? "text-slate-300" : "text-slate-600")}>
                        {group.items.length} product{group.items.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {group.items.map((product) => (
                      <div key={product.product_id} className="relative">
                        {(clickCounts[product.product_id] || 0) > 0 && (
                          <div className={cx(
                            "absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shadow-lg",
                            isDark ? "bg-orange-400 text-slate-950" : "bg-orange-500 text-white"
                          )}>
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
                          theme={theme}
                          categoryTheme={categoryTheme}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}

            {groupedProducts.length === 0 && (
              <div className={cx(
                "rounded-3xl border px-5 py-8 text-center text-sm",
                isDark ? "border-slate-700/70 bg-slate-900/68 text-slate-300" : "border-slate-200 bg-white/80 text-slate-600"
              )}>
                {stockView === "in_stock"
                  ? "No in-stock SKUs for this category."
                  : "No SKUs found for this category."}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <CartPanel
            cart={cart}
            removeFromCart={removeFromCart}
            clearCart={clearCart}
            onOrderPlaced={() => {
              showToast("Order placed. Prices will update shortly.");
              setTimeout(fetchProducts, 3000);
            }}
            theme={theme}
          />

          <div className={cx(
            "rounded-[28px] border p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]",
            isDark ? "border-slate-700/80 bg-slate-900/72" : "border-white bg-white/90"
          )}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className={cx("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>
                Live order items
              </p>
              <button
                onClick={() => goToLiveOrders?.()}
                className={cx(
                  "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                  isDark ? "bg-amber-300 text-zinc-950 hover:bg-amber-200" : "bg-stone-900 text-white hover:bg-stone-800"
                )}
              >
                Open page
              </button>
            </div>
            {liveOrderItems.length === 0 ? (
              <p className={cx("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
              No live order items yet.
              </p>
            ) : (
              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {liveOrderItems.map((line, idx) => (
                  <div
                    key={`${line.order_id}-${line.product_id}-${line.timestamp}-${idx}`}
                    className={cx(
                      "flex items-center justify-between rounded-xl border px-3 py-2",
                      isDark ? "border-white/8 bg-slate-900/70" : "border-slate-100 bg-slate-50/80"
                    )}
                  >
                    <div>
                      <p className={cx("text-xs font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>
                        #{String(line.order_id).padStart(5, "0")} · {line.product_name}
                      </p>
                      <p className={cx("text-[11px]", isDark ? "text-slate-400" : "text-slate-500")}>
                        Qty {line.quantity} · Rs. {Number(line.selling_price || 0).toFixed(2)} each
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cx("text-xs font-semibold", isDark ? "text-amber-200" : "text-amber-700")}>
                        Rs. {Number(line.line_total || 0).toFixed(2)}
                      </p>
                      <p className={cx("text-[11px]", isDark ? "text-slate-500" : "text-slate-400")}>
                        {line.timestamp ? new Date(line.timestamp).toLocaleTimeString() : "--"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={cx(
            "rounded-[28px] border p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]",
            isDark ? "border-slate-700/80 bg-slate-900/72" : "border-white bg-white/90"
          )}>
            <p className={cx("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>
              Tip
            </p>
            <p className={cx("mt-2 text-sm leading-6", isDark ? "text-slate-300" : "text-slate-600")}>
              Click products multiple times to see demand and price changes faster.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


