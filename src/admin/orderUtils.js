export const ORDER_STATUSES = [
    "Pending",
    "Confirmed",
    "Preparing",
    "Ready",
    "Out for delivery",
    "Delivered",
    "Completed",
    "Cancelled",
];

// The one valid next step per fulfilment method. Mirrors the backend rules.
const NEXT_STATUS = {
    takeaway: {
        Confirmed: "Preparing",
        Preparing: "Ready",
        Ready: "Completed",
    },
    delivery: {
        Confirmed: "Preparing",
        Preparing: "Out for delivery",
        "Out for delivery": "Delivered",
    },
};

// Steps shown in the progress tracker.
export const PROGRESS = {
    takeaway: ["Confirmed", "Preparing", "Ready", "Completed"],
    delivery: ["Confirmed", "Preparing", "Out for delivery", "Delivered"],
};

export const statusStyles = {
    Pending: "bg-amber-50 text-amber-700 ring-amber-200",
    Confirmed: "bg-brand-50 text-brand-700 ring-brand-200",
    Preparing: "bg-violet-50 text-violet-700 ring-violet-200",
    Ready: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    "Out for delivery": "bg-cyan-50 text-cyan-700 ring-cyan-200",
    Delivered: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    Completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    Cancelled: "bg-red-50 text-red-700 ring-red-200",
};

// Only paid orders can move forward. Returns the next status or null.
export function nextStatusFor(order) {
    if (order.payment !== "Paid") return null;
    return NEXT_STATUS[order.method]?.[order.status] || null;
}

export function formatPrice(amount) {
    const value = Number(amount) || 0;
    const digits = Number.isInteger(value) ? 0 : 2;

    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(value);
}

export function formatKg(value) {
    const number = Number(value) || 0;
    return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

export function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

// "2026-10-29" -> "Thu, 29 Oct"
export function formatScheduleDate(dateString) {
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

// Turns an order from the backend into the shape the dashboard displays.
export function mapOrder(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    const address = order.deliveryAddress || null;

    return {
        id: String(order._id),
        shortId: String(order._id).slice(-6).toUpperCase(),
        customer: order.customer?.name || "Unknown customer",
        email: order.customer?.email || "",
        phone: address?.phone || "",
        method: order.fulfillmentMethod || "",
        scheduledDate: order.scheduledDate || "",
        slotLabel: order.slot?.label || "",
        address,
        pickup: order.pickupLocation || null,
        items: items.map((item) => ({
            name: item.name,
            size: item.size,
            quantityKg: item.quantityKg,
            pricePerKg: item.pricePerKg,
            lineTotal: item.lineTotal,
        })),
        itemsText: items
            .map((item) => `${item.name} (${item.size}) · ${formatKg(item.quantityKg)} kg`)
            .join(", "),
        bill: order.bill || null,
        amount: Number(order.bill?.total ?? order.totalAmount) || 0,
        payment: order.paymentStatus || "Pending",
        status: order.status || "Pending",
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        cancelReason: order.cancelReason || "",
        paymentRef: order.razorpayPaymentId || "",
    };
}