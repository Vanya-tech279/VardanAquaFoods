import { useEffect, useMemo, useState } from "react";
import AuthModal from "./components/AuthModal";
import AddressFormModal from "./components/AddressFormModal";
import LocationBanner from "./components/LocationBanner";
import useDeliveryLocation from "./hooks/useDeliveryLocation";
import { loadRazorpay, openRazorpayCheckout } from "./lib/razorpay";
import Footer from "./components/Footer";
import {
  Fish,
  Search,
  ShoppingBag,
  ShoppingCart,
  ArrowRight,
  Truck,
  Plus,
  Minus,
  X,
  MapPin,
  Clock,
  Store,
  CalendarDays,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

/* ------------------------------------------------------------------
   SETTINGS
------------------------------------------------------------------ */

// Where the backend lives. Set VITE_API_URL in the root .env when you deploy.
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Brand colours. Change the whole site's accent here.
const colors = {
  aqua: "#00A8D6",
  aquaDark: "#0077B6",
};

// Seafood is sold in steps of this many kg (the backend accepts 0.5 kg steps).
const STEP_KG = 1;

const categories = [
  "All",
  "Alive Fish",
  "Chilled Fish",
  "Crabs",
  "Prawns",
  "SPL Meat",
  "Dried Seafood",
  "Fresh Godavari Fish",
];

const categoryIcons = {
  All: "🍽️",
  "Alive Fish": "🐟",
  "Chilled Fish": "🧊",
  Crabs: "🦀",
  Prawns: "🦐",
  "SPL Meat": "🥩",
  "Dried Seafood": "🍤",
  "Fresh Godavari Fish": "🎣",
};

// Which product categories belong under each category chip.
const categoryAliases = {
  "Alive Fish": ["alive fish", "fish"],
  "Chilled Fish": ["chilled fish"],
  Crabs: ["crabs", "crabs & prawns"],
  Prawns: ["prawns", "crabs & prawns"],
  "SPL Meat": ["spl meat"],
  "Dried Seafood": ["dried seafood"],
  "Fresh Godavari Fish": ["fresh godavari fish"],
};

// Used until the backend answers /api/checkout/config.
const FALLBACK_CONFIG = {
  shop: {
    name: "VARDAN AQUA FOODS",
    address: "RH Colony, Seven Temples Road",
    pinCode: "530046",
  },
  nextDate: "",
  slots: [
    { id: "0630-0730", label: "6:30 AM–7:30 AM" },
    { id: "0730-0830", label: "7:30 AM–8:30 AM" },
    { id: "0830-0930", label: "8:30 AM–9:30 AM" },
    { id: "0930-1030", label: "9:30 AM–10:30 AM" },
    { id: "1030-1130", label: "10:30 AM–11:30 AM" },
  ],
  deliveryEnabled: true,
  unpaidOrderMinutes: 15,
  maxRadiusKm: 6,
  feeTiers: [
    { upToKm: 3, fee: 30 },
    { upToKm: 6, fee: 50 },
  ],
};

const EMPTY_ADDRESS_FORM = {
  label: "Home",
  recipientName: "",
  phone: "",
  houseNumber: "",
  street: "",
  locality: "",
  city: "",
  state: "Andhra Pradesh",
  pinCode: "",
  landmark: "",
};

/* ------------------------------------------------------------------
   SMALL HELPERS
------------------------------------------------------------------ */

function formatPrice(price) {
  const value = Number(price) || 0;
  const digits = Number.isInteger(value) ? 0 : 2;

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

// 1 -> "1", 0.5 -> "0.5"
function formatKg(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

// Tomorrow's date (YYYY-MM-DD) in Indian time, same rule as the backend.
function getTomorrowIST() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    tomorrow
  );
}

// "2026-10-27" -> "Tue, 27 Oct"
function formatScheduleDate(dateString) {
  if (!dateString) return "";

  const date = new Date(`${dateString}T12:00:00+05:30`);
  if (Number.isNaN(date.getTime())) return dateString;

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

// Makes sure every cart quantity is a whole number of kg, at least 1.
function normalizeCart(rawCart) {
  return Object.fromEntries(
    Object.entries(rawCart || {})
      .filter(([, quantity]) => Number(quantity) > 0)
      .map(([key, quantity]) => [
        key,
        Math.max(STEP_KG, Math.round(Number(quantity))),
      ])
  );
}

// Combines a saved cart with a cart built before signing in.
function mergeCarts(savedCart, currentCart) {
  const merged = { ...normalizeCart(savedCart) };

  for (const [key, quantity] of Object.entries(normalizeCart(currentCart))) {
    merged[key] = (merged[key] || 0) + quantity;
  }

  return merged;
}

function readSavedCart(userId) {
  try {
    return JSON.parse(localStorage.getItem(`vafCart_${userId}`)) || {};
  } catch {
    return {};
  }
}

// Turns a product from the API into the shape the UI uses.
function formatBackendProduct(product) {
  const variants =
    Array.isArray(product.variants) && product.variants.length > 0
      ? product.variants.map((variant) => ({
        size: String(variant.size).trim().toUpperCase(),
        pricePerKg: Number(variant.pricePerKg) || 0,
        stockKg: Number(variant.stockKg) || 0,
        available: variant.available ?? Number(variant.stockKg) > 0,
      }))
      : [
        {
          size: "S",
          pricePerKg: Number(product.pricePerKg) || 0,
          stockKg: Number(product.stockKg) || 0,
          available: product.available ?? Number(product.stockKg) > 0,
        },
      ];

  return {
    id: String(product._id),
    name: product.name,
    subtitle: product.subtitle || "",
    category: product.category || "",
    image: product.imageUrl || "",
    tag: product.tag || "",
    variants,
  };
}

// One place for every request to the backend.
async function apiRequest(path, { method = "GET", body, auth = false } = {}) {
  const headers = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = localStorage.getItem("vafCustomerToken");

    if (!token) {
      return {
        ok: false,
        status: 401,
        data: { message: "Please sign in to continue." },
      };
    }

    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  return { ok: response.ok, status: response.status, data };
}

/* ------------------------------------------------------------------
   SMALL COMPONENTS
------------------------------------------------------------------ */

function QuantityStepper({ quantity, onMinus, onPlus, plusDisabled, name }) {
  return (
    <div className="flex h-10 items-center gap-0.5 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-1 text-white shadow-md shadow-brand-500/30">
      <button
        type="button"
        onClick={onMinus}
        aria-label={`Remove ${formatKg(STEP_KG)} kg of ${name}`}
        className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/20 active:scale-90"
      >
        <Minus size={16} />
      </button>
      <span
        className="min-w-[3.6rem] text-center text-sm font-bold"
        aria-live="polite"
      >
        {formatKg(quantity)} kg
      </span>
      <button
        type="button"
        onClick={onPlus}
        disabled={plusDisabled}
        aria-label={`Add ${formatKg(STEP_KG)} kg of ${name}`}
        className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/20 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

function ProductCard({ product, size, quantity, onSelectSize, onChange }) {
  const variant =
    product.variants.find((item) => item.size === size) || product.variants[0];
  const soldOut = !variant.available || variant.stockKg <= 0;
  const maxed = quantity + STEP_KG > variant.stockKg;
  const lowStock = !soldOut && variant.stockKg <= 5;

  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-brand-100 bg-white shadow-soft transition duration-300 hover:-translate-y-1 hover:border-brand-300 hover:shadow-lift">
      <div className="relative h-52 overflow-hidden bg-gradient-to-br from-brand-50 to-brand-100">
        <img
          src={product.image || "https://placehold.co/600x400?text=Seafood"}
          alt={product.name}
          loading="lazy"
          className={`h-full w-full object-cover transition duration-500 group-hover:scale-105 ${soldOut ? "grayscale" : ""
            }`}
        />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-brand-900/70 to-transparent" />

        {product.tag && (
          <span className="absolute left-0 top-4 rounded-r-full bg-brand-500 px-3.5 py-1 text-xs font-bold text-white shadow-md">
            {product.tag}
          </span>
        )}

        {soldOut ? (
          <span className="absolute right-3 top-3 rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow">
            Sold out
          </span>
        ) : lowStock ? (
          <span className="absolute right-3 top-3 rounded-full bg-amber-300 px-3 py-1 text-xs font-bold text-amber-950 shadow">
            Only {formatKg(variant.stockKg)} kg left
          </span>
        ) : null}

        <p className="absolute bottom-3 left-4 font-display text-2xl font-extrabold text-white">
          {formatPrice(variant.pricePerKg)}
          <span className="text-xs font-medium text-white/80"> per kg</span>
        </p>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="truncate font-display text-lg font-bold text-brand-900">
          {product.name}
        </h3>
        <p className="truncate text-sm text-slate-500">
          {product.subtitle || product.category}
        </p>

        <p
          className={`mt-3 flex items-center gap-2 text-xs font-semibold ${soldOut
            ? "text-red-600"
            : lowStock
              ? "text-amber-700"
              : "text-emerald-700"
            }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${soldOut
              ? "bg-red-500"
              : lowStock
                ? "bg-amber-500"
                : "bg-emerald-500"
              }`}
          />
          {soldOut
            ? "Out of stock"
            : lowStock
              ? `Only ${formatKg(variant.stockKg)} kg left`
              : `${formatKg(variant.stockKg)} kg available`}
        </p>

        <div className="mt-auto flex items-center gap-2 pt-4">
          <div className="flex flex-1 flex-wrap gap-2">
            {product.variants.map((item) => {
              const on = item.size === variant.size;

              return (
                <button
                  key={item.size}
                  type="button"
                  onClick={() => onSelectSize(item.size)}
                  aria-pressed={on}
                  aria-label={`Select size ${item.size}`}
                  className={`h-9 min-w-9 rounded-full border px-3 text-xs font-bold transition ${on
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-200 text-slate-500 hover:border-brand-300 hover:text-brand-700"
                    }`}
                >
                  {item.size}
                </button>
              );
            })}
          </div>

          {quantity > 0 ? (
            <QuantityStepper
              quantity={quantity}
              name={`${product.name} size ${variant.size}`}
              onMinus={() => onChange(-STEP_KG)}
              onPlus={() => onChange(STEP_KG)}
              plusDisabled={soldOut || maxed}
            />
          ) : (
            <button
              type="button"
              onClick={() => onChange(STEP_KG)}
              disabled={soldOut}
              aria-label={`Add ${product.name} size ${variant.size} to cart`}
              className="h-10 rounded-full border-2 border-brand-500 px-6 text-sm font-bold text-brand-700 transition hover:bg-brand-500 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-brand-700"
            >
              Add
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function StepTitle({ number, children }) {
  return (
    <h3 className="flex items-center gap-3 font-display text-lg font-bold text-brand-900">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-extrabold text-white">
        {number}
      </span>
      {children}
    </h3>
  );
}

function FulfillmentCard({ active, disabled, icon: Icon, title, text, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={active}
      className={`relative flex w-full items-start gap-3 rounded-3xl border-2 p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${active
        ? "border-brand-500 bg-brand-50 shadow-soft"
        : "border-slate-200 bg-white hover:border-brand-300"
        }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white ${active
          ? "bg-gradient-to-br from-brand-400 to-brand-700"
          : "bg-slate-400"
          }`}
      >
        <Icon size={22} />
      </span>
      <span className="min-w-0 pr-5">
        <span className="block font-display font-bold text-brand-900">
          {title}
        </span>
        <span className="mt-0.5 block text-sm leading-5 text-slate-500">
          {text}
        </span>
      </span>
      {active && (
        <CheckCircle2
          size={20}
          className="absolute right-3 top-3 text-brand-500"
        />
      )}
    </button>
  );
}
// Amber box for an order that is saved but not paid yet. It counts down
// the minutes left and shows a "Pay now" button. The server is the real
// judge of time: it cancels the order once the limit passes.
function UnpaidNotice({ order, limitMinutes, paying, disabled, onPay }) {
  const [now, setNow] = useState(() => Date.now());

  // Refresh the countdown every 15 seconds.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const isUnpaid =
    order.status === "Pending" &&
    (order.paymentStatus || "Pending") === "Pending";

  if (!isUnpaid) return null;

  const createdMs = new Date(order.createdAt).getTime();
  const hasTime = Number.isFinite(createdMs);
  const minutesLeft = hasTime
    ? Math.ceil((createdMs + limitMinutes * 60000 - now) / 60000)
    : null;

  // Time is up. The server cancels the order within a minute.
  if (hasTime && minutesLeft <= 0) {
    return (
      <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
        The payment time is over. This order will be cancelled shortly.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      <p className="flex items-center gap-2 font-semibold">
        <Clock size={16} />
        {hasTime
          ? `Pay within ${minutesLeft} ${minutesLeft === 1 ? "minute" : "minutes"}`
          : `Pay within ${limitMinutes} minutes`}
      </p>
      <p className="mt-0.5 text-xs">
        Unpaid orders are cancelled automatically after {limitMinutes} minutes.
      </p>
      <button
        type="button"
        onClick={onPay}
        disabled={disabled}
        className="mt-3 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-5 py-2 text-sm font-bold text-white shadow-md shadow-brand-500/30 transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {paying ? "Opening payment..." : "Pay now"}
      </button>
    </div>
  );
}

const STATUS_STYLES = {
  Pending: "bg-amber-50 text-amber-700 ring-amber-200",
  Confirmed: "bg-brand-50 text-brand-700 ring-brand-200",
  Preparing: "bg-violet-50 text-violet-700 ring-violet-200",
  Ready: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Out for delivery": "bg-cyan-50 text-cyan-700 ring-cyan-200",
  Delivered: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Cancelled: "bg-red-50 text-red-700 ring-red-200",
};

function OrderCard({ order, limitMinutes, paying, payDisabled, onPay }) {
  const method = order.fulfillmentMethod;
  const total = order.bill?.total ?? order.totalAmount ?? 0;
  const status = order.status || "Pending";

  return (
    <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold text-brand-900">
            Order #{String(order._id).slice(-6).toUpperCase()}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Placed{" "}
            {order.createdAt
              ? new Date(order.createdAt).toLocaleDateString("en-IN")
              : "on an unknown date"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${STATUS_STYLES[status] || "bg-slate-100 text-slate-700 ring-slate-200"
            }`}
        >
          {status}
        </span>
      </div>

      {method && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-brand-50 p-3 text-sm text-brand-900">
          {method === "takeaway" ? (
            <Store size={18} className="mt-0.5 shrink-0 text-brand-600" />
          ) : (
            <Truck size={18} className="mt-0.5 shrink-0 text-brand-600" />
          )}
          <div>
            <p className="font-semibold">
              {method === "takeaway" ? "Takeaway from shop" : "Doorstep delivery"}
            </p>
            <p className="mt-0.5 text-brand-700">
              {formatScheduleDate(order.scheduledDate)}
              {order.slot?.label ? `, ${order.slot.label}` : ""}
            </p>
          </div>
        </div>
      )}

      {Array.isArray(order.items) && order.items.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
          {order.items.map((item, index) => (
            <li
              key={`${item.productId}-${item.size}-${index}`}
              className="flex items-center gap-2"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
              <span>
                {item.name}
                {item.size ? ` (${item.size})` : ""}
                {item.quantityKg ? `, ${formatKg(item.quantityKg)} kg` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      <UnpaidNotice
        order={order}
        limitMinutes={limitMinutes}
        paying={paying}
        disabled={payDisabled}
        onPay={onPay}
      />

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${order.paymentStatus === "Paid"
            ? "bg-emerald-50 text-emerald-700"
            : "bg-slate-100 text-slate-600"
            }`}
        >
          Payment: {order.paymentStatus || "Pending"}
        </span>
        <span className="font-display text-xl font-extrabold text-brand-900">
          {formatPrice(total)}
        </span>
      </div>
    </div>
  );
}
/* ------------------------------------------------------------------
   MAIN APP
------------------------------------------------------------------ */

export default function App() {
  // ----- sign in -----
  const [authOpen, setAuthOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [authUser, setAuthUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("vafCustomerUser")) || null;
    } catch {
      return null;
    }
  });

  // ----- shop settings from the backend -----
  const [config, setConfig] = useState(FALLBACK_CONFIG);
  // Checks the customer's location once after sign-in.
  const deliveryLocation = useDeliveryLocation(authUser?.id);
  // ----- products, search, categories -----
  const [backendProducts, setBackendProducts] = useState([]);
  const [productsStatus, setProductsStatus] = useState("loading");
  const [productsReload, setProductsReload] = useState(0);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedSizes, setSelectedSizes] = useState({});

  // ----- cart -----
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [cart, setCart] = useState(() => {
    try {
      const user = JSON.parse(localStorage.getItem("vafCustomerUser"));
      return user?.id ? normalizeCart(readSavedCart(user.id)) : {};
    } catch {
      return {};
    }
  });

  // ----- addresses -----
  const [addressesOpen, setAddressesOpen] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [addressesError, setAddressesError] = useState("");
  const [addressFormOpen, setAddressFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [addressForm, setAddressForm] = useState(EMPTY_ADDRESS_FORM);
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressFormError, setAddressFormError] = useState("");
  const [selectedAddressId, setSelectedAddressId] = useState("");

  // ----- order history -----
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [myOrders, setMyOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");

  // ----- checkout -----
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [fulfillmentMethod, setFulfillmentMethod] = useState("delivery");
  const [slotData, setSlotData] = useState({ date: "", slots: [] });
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [slotsReload, setSlotsReload] = useState(0);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [quoteReload, setQuoteReload] = useState(0);
  const [billOpen, setBillOpen] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [orderResult, setOrderResult] = useState(null);
  const [paymentState, setPaymentState] = useState("idle"); // idle | opening | verifying | paid | unpaid
  // True while we are still waiting to learn whether the payment worked.
  const paymentBusy =
    paymentState === "idle" ||
    paymentState === "opening" ||
    paymentState === "verifying";
  const [paymentMessage, setPaymentMessage] = useState("");
  const [payingOrderId, setPayingOrderId] = useState(""); // "Pay now" in My orders
  /* ----------------------------- derived data ----------------------------- */

  const displayProducts = backendProducts;

  const visibleProducts = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);

    return displayProducts.filter((product) => {
      const matchesCategory =
        category === "All" ||
        (categoryAliases[category] || [category.toLowerCase()]).includes(
          product.category.toLowerCase().trim()
        );

      const haystack =
        `${product.name} ${product.subtitle} ${product.category}`.toLowerCase();

      return matchesCategory && words.every((word) => haystack.includes(word));
    });
  }, [displayProducts, category, search]);

  const cartItems = useMemo(() => {
    const items = [];

    for (const [key, quantity] of Object.entries(cart)) {
      if (Number(quantity) <= 0) continue;

      const [productId, size] = key.split("__");
      const product = displayProducts.find((item) => item.id === productId);
      if (!product) continue;

      items.push({
        ...product,
        cartKey: key,
        size,
        variant: product.variants.find((item) => item.size === size),
        quantity: Number(quantity),
      });
    }

    return items;
  }, [cart, displayProducts]);

  const cartCount = cartItems.reduce((total, item) => total + item.quantity, 0);

  // Estimated subtotal. The backend recalculates the real bill at checkout.
  const cartTotal = cartItems.reduce(
    (total, item) => total + (item.variant?.pricePerKg || 0) * item.quantity,
    0
  );

  const hasOutOfStockItems = cartItems.some(
    (item) =>
      !item.variant ||
      !item.variant.available ||
      item.variant.stockKg <= 0 ||
      item.quantity > item.variant.stockKg
  );

  // A text version of the cart. The quote effect re-runs only when this changes.
  const cartSignature = JSON.stringify(
    cartItems.map((item) => ({
      productId: item.id,
      size: item.size,
      quantityKg: item.quantity,
    }))
  );

  const tomorrowDate = config.nextDate || getTomorrowIST();
  const slotStart = config.slots[0]?.label.split("–")[0];
  const slotEnd = config.slots[config.slots.length - 1]?.label.split("–")[1];
  const lowestDeliveryFee = Math.min(
    ...config.feeTiers.map((tier) => tier.fee)
  );

  const selectedAddress = savedAddresses.find(
    (address) => address._id === selectedAddressId
  );
  const selectedSlot = slotData.slots.find((slot) => slot.id === selectedSlotId);

  // Why the "Place order" button is not ready yet (empty when it is ready).
  let blockReason = "";
  if (hasOutOfStockItems) {
    blockReason = "Remove out-of-stock items from your cart.";
  } else if (fulfillmentMethod === "delivery" && !selectedAddressId) {
    blockReason = "Select a delivery address.";
  } else if (!selectedSlotId) {
    blockReason = "Choose a time slot.";
  } else if (quoteError) {
    blockReason = quoteError;
  } else if (quoteLoading || !quote) {
    blockReason = "Calculating your bill...";
  }

  /* -------------------------------- effects -------------------------------- */

  // Save the cart for the signed-in customer.
  useEffect(() => {
    if (!authUser?.id) return;
    localStorage.setItem(`vafCart_${authUser.id}`, JSON.stringify(cart));
  }, [cart, authUser]);

  // Hide the small message after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  // Shop address, slots and delivery rules.
  useEffect(() => {
    apiRequest("/api/checkout/config")
      .then(({ ok, data }) => {
        if (ok && data.success) {
          setConfig({ ...FALLBACK_CONFIG, ...data });
        }
      })
      .catch(() => { });
  }, []);

  // Products, refreshed every 10 seconds so stock stays current.
  useEffect(() => {
    let ignore = false;

    async function fetchProducts() {
      try {
        const { ok, data } = await apiRequest("/api/products");
        if (!ok) throw new Error("Failed to fetch products");

        const list = Array.isArray(data)
          ? data
          : Array.isArray(data.products)
            ? data.products
            : [];

        if (!ignore) {
          setBackendProducts(list.map(formatBackendProduct));
          setProductsStatus("ready");
        }
      } catch {
        if (!ignore) {
          setProductsStatus((current) =>
            current === "ready" ? "ready" : "error"
          );
        }
      }
    }

    fetchProducts();
    const intervalId = setInterval(fetchProducts, 10000);

    return () => {
      ignore = true;
      clearInterval(intervalId);
    };
  }, [productsReload]);

  // Time slots for the chosen fulfilment method.
  useEffect(() => {
    if (!checkoutOpen || orderResult) return;

    let ignore = false;
    setSlotsLoading(true);
    setSlotsError("");

    apiRequest(`/api/checkout/slots?method=${fulfillmentMethod}`)
      .then(({ ok, data }) => {
        if (ignore) return;
        if (!ok || !data.success) {
          throw new Error(data.message || "Unable to load time slots.");
        }

        setSlotData({ date: data.date, slots: data.slots });
        setSelectedSlotId((current) =>
          data.slots.some((slot) => slot.id === current && slot.available)
            ? current
            : ""
        );
      })
      .catch((error) => {
        if (!ignore) {
          setSlotData({ date: "", slots: [] });
          setSlotsError(error.message || "Unable to load time slots.");
        }
      })
      .finally(() => {
        if (!ignore) setSlotsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [checkoutOpen, orderResult, fulfillmentMethod, slotsReload]);

  // Live bill from the backend. Runs again whenever anything that changes the price changes.
  useEffect(() => {
    if (!checkoutOpen || orderResult) return;

    const items = JSON.parse(cartSignature);
    if (items.length === 0) return;

    if (fulfillmentMethod === "delivery" && !selectedAddressId) {
      setQuote(null);
      setQuoteError("");
      return;
    }

    let ignore = false;

    const timer = setTimeout(async () => {
      setQuoteLoading(true);
      setQuoteError("");

      try {
        const { ok, status, data } = await apiRequest("/api/checkout/quote", {
          method: "POST",
          auth: true,
          body: {
            items,
            fulfillmentMethod,
            addressId:
              fulfillmentMethod === "delivery" ? selectedAddressId : undefined,
          },
        });

        if (ignore) return;

        if (status === 401) {
          handleAuthExpired();
          return;
        }

        if (!ok || !data.success) {
          setQuote(null);
          setQuoteError(data.message || "Unable to calculate your bill.");
        } else {
          setQuote(data);
        }
      } catch {
        if (!ignore) {
          setQuote(null);
          setQuoteError("Cannot reach the server. Please check your connection.");
        }
      } finally {
        if (!ignore) setQuoteLoading(false);
      }
    }, 250);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    checkoutOpen,
    orderResult,
    fulfillmentMethod,
    selectedAddressId,
    cartSignature,
    quoteReload,
  ]);

  /* ------------------------------- handlers ------------------------------- */

  function showToast(message) {
    setToast(message);
  }

  function handleSearchChange(value) {
    // Searching should look through every category.
    if (value.trim() && category !== "All") {
      setCategory("All");
    }

    // Jump to the results the first time the customer starts typing.
    if (!search.trim() && value.trim()) {
      document
        .getElementById("products")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    setSearch(value);
  }

  function updateCart(id, change, size) {
    const product = displayProducts.find((item) => item.id === id);
    if (!product) return;

    const selectedSize =
      size || selectedSizes[id] || product.variants[0]?.size || "S";
    const variant = product.variants.find((item) => item.size === selectedSize);
    if (!variant) return;

    const cartKey = `${id}__${selectedSize}`;
    const nextQuantity = Math.round(((cart[cartKey] || 0) + change) * 100) / 100;

    if (change > 0 && (!variant.available || variant.stockKg <= 0)) {
      showToast(`Size ${selectedSize} of ${product.name} is out of stock.`);
      return;
    }

    if (change > 0 && nextQuantity > variant.stockKg) {
      showToast(
        `Only ${formatKg(variant.stockKg)} kg of ${product.name} (size ${selectedSize}) is available.`
      );
      return;
    }

    setCart((current) => {
      const next = { ...current };

      if (nextQuantity <= 0) {
        delete next[cartKey];
      } else {
        next[cartKey] = nextQuantity;
      }

      return next;
    });
  }

  function handleLogin({ token, user }) {
    localStorage.setItem("vafCustomerToken", token);
    localStorage.setItem("vafCustomerUser", JSON.stringify(user));

    // Keep items added before signing in, and combine them with the saved cart.
    setCart((current) => mergeCarts(readSavedCart(user.id), current));
    setAuthUser(user);
    setAuthOpen(false);
  }

  function handleLogout() {
    localStorage.removeItem("vafCustomerToken");
    localStorage.removeItem("vafCustomerUser");

    setAuthUser(null);
    setCart({});
  }

  function handleAuthExpired() {
    handleLogout();
    setCheckoutOpen(false);
    setOrderResult(null);
    setAuthOpen(true);
    showToast("Your session expired. Please sign in again.");
  }

  /* ---- addresses ---- */

  async function loadAddresses() {
    setAddressesLoading(true);
    setAddressesError("");

    try {
      const { ok, status, data } = await apiRequest("/api/addresses/my", {
        auth: true,
      });

      if (status === 401) {
        handleAuthExpired();
        return [];
      }

      if (!ok) throw new Error(data.message || "Unable to load your addresses.");

      const list = data.addresses || [];
      setSavedAddresses(list);
      setSelectedAddressId((current) =>
        list.some((address) => address._id === current)
          ? current
          : list.find((address) => address.isDefault)?._id || list[0]?._id || ""
      );

      return list;
    } catch (error) {
      setAddressesError(error.message || "Something went wrong.");
      return [];
    } finally {
      setAddressesLoading(false);
    }
  }

  async function handleFetchMyAddresses() {
    setAddressesOpen(true);
    setAccountMenuOpen(false);
    await loadAddresses();
  }

  function openNewAddressForm() {
    setEditingAddress(null);
    setAddressForm({
      ...EMPTY_ADDRESS_FORM,
      recipientName: authUser?.name || "",
    });
    setAddressFormError("");
    setAddressFormOpen(true);
  }

  function openEditAddressForm(address) {
    setEditingAddress(address);
    setAddressForm({
      label: address.label || "Home",
      recipientName: address.recipientName || "",
      phone: address.phone || "",
      houseNumber: address.houseNumber || "",
      street: address.street || "",
      locality: address.locality || "",
      city: address.city || "",
      state: address.state || "Andhra Pradesh",
      pinCode: address.pinCode || "",
      landmark: address.landmark || "",
      latitude: address.latitude ?? null,
      longitude: address.longitude ?? null,
    });
    setAddressFormError("");
    setAddressFormOpen(true);
  }

  async function handleSaveAddress(event) {
    event.preventDefault();
    setAddressSaving(true);
    setAddressFormError("");

    try {
      const { ok, data } = await apiRequest(
        editingAddress
          ? `/api/addresses/${editingAddress._id}`
          : "/api/addresses",
        {
          method: editingAddress ? "PATCH" : "POST",
          auth: true,
          body: addressForm,
        }
      );

      if (!ok) throw new Error(data.message || "Unable to save your address.");

      const savedId = data.address?._id || editingAddress?._id;

      setAddressFormOpen(false);
      setEditingAddress(null);
      await loadAddresses();

      // While checking out, use the address that was just saved.
      if (checkoutOpen && savedId) {
        setSelectedAddressId(savedId);
        setQuoteReload((count) => count + 1);
      }
    } catch (error) {
      setAddressFormError(error.message || "Something went wrong.");
    } finally {
      setAddressSaving(false);
    }
  }

  async function handleDeleteAddress(address) {
    if (!window.confirm("Delete this saved address?")) return;

    try {
      const { ok, data } = await apiRequest(`/api/addresses/${address._id}`, {
        method: "DELETE",
        auth: true,
      });

      if (!ok) throw new Error(data.message || "Unable to delete address.");

      setSavedAddresses((previous) =>
        previous.filter((item) => item._id !== address._id)
      );
      setSelectedAddressId((current) =>
        current === address._id ? "" : current
      );
    } catch (error) {
      showToast(error.message || "Unable to delete address.");
    }
  }

  /* ---- orders ---- */

  // quiet = true refreshes the list without the "Loading..." screen.
  // (When used as a click handler, the click event arrives here and
  // quiet simply stays false.)
  async function handleFetchMyOrders({ quiet = false } = {}) {
    setOrdersOpen(true);
    setAccountMenuOpen(false);
    if (!quiet) setOrdersLoading(true);
    setOrdersError("");

    try {
      const { ok, status, data } = await apiRequest("/api/orders/my", {
        auth: true,
      });

      if (status === 401) {
        handleAuthExpired();
        return;
      }

      if (!ok) throw new Error(data.message || "Unable to load your orders.");

      setMyOrders(data.orders || []);
    } catch (error) {
      setOrdersError(error.message || "Something went wrong.");
    } finally {
      setOrdersLoading(false);
    }
  }

  /* ---- checkout ---- */

  async function handleCheckout() {
    if (!authUser) {
      setCartOpen(false);
      setAuthOpen(true);
      return;
    }

    if (cartItems.length === 0) return;

    setCartOpen(false);
    setOrderResult(null);
    setOrderError("");
    setQuote(null);
    setQuoteError("");
    setSelectedSlotId("");
    setBillOpen(false);
    setCheckoutOpen(true);

    await loadAddresses();
  }

  function closeCheckout() {
    setCheckoutOpen(false);
    setOrderResult(null);
    setOrderError("");
    setPaymentState("idle");
    setPaymentMessage("");
  }

  function chooseFulfillment(method) {
    if (method === fulfillmentMethod) return;

    setFulfillmentMethod(method);
    setSelectedSlotId("");
    setQuote(null);
    setQuoteError("");
    setOrderError("");
  }
  // Opens the UPI popup for a saved order, then asks the backend to verify.
  // Opens the UPI popup for a saved order, then asks the backend to verify.
  // Returns { status: "paid" | "unpaid" | "auth", message }.
  // track = false is used from "My orders", where the checkout card is
  // closed, so the card's payment state must stay untouched.
  async function startPayment(orderId, { track = true } = {}) {
    const setState = (value) => {
      if (track) setPaymentState(value);
    };
    const setMessage = (value) => {
      if (track) setPaymentMessage(value);
    };

    setState("opening");
    setMessage("");

    try {
      const scriptReady = await loadRazorpay();

      if (!scriptReady) {
        throw new Error(
          "We could not load the payment window. Check your internet and try again."
        );
      }

      // 1) The backend creates the payment and tells us the real amount.
      const created = await apiRequest("/api/payments/create-order", {
        method: "POST",
        auth: true,
        body: { orderId },
      });

      if (created.status === 401) {
        handleAuthExpired();
        return { status: "auth", message: "" };
      }

      if (!created.ok || !created.data.success) {
        throw new Error(created.data.message || "Unable to start the payment.");
      }

      // 2) The customer pays in Razorpay's popup.
      const result = await openRazorpayCheckout({
        keyId: created.data.keyId,
        razorpayOrderId: created.data.razorpayOrderId,
        amount: created.data.amount,
        currency: created.data.currency,
        description: "Seafood pre-order",
        prefill: { name: authUser?.name, email: authUser?.email },
        themeColor: colors.aqua,
      });

      if (result.status !== "paid") {
        const message = result.lastError
          ? `Payment was not completed: ${result.lastError}`
          : "Payment was not completed.";
        setState("unpaid");
        setMessage(message);
        return { status: "unpaid", message };
      }

      // 3) The backend checks Razorpay's signature. Only it can say "paid".
      setState("verifying");

      const verified = await apiRequest("/api/payments/verify", {
        method: "POST",
        auth: true,
        body: {
          orderId,
          razorpay_order_id: result.response.razorpay_order_id,
          razorpay_payment_id: result.response.razorpay_payment_id,
          razorpay_signature: result.response.razorpay_signature,
        },
      });

      if (!verified.ok || !verified.data.success) {
        const message =
          verified.data.message || "We could not confirm your payment.";
        setState("unpaid");
        setMessage(message);
        return { status: "unpaid", message };
      }

      setState("paid");
      return { status: "paid", message: "" };
    } catch (error) {
      const message =
        error.message || "Something went wrong with the payment.";
      setState("unpaid");
      setMessage(message);
      return { status: "unpaid", message };
    }
  }

  // "Pay now" on an unpaid order in My orders.
  async function handlePayNow(order) {
    if (payingOrderId) return;

    setPayingOrderId(String(order._id));

    const outcome = await startPayment(String(order._id), { track: false });

    setPayingOrderId("");

    if (outcome.status === "paid") {
      showToast("Payment received. Your order is confirmed.");
    } else if (outcome.status === "unpaid") {
      showToast(outcome.message || "Payment was not completed.");
    }

    // Reload the list so the order shows its new status.
    if (outcome.status !== "auth") {
      await handleFetchMyOrders({ quiet: true });
    }
  }
  async function handlePlaceOrder() {
    if (placingOrder || blockReason) return;

    setPlacingOrder(true);
    setOrderError("");

    try {
      const { ok, status, data } = await apiRequest("/api/orders", {
        method: "POST",
        auth: true,
        body: {
          items: JSON.parse(cartSignature),
          fulfillmentMethod,
          addressId:
            fulfillmentMethod === "delivery" ? selectedAddressId : undefined,
          date: slotData.date,
          slotId: selectedSlotId,
        },
      });

      if (status === 401) {
        handleAuthExpired();
        return;
      }

      if (!ok || !data.success) {
        // Slot full or stock changed: refresh both so the screen is correct.
        if (status === 409) {
          setSelectedSlotId("");
          setSlotsReload((count) => count + 1);
          setQuoteReload((count) => count + 1);
        }
        throw new Error(data.message || "Unable to place your order.");
      }

      setOrderResult({
        orderId: data.orderId,
        bill: data.bill,
        method: fulfillmentMethod,
        date: slotData.date,
        slotLabel: selectedSlot?.label || "",
        address: fulfillmentMethod === "delivery" ? selectedAddress : null,
      });

      // The order is saved, so empty the cart.
      setCart({});
      if (authUser?.id) {
        localStorage.removeItem(`vafCart_${authUser.id}`);
      }

      // Open the UPI popup straight away.
      startPayment(String(data.orderId));
    } catch (error) {
      setOrderError(error.message || "Something went wrong.");
    } finally {
      setPlacingOrder(false);
    }
  }

  /* --------------------------------- render --------------------------------- */

  return (
    <div className="ocean-page min-h-screen pb-24 text-slate-900 md:pb-0">
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:none; } }
        @keyframes slideIn { from { transform:translateX(100%); } to { transform:none; } }
        @keyframes slideUp { from { transform:translateY(120%); } to { transform:none; } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes pop { 0% { transform:scale(.4); } 60% { transform:scale(1.35); } 100% { transform:scale(1); } }
        @keyframes bob { 0%,100% { transform:translateY(0) rotate(0); } 50% { transform:translateY(-3px) rotate(-6deg); } }
        @keyframes bubble { 0% { transform:translateY(0) scale(1); opacity:.5; } 50% { transform:translateY(-26px) scale(1.12); opacity:.9; } 100% { transform:translateY(0) scale(1); opacity:.5; } }
        @keyframes sheen { 0% { transform:translateX(-120%) skewX(-20deg); } 60%,100% { transform:translateX(320%) skewX(-20deg); } }
        @keyframes swim { 0% { transform:translateX(-18px) translateY(0) scaleX(1); } 45% { transform:translateX(18px) translateY(-8px) scaleX(1); } 50% { transform:translateX(18px) translateY(-8px) scaleX(-1); } 95% { transform:translateX(-18px) translateY(0) scaleX(-1); } 100% { transform:translateX(-18px) translateY(0) scaleX(1); } }
        @keyframes drift { 0%,100% { transform:translate3d(0,0,0) rotate(0deg); } 50% { transform:translate3d(0,-12px,0) rotate(3deg); } }
        @keyframes waveShift { from { background-position-x:0; } to { background-position-x:240px; } }
        .ocean-page { background: radial-gradient(ellipse at 12% 8%, rgba(103,232,249,.18), transparent 30%), linear-gradient(180deg,#f2fbfe 0%,#f8fdff 45%,#edfaff 100%); }
        .ocean-header { background:rgba(255,255,255,.92); backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px); box-shadow:0 8px 28px rgba(8,145,178,.06); }
        .ocean-hero { isolation:isolate; box-shadow:0 24px 70px rgba(3,105,161,.20); }
        .ocean-hero::before { content:""; position:absolute; inset:0; z-index:0; pointer-events:none; background:radial-gradient(circle at 80% 20%,rgba(255,255,255,.24),transparent 28%),linear-gradient(120deg,rgba(3,37,65,.22),transparent 58%); }
        .ocean-hero::after { content:""; position:absolute; z-index:1; pointer-events:none; left:-5%; right:-5%; bottom:-30px; height:78px; opacity:.55; background:radial-gradient(65px 22px at 65px 0,rgba(255,255,255,.55) 98%,transparent 100%) repeat-x; background-size:130px 46px; animation:waveShift 18s linear infinite; }
        .fish-swim { animation:swim 9s ease-in-out infinite; filter:drop-shadow(0 5px 12px rgba(2,44,68,.16)); }
        .fish-drift { animation:drift 5s ease-in-out infinite; }
        .seafood-card { border:1px solid rgba(186,230,253,.75); box-shadow:0 8px 28px rgba(8,145,178,.07); }
        .seafood-card:hover { border-color:rgba(6,182,212,.42); box-shadow:0 22px 42px rgba(8,145,178,.15); }
        .category-chip:focus-visible, .seafood-card button:focus-visible { outline:3px solid rgba(6,182,212,.45); outline-offset:3px; }
        .ocean-panel { box-shadow:-18px 0 60px rgba(3,37,65,.16); }
        .animate-fadeUp { opacity:0; animation: fadeUp .6s cubic-bezier(.2,.8,.2,1) forwards; }
        .animate-slideIn { animation: slideIn .35s cubic-bezier(.2,.8,.2,1); }
        .animate-slideUp { animation: slideUp .4s cubic-bezier(.2,.8,.2,1); }
        .animate-fadeIn { animation: fadeIn .3s ease-out; }
        .animate-pop { animation: pop .4s ease-out; }
        .animate-bob { animation: bob 3s ease-in-out infinite; }
        .animate-bubble { animation: bubble 6s ease-in-out infinite; }
        .btn-sheen { position:relative; overflow:hidden; }
        .btn-sheen::after { content:""; position:absolute; top:0; bottom:0; width:40%; background:linear-gradient(90deg,transparent,rgba(255,255,255,.7),transparent); animation: sheen 3.2s ease-in-out infinite; }
        .no-scrollbar::-webkit-scrollbar { display:none; }
        .no-scrollbar { -ms-overflow-style:none; scrollbar-width:none; }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation:none !important; transition:none !important; scroll-behavior:auto !important; } .animate-fadeUp { opacity:1; } }
      `}</style>

      {/* ------------------------------ Top strip ------------------------------ */}
      <div className="bg-brand-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-6 gap-y-1 px-4 py-2 text-xs font-medium sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={14} className="text-amber-300" />
            Pre-order today, get it {formatScheduleDate(tomorrowDate)}
          </span>
          {slotStart && slotEnd && (
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              <Clock size={14} className="text-brand-300" />
              {slotStart} to {slotEnd}
            </span>
          )}
          <span className="hidden items-center gap-1.5 md:inline-flex">
            <Truck size={14} className="text-brand-300" />
            Delivery within {config.maxRadiusKm} km
          </span>
        </div>
      </div>

      {/* ------------------------------ Header ------------------------------ */}
      <header className="ocean-header sticky top-0 z-30 border-b border-brand-100/70">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
          <a href="#home" className="flex shrink-0 items-center gap-3">
            <span className="animate-bob flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-lg shadow-brand-500/30">
              <Fish size={24} />
            </span>
            <span className="leading-tight">
              <span className="block font-display text-base font-extrabold tracking-tight text-brand-900 sm:text-xl">
                VARDAN AQUA FOODS
              </span>
              <span className="hidden text-xs font-medium tracking-wide text-slate-500 sm:block">
                Freshness from the sea
              </span>
            </span>
          </a>

          {/* Cart and account */}
          <div className="ml-auto flex items-center gap-2 md:order-3 md:ml-0">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative flex items-center gap-2 rounded-full border border-brand-100 bg-white px-4 py-2.5 text-sm font-semibold text-brand-900 shadow-sm transition hover:border-brand-300 hover:shadow-soft"
              aria-label={`Open cart, ${formatKg(cartCount)} kg`}
            >
              <ShoppingBag size={19} className="text-brand-600" />
              <span className="hidden sm:inline">Cart</span>
              {cartCount > 0 && (
                <span
                  key={cartCount}
                  className="animate-pop flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-xs font-bold text-white"
                >
                  {formatKg(cartCount)}
                </span>
              )}
            </button>

            {authUser ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((open) => !open)}
                  aria-expanded={accountMenuOpen}
                  className="flex max-w-40 items-center gap-2 rounded-full border border-brand-100 bg-white py-1.5 pl-1.5 pr-4 text-sm font-semibold text-brand-900 shadow-sm transition hover:border-brand-300 hover:shadow-soft"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-sm font-bold text-white">
                    {(authUser.name || "?").charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden truncate sm:inline">
                    {authUser.name}
                  </span>
                </button>

                {accountMenuOpen && (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setAccountMenuOpen(false)}
                      aria-label="Close account menu"
                    />
                    <div className="animate-fadeIn absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-brand-100 bg-white py-2 shadow-lift">
                      <button
                        type="button"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          setAuthOpen(true);
                        }}
                        className="block w-full px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-brand-50"
                      >
                        My account
                      </button>
                      <button
                        type="button"
                        onClick={handleFetchMyOrders}
                        className="block w-full px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-brand-50"
                      >
                        My orders
                      </button>
                      <button
                        type="button"
                        onClick={handleFetchMyAddresses}
                        className="block w-full px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-brand-50"
                      >
                        My addresses
                      </button>
                      <div className="my-1 h-px bg-slate-100" />
                      <button
                        type="button"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          handleLogout();
                        }}
                        className="block w-full px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                      >
                        Log out
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
                className="rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-500/30 transition hover:opacity-90 active:scale-95"
              >
                Sign in
              </button>
            )}
          </div>

          {/* Search: its own row on mobile, centred on desktop */}
          <label className="order-last flex w-full items-center gap-3 rounded-full border border-brand-100 bg-white px-5 py-3 shadow-sm transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100 md:order-2 md:w-auto md:max-w-xl md:flex-1">
            <Search size={18} className="shrink-0 text-brand-500" />
            <input
              type="search"
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  document
                    .getElementById("products")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
              placeholder="Search fish, prawns, crabs"
              aria-label="Search seafood"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            )}
          </label>
        </div>
      </header>
      <LocationBanner
        status={deliveryLocation.status}
        dismissed={deliveryLocation.dismissed}
        onRetry={deliveryLocation.recheck}
        onDismiss={deliveryLocation.dismiss}
      />
      <main id="home">
        {/* ------------------------------- Hero ------------------------------- */}
        <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
          <div className="ocean-hero relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-800 via-brand-600 to-brand-400 text-white">
            <span className="animate-bubble pointer-events-none absolute -right-8 top-8 h-28 w-28 rounded-full bg-white/10" />
            <span
              className="animate-bubble pointer-events-none absolute bottom-6 right-1/3 h-12 w-12 rounded-full bg-white/15"
              style={{ animationDelay: "1.5s" }}
            />

            <div className="animate-fadeUp relative z-10 max-w-2xl p-7 sm:p-12 lg:p-16">
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-4 py-1.5 text-sm font-bold text-amber-950 shadow-md">
                <CalendarDays size={16} />
                Delivering tomorrow, {formatScheduleDate(tomorrowDate)}
              </span>

              <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl">
                Pre-order today,
                <br />
                <span className="text-amber-200">fresh seafood</span> tomorrow.
              </h1>

              <p className="mt-4 max-w-lg text-base leading-7 text-white/90 sm:text-lg">
                Choose your catch now and pick a morning slot for tomorrow. We
                bring it to your doorstep, or you can collect it from our shop.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-4">
                <a
                  href="#products"
                  className="btn-sheen inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-bold text-brand-700 shadow-xl shadow-brand-900/20 transition hover:scale-105 active:scale-95"
                >
                  Pre-order now <ArrowRight size={18} />
                </a>
                {slotStart && slotEnd && (
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-white/90">
                    <Clock size={16} />
                    Morning slots, {slotStart} to {slotEnd}
                  </span>
                )}
              </div>

              <ul className="mt-8 flex flex-wrap gap-2.5 text-sm font-semibold">
                <li className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 backdrop-blur">
                  <Truck size={16} /> Doorstep delivery
                </li>
                <li className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 backdrop-blur">
                  <Store size={16} /> Shop takeaway
                </li>
                <li className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 backdrop-blur">
                  <CheckCircle2 size={16} /> Pay by UPI
                </li>
              </ul>
            </div>

            <img
              src="https://images.unsplash.com/photo-1510130387422-82bed34b37e9?auto=format&fit=crop&w=1000&q=85"
              alt=""
              className="absolute inset-y-0 right-0 hidden h-full w-1/2 object-cover md:block"
              style={{
                maskImage: "linear-gradient(to right, transparent, black 45%)",
                WebkitMaskImage:
                  "linear-gradient(to right, transparent, black 45%)",
              }}
            />

            <div
              className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-1/2 overflow-hidden md:block"
              aria-hidden="true"
            >
              <Fish
                size={54}
                strokeWidth={1.3}
                className="fish-swim absolute right-[16%] top-[18%] text-white/80"
              />
              <Fish
                size={30}
                strokeWidth={1.4}
                className="fish-swim absolute right-[38%] top-[48%] text-cyan-50/90"
                style={{ animationDelay: "-2.5s", animationDuration: "7s" }}
              />
              <Fish
                size={22}
                strokeWidth={1.5}
                className="fish-swim absolute bottom-[26%] right-[12%] text-white/70"
                style={{ animationDelay: "-4s", animationDuration: "11s" }}
              />
              <span className="fish-drift absolute right-[28%] top-[27%] h-3 w-3 rounded-full bg-white/50" />
            </div>

            {/* Floating info card (desktop only) */}
            {slotStart && slotEnd && (
              <div className="absolute bottom-10 right-8 z-20 hidden w-64 rounded-2xl bg-white/95 p-5 text-slate-900 shadow-lift backdrop-blur lg:block">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-600">
                  Tomorrow's slots
                </p>
                <p className="mt-2 font-display text-lg font-bold text-brand-900">
                  {slotStart} to {slotEnd}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {formatScheduleDate(tomorrowDate)}, {config.slots.length}{" "}
                  time slots
                </p>
                <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <MapPin size={13} className="text-brand-500" />
                  Delivery within {config.maxRadiusKm} km
                </p>
              </div>
            )}
          </div>
        </section>
        {/* ----------------------------- Categories ----------------------------- */}
        <section className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">
            Browse
          </p>
          <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-brand-900 sm:text-3xl">
            Explore the catch
          </h2>

          <div className="no-scrollbar -mx-4 mt-5 flex gap-3 overflow-x-auto px-4 pb-3">
            {categories.map((item) => {
              const active = category === item;

              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  aria-pressed={active}
                  className={`flex shrink-0 items-center gap-2.5 rounded-full border px-5 py-3 text-sm font-semibold transition ${active
                    ? "border-transparent bg-gradient-to-r from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/30"
                    : "border-brand-100 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700 hover:shadow-soft"
                    }`}
                >
                  <span className="text-xl leading-none">
                    {categoryIcons[item] || "🐟"}
                  </span>
                  {item}
                </button>
              );
            })}
          </div>
        </section>
        {/* ------------------------------ Products ------------------------------ */}
        <section
          id="products"
          className="mx-auto max-w-7xl scroll-mt-40 px-4 py-10 sm:px-6 lg:px-8"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">
                Today's catch
              </p>
              <h2 className="mt-1 flex flex-wrap items-center gap-3 font-display text-2xl font-extrabold tracking-tight text-brand-900 sm:text-3xl">
                {search.trim()
                  ? `Results for "${search.trim()}"`
                  : category === "All"
                    ? "Pre-order for tomorrow"
                    : category}
                <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700">
                  {visibleProducts.length}{" "}
                  {visibleProducts.length === 1 ? "item" : "items"}
                </span>
              </h2>
            </div>

            {search.trim() && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="rounded-full border border-brand-100 bg-white px-4 py-2 text-sm font-semibold text-brand-700 transition hover:border-brand-300"
              >
                Clear search
              </button>
            )}
          </div>

          {productsStatus === "loading" && (
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="animate-pulse overflow-hidden rounded-3xl border border-brand-100 bg-white"
                >
                  <div className="h-52 bg-brand-50" />
                  <div className="space-y-3 p-5">
                    <div className="h-4 w-2/3 rounded-full bg-brand-100" />
                    <div className="h-3 w-1/3 rounded-full bg-brand-50" />
                    <div className="h-10 w-full rounded-full bg-brand-50" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {productsStatus === "error" && (
            <div className="mt-6 rounded-3xl border border-red-100 bg-red-50/60 py-14 text-center">
              <p className="font-display text-lg font-bold text-red-700">
                We can't load the seafood list.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Check that the server is running, then try again.
              </p>
              <button
                type="button"
                onClick={() => {
                  setProductsStatus("loading");
                  setProductsReload((count) => count + 1);
                }}
                className="mt-5 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-500/30 transition hover:opacity-90 active:scale-95"
              >
                Try again
              </button>
            </div>
          )}

          {productsStatus === "ready" && (
            <>
              <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleProducts.map((product) => {
                  const size =
                    selectedSizes[product.id] || product.variants[0]?.size;

                  return (
                    <ProductCard
                      key={product.id}
                      product={product}
                      size={size}
                      quantity={cart[`${product.id}__${size}`] || 0}
                      onSelectSize={(newSize) =>
                        setSelectedSizes((current) => ({
                          ...current,
                          [product.id]: newSize,
                        }))
                      }
                      onChange={(change) => updateCart(product.id, change, size)}
                    />
                  );
                })}
              </div>

              {visibleProducts.length === 0 && (
                <div className="mt-6 rounded-3xl border border-dashed border-brand-200 bg-white/70 py-16 text-center">
                  <p className="text-5xl">🐟</p>
                  <p className="mt-3 font-display text-lg font-bold text-brand-900">
                    {search.trim()
                      ? `Nothing matches "${search.trim()}"`
                      : "No seafood in this category yet"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Try a different word, or browse all categories.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setCategory("All");
                    }}
                    className="mt-5 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-500/30 transition hover:opacity-90 active:scale-95"
                  >
                    Show everything
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* --------------------------- How pre-ordering works --------------------------- */}
        <section className="mx-auto max-w-7xl px-4 pb-16 pt-2 sm:px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">
            Simple as 1, 2, 3
          </p>
          <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-brand-900 sm:text-3xl">
            How pre-ordering works
          </h2>

          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              [
                "Order today",
                "Add your seafood to the cart and choose delivery or takeaway.",
              ],
              [
                "Pick tomorrow's slot",
                `Choose a morning time between ${slotStart || "6:30 AM"} and ${slotEnd || "11:30 AM"}.`,
              ],
              [
                "Get it fresh",
                `Delivered to your door within ${config.maxRadiusKm} km, or ready for pickup at our shop.`,
              ],
            ].map(([title, text], index) => (
              <li
                key={title}
                className="relative overflow-hidden rounded-3xl border border-brand-100 bg-white p-6 shadow-soft"
              >
                <span className="absolute -right-2 -top-4 font-display text-8xl font-extrabold text-brand-50">
                  {index + 1}
                </span>
                <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-sm font-extrabold text-white shadow-md shadow-brand-500/30">
                  {index + 1}
                </span>
                <h3 className="relative mt-4 font-display text-lg font-bold text-brand-900">
                  {title}
                </h3>
                <p className="relative mt-1.5 text-sm leading-6 text-slate-500">
                  {text}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <Footer config={config} />
      {/* Mobile "view cart" bar */}
      {cartCount > 0 && !cartOpen && !checkoutOpen && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="animate-slideUp fixed inset-x-4 bottom-4 z-40 flex items-center justify-between rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-6 py-4 text-white shadow-2xl shadow-brand-900/30 md:hidden"
        >
          <span className="text-sm font-bold">
            {formatKg(cartCount)} kg, {formatPrice(cartTotal)}
          </span>
          <span className="flex items-center gap-1 text-sm font-extrabold">
            View cart <ArrowRight size={16} />
          </span>
        </button>
      )}

      {/* ----------------------------- Cart panel ----------------------------- */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            className="animate-fadeIn absolute inset-0 bg-brand-900/50 backdrop-blur-sm"
            onClick={() => setCartOpen(false)}
            aria-label="Close cart"
          />

          <aside className="animate-slideIn relative flex h-full w-full max-w-md flex-col bg-brand-50 shadow-panel">
            <div className="flex items-center justify-between border-b border-brand-100 bg-white p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-md shadow-brand-500/30">
                  <ShoppingBag size={22} />
                </span>
                <div>
                  <h2 className="font-display text-xl font-extrabold text-brand-900">
                    Your cart
                  </h2>
                  <p className="text-sm text-slate-500">
                    {cartItems.length}{" "}
                    {cartItems.length === 1 ? "item" : "items"},{" "}
                    {formatKg(cartCount)} kg
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="rounded-full p-2 text-slate-500 transition hover:bg-brand-50 hover:text-brand-900"
                aria-label="Close cart"
              >
                <X size={22} />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {cartItems.length === 0 ? (
                <div className="mt-6 rounded-3xl border border-dashed border-brand-200 bg-white/70 px-6 py-14 text-center">
                  <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-400">
                    <ShoppingCart size={30} />
                  </span>
                  <p className="mt-4 font-display text-lg font-bold text-brand-900">
                    Your cart is empty
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Add seafood now and enjoy it tomorrow.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setCartOpen(false);
                      document
                        .getElementById("products")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="mt-5 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-500/30 transition hover:opacity-90 active:scale-95"
                  >
                    Browse seafood
                  </button>
                </div>
              ) : (
                cartItems.map((item) => {
                  const stockProblem =
                    !item.variant ||
                    !item.variant.available ||
                    item.variant.stockKg <= 0 ||
                    item.quantity > item.variant.stockKg;

                  return (
                    <div
                      key={item.cartKey}
                      className={`flex gap-4 rounded-3xl border bg-white p-3 shadow-soft ${stockProblem ? "border-red-200" : "border-brand-100"
                        }`}
                    >
                      <img
                        src={
                          item.image ||
                          "https://placehold.co/160x160?text=Seafood"
                        }
                        alt={item.name}
                        className="h-24 w-24 shrink-0 rounded-2xl object-cover"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="truncate font-display font-bold text-brand-900">
                            {item.name}
                          </h3>
                          <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700">
                            {item.size}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatPrice(item.variant?.pricePerKg || 0)} per kg
                        </p>

                        {stockProblem && (
                          <p className="mt-1 text-xs font-semibold text-red-600">
                            Not enough stock. Lower the quantity or remove it.
                          </p>
                        )}

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <QuantityStepper
                            quantity={item.quantity}
                            name={`${item.name} size ${item.size}`}
                            onMinus={() =>
                              updateCart(item.id, -STEP_KG, item.size)
                            }
                            onPlus={() =>
                              updateCart(item.id, STEP_KG, item.size)
                            }
                            plusDisabled={
                              !item.variant ||
                              !item.variant.available ||
                              item.quantity + STEP_KG > item.variant.stockKg
                            }
                          />
                          <p className="font-display text-lg font-extrabold text-brand-900">
                            {formatPrice(
                              (item.variant?.pricePerKg || 0) * item.quantity
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-brand-100 bg-white p-5 shadow-[0_-8px_24px_rgba(8,145,178,0.08)]">
              <div className="flex items-end justify-between">
                <span className="font-semibold text-slate-600">Subtotal</span>
                <span className="font-display text-2xl font-extrabold text-brand-900">
                  {formatPrice(cartTotal)}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-5 text-slate-500">
                Delivery charges and your final bill are shown at checkout.
              </p>

              {hasOutOfStockItems && (
                <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-medium text-red-700">
                  Some items in your cart are out of stock. Remove them or
                  lower the quantity to continue.
                </p>
              )}

              <button
                type="button"
                disabled={cartCount === 0 || hasOutOfStockItems}
                onClick={handleCheckout}
                className="btn-sheen mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-5 py-4 font-bold text-white shadow-lg shadow-brand-500/30 transition hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {authUser ? "Continue to checkout" : "Sign in to continue"}
                <ArrowRight size={18} />
              </button>
              {!authUser && cartCount > 0 && (
                <p className="mt-2 text-center text-xs text-slate-500">
                  You need to sign in before checkout.
                </p>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* ---------------------------- Checkout panel ---------------------------- */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-brand-900/60 backdrop-blur-sm">
          <div className="min-h-full px-3 py-6 sm:px-4 sm:py-10">
            <div className="animate-fadeIn mx-auto max-w-2xl rounded-[2rem] bg-white shadow-2xl">
              {orderResult ? (
                /* ---------------- Order placed ---------------- */
                <div className="p-6 text-center sm:p-10">
                  <div
                    className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${paymentBusy
                      ? "bg-brand-50"
                      : paymentState === "paid"
                        ? "bg-emerald-50"
                        : "bg-amber-50"
                      }`}
                  >
                    {paymentBusy ? (
                      <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
                    ) : paymentState === "paid" ? (
                      <CheckCircle2 className="animate-pop h-10 w-10 text-emerald-600" />
                    ) : (
                      <Clock className="h-10 w-10 text-amber-500" />
                    )}
                  </div>
                  <h2 className="mt-5 font-display text-3xl font-extrabold text-brand-900">
                    {paymentBusy
                      ? "Confirming your payment..."
                      : paymentState === "paid"
                        ? "Order confirmed"
                        : "Payment pending"}
                  </h2>
                  {paymentBusy && (
                    <p className="mt-1 text-sm text-slate-500">
                      Please don't close this window.
                    </p>
                  )}
                  <p className="mt-2 inline-block rounded-full bg-brand-50 px-4 py-1 text-sm font-bold tracking-wide text-brand-700">
                    Order #{String(orderResult.orderId).slice(-6).toUpperCase()}
                  </p>

                  <div className="mt-6 rounded-3xl bg-brand-50 p-5 text-left text-sm text-brand-900">
                    {orderResult.method === "takeaway" ? (
                      <>
                        <p className="flex items-center gap-2 font-display font-bold">
                          <Store size={16} className="text-brand-600" />
                          Collect from our shop
                        </p>
                        <p className="mt-1">
                          {config.shop.name}, {config.shop.address},{" "}
                          {config.shop.pinCode}
                        </p>
                        <p className="mt-2 font-semibold">
                          {formatScheduleDate(orderResult.date)},{" "}
                          {orderResult.slotLabel}
                        </p>
                        <p className="mt-2 text-brand-700">
                          Show your order number when you collect.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="flex items-center gap-2 font-display font-bold">
                          <Truck size={16} className="text-brand-600" />
                          Delivering to
                        </p>
                        {orderResult.address && (
                          <p className="mt-1">
                            {orderResult.address.recipientName},{" "}
                            {orderResult.address.houseNumber},{" "}
                            {orderResult.address.street},{" "}
                            {orderResult.address.locality},{" "}
                            {orderResult.address.city} -{" "}
                            {orderResult.address.pinCode}
                          </p>
                        )}
                        <p className="mt-2 font-semibold">
                          {formatScheduleDate(orderResult.date)},{" "}
                          {orderResult.slotLabel}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-3xl border border-brand-100 p-4 text-left">
                    <div>
                      <p className="text-sm text-slate-500">Total</p>
                      <p className="font-display text-2xl font-extrabold text-brand-900">
                        {formatPrice(orderResult.bill?.total)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-4 py-1.5 text-xs font-bold ${paymentState === "paid"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                        }`}
                    >
                      {paymentState === "paid"
                        ? "Paid"
                        : paymentBusy
                          ? "Processing..."
                          : "Payment pending"}
                    </span>
                  </div>

                  {paymentState === "paid" && (
                    <p className="mt-2 text-left text-xs text-emerald-700">
                      Payment received by UPI. Your order is confirmed.
                    </p>
                  )}

                  {paymentState === "unpaid" && (
                    <div className="mt-3 rounded-3xl bg-amber-50 p-4 text-left text-sm text-amber-800">
                      <p>{paymentMessage}</p>
                      <p className="mt-1 text-xs">
                        Your order is saved but not paid yet. Pay within{" "}
                        {config.unpaidOrderMinutes} minutes to confirm it, or it
                        will be cancelled automatically. You can also pay later
                        from My orders.
                      </p>
                      <button
                        type="button"
                        onClick={() => startPayment(String(orderResult.orderId))}
                        className="mt-3 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-brand-500/30 transition hover:opacity-90 active:scale-95"
                      >
                        Pay with UPI
                      </button>
                    </div>
                  )}

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => {
                        closeCheckout();
                        handleFetchMyOrders();
                      }}
                      disabled={paymentBusy}
                      className="flex-1 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-5 py-3 font-bold text-white shadow-lg shadow-brand-500/30 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      View my orders
                    </button>
                    <button
                      type="button"
                      onClick={closeCheckout}
                      disabled={paymentBusy}
                      className="flex-1 rounded-full border border-brand-100 px-5 py-3 font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Continue shopping
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* ---------------- Header ---------------- */}
                  <div className="flex items-start justify-between gap-3 p-5 sm:p-8 sm:pb-0">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">
                        {config.shop.name}
                      </p>
                      <h2 className="mt-1 font-display text-3xl font-extrabold text-brand-900">
                        Checkout
                      </h2>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                        <CalendarDays size={14} className="text-brand-500" />
                        Pre-order for tomorrow, {formatScheduleDate(tomorrowDate)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeCheckout}
                      className="rounded-full border border-brand-100 px-4 py-2 text-sm font-semibold text-brand-700 transition hover:border-brand-300 hover:bg-brand-50"
                    >
                      Back to shop
                    </button>
                  </div>
                  <div className="space-y-5 p-5 sm:p-8">
                    {/* ---------------- Your order ---------------- */}
                    <section className="rounded-3xl border border-brand-100 bg-white p-5 shadow-soft">
                      <StepTitle number="1">Your order</StepTitle>
                      <div className="mt-4 space-y-3">
                        {cartItems.map((item) => (
                          <div
                            key={item.cartKey}
                            className="flex items-center gap-3 rounded-2xl bg-brand-50/60 p-2.5"
                          >
                            <img
                              src={
                                item.image ||
                                "https://placehold.co/120x120?text=Seafood"
                              }
                              alt={item.name}
                              className="h-14 w-14 rounded-xl object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold text-brand-900">
                                {item.name}
                              </p>
                              <p className="text-sm text-slate-500">
                                Size {item.size}, {formatKg(item.quantity)} kg
                              </p>
                            </div>
                            <p className="font-display font-bold text-brand-900">
                              {formatPrice(
                                (item.variant?.pricePerKg || 0) * item.quantity
                              )}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* ---------------- Delivery or takeaway ---------------- */}
                    <section>
                      <StepTitle number="2">How do you want your order?</StepTitle>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <FulfillmentCard
                          active={fulfillmentMethod === "delivery"}
                          disabled={!config.deliveryEnabled}
                          icon={Truck}
                          title="Doorstep delivery"
                          text={
                            config.deliveryEnabled
                              ? `Within ${config.maxRadiusKm} km of our shop. Delivery from ${formatPrice(lowestDeliveryFee)}.`
                              : "Not available yet."
                          }
                          onSelect={() => chooseFulfillment("delivery")}
                        />
                        <FulfillmentCard
                          active={fulfillmentMethod === "takeaway"}
                          icon={Store}
                          title="Takeaway"
                          text="Collect from our shop. No delivery fee."
                          onSelect={() => chooseFulfillment("takeaway")}
                        />
                      </div>
                    </section>

                    {/* Takeaway details */}
                    {fulfillmentMethod === "takeaway" && (
                      <section className="rounded-3xl border border-brand-100 bg-white p-5 shadow-soft">
                        <StepTitle number="3">Pick up from</StepTitle>
                        <div className="mt-3 flex items-start gap-3 rounded-2xl bg-brand-50 p-4">
                          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                          <div className="text-sm text-brand-900">
                            <p className="font-semibold">{config.shop.name}</p>
                            <p>
                              {config.shop.address}, {config.shop.pinCode}
                            </p>
                            <p className="mt-2 text-brand-700">
                              Show your order number when you collect.
                            </p>
                          </div>
                        </div>
                      </section>
                    )}

                    {/* Delivery address */}
                    {fulfillmentMethod === "delivery" && (
                      <section className="rounded-3xl border border-brand-100 bg-white p-5 shadow-soft">
                        <div className="flex items-center justify-between gap-3">
                          <StepTitle number="3">Delivery address</StepTitle>
                          {savedAddresses.length > 0 && (
                            <button
                              type="button"
                              onClick={openNewAddressForm}
                              className="shrink-0 rounded-full border border-brand-100 px-3.5 py-1.5 text-sm font-semibold text-brand-700 transition hover:border-brand-300 hover:bg-brand-50"
                            >
                              + Add new
                            </button>
                          )}
                        </div>

                        {addressesLoading ? (
                          <p className="mt-3 text-sm text-slate-500">
                            Loading your saved addresses...
                          </p>
                        ) : addressesError ? (
                          <div className="mt-3 rounded-2xl bg-red-50 p-4">
                            <p className="text-sm text-red-600">
                              {addressesError}
                            </p>
                            <button
                              type="button"
                              onClick={loadAddresses}
                              className="mt-2 text-sm font-semibold text-brand-700 underline"
                            >
                              Try again
                            </button>
                          </div>
                        ) : savedAddresses.length === 0 ? (
                          <div className="mt-3 rounded-2xl border border-dashed border-brand-200 bg-brand-50/50 p-5 text-center">
                            <p className="text-sm text-slate-500">
                              You have no saved delivery address yet.
                            </p>
                            <button
                              type="button"
                              onClick={openNewAddressForm}
                              className="mt-3 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-500/30 transition hover:opacity-90 active:scale-95"
                            >
                              Add an address
                            </button>
                          </div>
                        ) : (
                          <div className="mt-4 space-y-3">
                            {savedAddresses.map((address) => {
                              const hasLocation =
                                Number.isFinite(address.latitude) &&
                                Number.isFinite(address.longitude);

                              return (
                                <label
                                  key={address._id}
                                  className={`flex cursor-pointer gap-3 rounded-2xl border-2 p-4 transition ${selectedAddressId === address._id
                                    ? "border-brand-500 bg-brand-50"
                                    : "border-slate-200 hover:border-brand-300"
                                    }`}
                                >
                                  <input
                                    type="radio"
                                    name="checkoutAddress"
                                    value={address._id}
                                    checked={selectedAddressId === address._id}
                                    onChange={() =>
                                      setSelectedAddressId(address._id)
                                    }
                                    className="mt-1 accent-brand-500"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-brand-900">
                                      <span className="mr-2 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-700">
                                        {address.label}
                                      </span>
                                      {address.recipientName}
                                    </p>
                                    <p className="mt-1 text-sm leading-6 text-slate-600">
                                      {address.houseNumber}, {address.street},{" "}
                                      {address.locality}, {address.city},{" "}
                                      {address.state} - {address.pinCode}
                                    </p>
                                    <p className="mt-1 text-sm text-slate-500">
                                      Phone: {address.phone}
                                    </p>
                                    {!hasLocation && (
                                      <p className="mt-2 text-xs font-medium text-amber-700">
                                        This address has no saved location, so
                                        we can't check delivery distance.
                                      </p>
                                    )}
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.preventDefault();
                                        openEditAddressForm(address);
                                      }}
                                      className="mt-2 text-xs font-semibold text-brand-700 hover:underline"
                                    >
                                      {hasLocation
                                        ? "Edit address"
                                        : "Edit and add location"}
                                    </button>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    )}
                    {/* ---------------- Time slot ---------------- */}
                    <section className="rounded-3xl border border-brand-100 bg-white p-5 shadow-soft">
                      <StepTitle number="4">
                        {fulfillmentMethod === "takeaway"
                          ? "Pickup time"
                          : "Delivery time"}
                        {slotData.date && (
                          <span className="rounded-full bg-brand-50 px-3 py-0.5 text-xs font-semibold text-brand-700">
                            {formatScheduleDate(slotData.date)}
                          </span>
                        )}
                      </StepTitle>

                      {slotsLoading ? (
                        <p className="mt-3 text-sm text-slate-500">
                          Loading time slots...
                        </p>
                      ) : slotsError ? (
                        <div className="mt-3 rounded-2xl bg-red-50 p-4">
                          <p className="text-sm text-red-600">{slotsError}</p>
                          <button
                            type="button"
                            onClick={() => setSlotsReload((count) => count + 1)}
                            className="mt-2 text-sm font-semibold text-brand-700 underline"
                          >
                            Try again
                          </button>
                        </div>
                      ) : (
                        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                          {slotData.slots.map((slot) => {
                            const on = selectedSlotId === slot.id;

                            return (
                              <button
                                key={slot.id}
                                type="button"
                                disabled={!slot.available}
                                onClick={() => setSelectedSlotId(slot.id)}
                                aria-pressed={on}
                                className={`rounded-2xl border-2 px-3 py-3 text-left text-sm transition disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${on
                                  ? "border-brand-500 bg-brand-50 text-brand-900 shadow-soft"
                                  : "border-slate-200 hover:border-brand-300"
                                  }`}
                              >
                                <span className="block font-semibold">
                                  {slot.label}
                                </span>
                                <span
                                  className={`mt-0.5 block text-xs font-medium ${!slot.available
                                    ? "text-slate-400"
                                    : slot.remaining <= 3
                                      ? "text-amber-700"
                                      : "text-emerald-700"
                                    }`}
                                >
                                  {!slot.available
                                    ? "Full"
                                    : slot.remaining <= 3
                                      ? `${slot.remaining} left`
                                      : "Available"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    {/* ---------------- Payment ---------------- */}
                    <section className="rounded-3xl border border-brand-100 bg-white p-5 shadow-soft">
                      <StepTitle number="5">Payment</StepTitle>
                      <div className="mt-3 flex items-start gap-3 rounded-2xl bg-brand-50 p-4">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-extrabold text-brand-700 shadow-sm">
                          UPI
                        </span>
                        <div>
                          <p className="font-semibold text-brand-900">
                            Online UPI
                          </p>
                          <p className="mt-0.5 text-sm text-slate-600">
                            You pay by UPI right after you place your order.
                            Your order is confirmed once the payment succeeds.
                          </p>
                        </div>
                      </div>
                    </section>

                    {/* ---------------- Bill ---------------- */}
                    <section className="rounded-3xl border border-brand-100 bg-white p-5 shadow-soft">
                      <div className="flex items-center justify-between gap-3">
                        <StepTitle number="6">Bill</StepTitle>
                        {quote && (
                          <button
                            type="button"
                            onClick={() => setBillOpen((open) => !open)}
                            aria-expanded={billOpen}
                            className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
                          >
                            {billOpen ? "Hide details" : "View details"}
                            <ChevronDown
                              size={16}
                              className={`transition ${billOpen ? "rotate-180" : ""}`}
                            />
                          </button>
                        )}
                      </div>

                      {quoteError && (
                        <div className="mt-3 flex items-start gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                          <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
                          <div>
                            <p className="font-semibold">
                              {fulfillmentMethod === "delivery"
                                ? "We can't confirm delivery yet"
                                : "We can't confirm this order yet"}
                            </p>
                            <p className="mt-1">{quoteError}</p>
                            {fulfillmentMethod === "delivery" && (
                              <button
                                type="button"
                                onClick={() => chooseFulfillment("takeaway")}
                                className="mt-2 font-semibold underline"
                              >
                                Switch to takeaway instead
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {!quoteError && !quote && (
                        <p className="mt-3 text-sm text-slate-500">
                          {fulfillmentMethod === "delivery" && !selectedAddressId
                            ? "Select a delivery address to see your bill."
                            : "Calculating your bill..."}
                        </p>
                      )}

                      {quote && (
                        <div className={quoteLoading ? "opacity-60" : ""}>
                          <div className="mt-4 flex items-center justify-between rounded-2xl bg-brand-50 px-4 py-3">
                            <span className="font-semibold text-slate-600">
                              Total to pay
                            </span>
                            <span className="font-display text-3xl font-extrabold text-brand-900">
                              {formatPrice(quote.bill.total)}
                            </span>
                          </div>

                          {fulfillmentMethod === "delivery" &&
                            quote.bill.distanceKm != null && (
                              <p className="mt-2 text-xs text-slate-500">
                                {quote.bill.distanceKm} km from our shop
                              </p>
                            )}

                          {billOpen && (
                            <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
                              {quote.items.map((item) => (
                                <div
                                  key={`${item.productId}-${item.size}`}
                                  className="flex justify-between gap-3 text-slate-600"
                                >
                                  <span>
                                    {item.name} ({item.size}),{" "}
                                    {formatKg(item.quantityKg)} kg at{" "}
                                    {formatPrice(item.pricePerKg)}
                                  </span>
                                  <span className="shrink-0">
                                    {formatPrice(item.lineTotal)}
                                  </span>
                                </div>
                              ))}

                              <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold text-brand-900">
                                <span>Item subtotal</span>
                                <span>{formatPrice(quote.bill.subtotal)}</span>
                              </div>

                              {fulfillmentMethod === "delivery" && (
                                <>
                                  <div className="flex justify-between text-slate-600">
                                    <span>Delivery fee</span>
                                    <span>
                                      {formatPrice(quote.bill.deliveryFee)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-slate-600">
                                    <span>Doorstep service charge</span>
                                    <span>
                                      {formatPrice(quote.bill.serviceCharge)}
                                    </span>
                                  </div>
                                </>
                              )}

                              {quote.bill.tax > 0 && (
                                <div className="flex justify-between text-slate-600">
                                  <span>Taxes</span>
                                  <span>{formatPrice(quote.bill.tax)}</span>
                                </div>
                              )}

                              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-extrabold text-brand-900">
                                <span>Total</span>
                                <span>{formatPrice(quote.bill.total)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  </div>

                  {/* ---------------- Place order bar ---------------- */}
                  <div className="sticky bottom-0 rounded-b-[2rem] border-t border-brand-100 bg-white/95 p-4 backdrop-blur sm:p-5">
                    {orderError && (
                      <p className="mb-3 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
                        {orderError}
                      </p>
                    )}
                    {blockReason && !quoteError && (
                      <p className="mb-3 text-center text-xs text-slate-500">
                        {blockReason}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handlePlaceOrder}
                      disabled={Boolean(blockReason) || placingOrder}
                      className="btn-sheen flex w-full items-center justify-between rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-6 py-4 font-bold text-white shadow-lg shadow-brand-500/30 transition hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span>
                        {placingOrder ? "Placing your order..." : "Place order"}
                      </span>
                      {quote && !quoteError && (
                        <span className="font-display text-lg">
                          {formatPrice(quote.bill.total)}
                        </span>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --------------------------- My orders panel --------------------------- */}
      {ordersOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-brand-900/50 backdrop-blur-sm">
          <div className="animate-slideIn h-full w-full max-w-md overflow-y-auto bg-brand-50 shadow-panel">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-brand-100 bg-white p-5">
              <div>
                <h2 className="font-display text-2xl font-extrabold text-brand-900">
                  My orders
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Your order history
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOrdersOpen(false)}
                className="rounded-full p-2 text-slate-500 transition hover:bg-brand-50 hover:text-brand-900"
                aria-label="Close orders"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-4">
              {ordersLoading ? (
                <div className="space-y-4">
                  {[0, 1].map((item) => (
                    <div
                      key={item}
                      className="animate-pulse space-y-3 rounded-3xl border border-brand-100 bg-white p-5"
                    >
                      <div className="h-4 w-1/2 rounded-full bg-brand-100" />
                      <div className="h-3 w-1/3 rounded-full bg-brand-50" />
                      <div className="h-16 rounded-2xl bg-brand-50" />
                    </div>
                  ))}
                </div>
              ) : ordersError ? (
                <div className="rounded-3xl bg-red-50 p-5 text-sm text-red-700">
                  {ordersError}
                  <button
                    type="button"
                    onClick={handleFetchMyOrders}
                    className="mt-3 block font-semibold underline"
                  >
                    Try again
                  </button>
                </div>
              ) : myOrders.length === 0 ? (
                <div className="mt-6 rounded-3xl border border-dashed border-brand-200 bg-white/70 px-6 py-14 text-center">
                  <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-400">
                    <ShoppingBag size={30} />
                  </span>
                  <p className="mt-4 font-display text-lg font-bold text-brand-900">
                    No orders yet
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Pre-order today and your order will show up here.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {myOrders.map((order) => (
                    <OrderCard
                      key={order._id}
                      order={order}
                      limitMinutes={config.unpaidOrderMinutes}
                      paying={payingOrderId === String(order._id)}
                      payDisabled={Boolean(payingOrderId)}
                      onPay={() => handlePayNow(order)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------- My addresses panel ------------------------- */}
      {addressesOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-brand-900/50 backdrop-blur-sm">
          <div className="animate-slideIn h-full w-full max-w-md overflow-y-auto bg-brand-50 shadow-panel">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-brand-100 bg-white p-5">
              <div>
                <h2 className="font-display text-2xl font-extrabold text-brand-900">
                  My addresses
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Manage your delivery locations
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddressesOpen(false)}
                className="rounded-full p-2 text-slate-500 transition hover:bg-brand-50 hover:text-brand-900"
                aria-label="Close addresses"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-4">
              <button
                type="button"
                onClick={openNewAddressForm}
                className="mb-5 w-full rounded-3xl border-2 border-dashed border-brand-300 bg-white/70 px-4 py-4 font-semibold text-brand-700 transition hover:bg-white"
              >
                + Add new address
              </button>

              {addressesLoading ? (
                <p className="py-8 text-center text-slate-500">
                  Loading your addresses...
                </p>
              ) : addressesError ? (
                <p className="rounded-3xl bg-red-50 p-4 text-sm text-red-600">
                  {addressesError}
                </p>
              ) : savedAddresses.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-brand-200 bg-white/70 px-5 py-12 text-center">
                  <div className="mb-3 text-4xl">📍</div>
                  <h3 className="font-display text-lg font-bold text-brand-900">
                    No saved addresses yet
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Add a delivery address to order for doorstep delivery.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {savedAddresses.map((address) => {
                    const hasLocation =
                      Number.isFinite(address.latitude) &&
                      Number.isFinite(address.longitude);

                    return (
                      <div
                        key={address._id}
                        className="rounded-3xl border border-brand-100 bg-white p-5 shadow-soft"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-700">
                            {address.label || "Home"}
                          </span>
                          <button
                            type="button"
                            onClick={() => openEditAddressForm(address)}
                            className="text-sm font-semibold text-brand-700 hover:underline"
                          >
                            Edit
                          </button>
                        </div>

                        <p className="font-semibold text-brand-900">
                          {address.recipientName}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {address.houseNumber}, {address.street},{" "}
                          {address.locality}, {address.city}, {address.state} -{" "}
                          {address.pinCode}
                        </p>
                        {address.landmark && (
                          <p className="mt-1 text-sm text-slate-500">
                            Landmark: {address.landmark}
                          </p>
                        )}
                        <p className="mt-2 text-sm text-slate-500">
                          Phone: {address.phone}
                        </p>

                        <p
                          className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${hasLocation
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                            }`}
                        >
                          <MapPin size={12} />
                          {hasLocation
                            ? "Location saved"
                            : "No location saved. Edit to add one."}
                        </p>

                        <button
                          type="button"
                          onClick={() => handleDeleteAddress(address)}
                          className="mt-4 block text-sm font-semibold text-red-600 hover:underline"
                        >
                          Delete address
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Address Form */}
      {addressFormOpen && (
        <AddressFormModal
          isEditing={Boolean(editingAddress)}
          form={addressForm}
          setForm={setAddressForm}
          saving={addressSaving}
          error={addressFormError}
          onSubmit={handleSaveAddress}
          onClose={() => setAddressFormOpen(false)}
        />
      )}

      {/* Sign in modal */}
      {authOpen && (
        <AuthModal onClose={() => setAuthOpen(false)} onLogin={handleLogin} />
      )}

      {/* Small message at the bottom of the screen */}
      {toast && (
        <div
          role="status"
          className="animate-fadeIn fixed inset-x-4 bottom-24 z-[200] mx-auto flex max-w-sm items-center gap-3 rounded-full bg-brand-900 px-5 py-3.5 text-sm font-medium text-white shadow-2xl md:bottom-8"
        >
          <CheckCircle2 size={18} className="shrink-0 text-brand-300" />
          <span>{toast}</span>
        </div>
      )}
      {/* Background bubbles and fish (styled in App.css) */}
      <div className="ocean-background" aria-hidden="true">
        <span className="ocean-bubble bubble-1" />
        <span className="ocean-bubble bubble-2" />
        <span className="ocean-bubble bubble-3" />
        <span className="ocean-bubble bubble-4" />

        <span className="ocean-fish fish-1">🐟</span>
        <span className="ocean-fish fish-2">🐠</span>
        <span className="ocean-fish fish-3">🐟</span>
      </div>
    </div>
  );
}