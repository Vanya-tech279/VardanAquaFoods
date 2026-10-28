import { useMemo, useState } from "react";
import {
    Search,
    Eye,
    RefreshCw,
    ShoppingCart,
    Clock3,
    IndianRupee,
    CheckCircle2,
    TrendingUp,
    Truck,
    Store,
    X,
    MapPin,
    PackageCheck,
} from "lucide-react";

import {
    ORDER_STATUSES,
    PROGRESS,
    statusStyles,
    nextStatusFor,
    formatPrice,
    formatKg,
    formatDateTime,
    formatScheduleDate,
} from "./orderUtils";

function StatCard({ label, value, note, icon: Icon, color }) {
    const tones = {
        blue: "bg-brand-50 text-brand-600",
        amber: "bg-amber-50 text-amber-600",
        green: "bg-emerald-50 text-emerald-600",
        purple: "bg-violet-50 text-violet-600",
    };

    return (
        <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-medium text-slate-500">{label}</p>
                    <p className="mt-3 font-display text-3xl font-extrabold tracking-tight text-brand-900">
                        {value}
                    </p>
                </div>
                <div className={`rounded-2xl p-3 ${tones[color]}`}>
                    <Icon size={21} />
                </div>
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
                <TrendingUp size={14} />
                {note}
            </div>
        </div>
    );
}

function DetailRow({ label, value }) {
    return (
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
            <span className="text-sm text-slate-500">{label}</span>
            <span className="max-w-[65%] text-right text-sm font-bold text-brand-900">
                {value || "-"}
            </span>
        </div>
    );
}

function StatusPill({ status }) {
    return (
        <span
            className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${
                statusStyles[status] || "bg-slate-50 text-slate-600 ring-slate-200"
            }`}
        >
            {status}
        </span>
    );
}

function PaymentPill({ payment }) {
    const tone =
        payment === "Paid"
            ? "bg-emerald-50 text-emerald-700"
            : payment === "Pending"
              ? "bg-amber-50 text-amber-700"
              : "bg-slate-100 text-slate-600";

    return (
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>
            {payment}
        </span>
    );
}

export default function OrdersPanel({
    orders,
    loading,
    error,
    onReload,
    onUpdateStatus,
    mode = "orders",
    onViewAll,
}) {
    const [search, setSearch] = useState("");
    const [activeFilter, setActiveFilter] = useState("All");
    const [selectedId, setSelectedId] = useState("");
    const [updatingId, setUpdatingId] = useState("");
    const [actionError, setActionError] = useState("");

    const isOverview = mode === "overview";
    const selected = orders.find((order) => order.id === selectedId) || null;

    const counts = useMemo(() => {
        const result = { All: orders.length };
        for (const status of ORDER_STATUSES) result[status] = 0;
        for (const order of orders) {
            result[order.status] = (result[order.status] || 0) + 1;
        }
        return result;
    }, [orders]);

    const stats = useMemo(() => {
        const toFulfil = ["Confirmed", "Preparing", "Ready", "Out for delivery"];

        return {
            total: orders.length,
            awaitingPayment: orders.filter((o) => o.status === "Pending").length,
            toFulfil: orders.filter((o) => toFulfil.includes(o.status)).length,
            paidValue: orders
                .filter((o) => o.payment === "Paid" && o.status !== "Cancelled")
                .reduce((sum, o) => sum + o.amount, 0),
        };
    }, [orders]);

    const visibleOrders = useMemo(() => {
        if (isOverview) return orders.slice(0, 5);

        const query = search.trim().toLowerCase();

        return orders.filter((order) => {
            const matchesFilter =
                activeFilter === "All" || order.status === activeFilter;

            const matchesSearch =
                !query ||
                [
                    order.shortId,
                    order.customer,
                    order.email,
                    order.phone,
                    order.itemsText,
                ].some((value) => String(value || "").toLowerCase().includes(query));

            return matchesFilter && matchesSearch;
        });
    }, [orders, search, activeFilter, isOverview]);

    async function advance(order) {
        const next = nextStatusFor(order);
        if (!next || updatingId) return;

        setUpdatingId(order.id);
        setActionError("");

        const result = await onUpdateStatus(order.id, next);

        setUpdatingId("");
        if (!result.ok) setActionError(result.message);
    }

    function closeModal() {
        setSelectedId("");
        setActionError("");
    }

    function renderAction(order) {
        const next = nextStatusFor(order);

        if (next) {
            return (
                <button
                    onClick={() => advance(order)}
                    disabled={Boolean(updatingId)}
                    className="whitespace-nowrap rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2 text-xs font-bold text-white shadow-md shadow-brand-500/30 transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {updatingId === order.id ? "Saving..." : `Mark ${next}`}
                </button>
            );
        }

        return (
            <span className="text-xs font-medium text-slate-400">
                {order.status === "Pending"
                    ? "Awaiting payment"
                    : order.status === "Cancelled"
                      ? "Cancelled"
                      : "Finished"}
            </span>
        );
    }

    return (
        <div className="space-y-7">
            <section>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                    <div>
                        <h2 className="font-display text-xl font-extrabold text-brand-900">
                            Business overview
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Live numbers from your customer orders.
                        </p>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        label="Total orders"
                        value={stats.total}
                        note="All orders so far"
                        icon={ShoppingCart}
                        color="blue"
                    />
                    <StatCard
                        label="Awaiting payment"
                        value={stats.awaitingPayment}
                        note="Cancelled automatically if unpaid"
                        icon={Clock3}
                        color="amber"
                    />
                    <StatCard
                        label="To fulfil"
                        value={stats.toFulfil}
                        note="Paid, not yet delivered"
                        icon={PackageCheck}
                        color="purple"
                    />
                    <StatCard
                        label="Paid order value"
                        value={formatPrice(stats.paidValue)}
                        note="Paid, excluding cancelled"
                        icon={IndianRupee}
                        color="green"
                    />
                </div>
            </section>

            <section className="overflow-hidden rounded-3xl border border-brand-100 bg-white shadow-soft">
                <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                    <div>
                        <h2 className="font-display text-xl font-extrabold text-brand-900">
                            {isOverview ? "Recent orders" : "All orders"}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            {isOverview
                                ? "The latest 5 orders."
                                : "Search, filter and move paid orders forward."}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={onReload}
                            aria-label="Refresh orders"
                            className="flex items-center gap-2 rounded-full border border-brand-100 px-4 py-2.5 text-sm font-bold text-brand-700 transition hover:border-brand-300 hover:bg-brand-50"
                        >
                            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                            Refresh
                        </button>
                        {isOverview && (
                            <button
                                onClick={onViewAll}
                                className="rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-brand-500/30 transition hover:opacity-90 active:scale-95"
                            >
                                View all orders
                            </button>
                        )}
                    </div>
                </div>

                {!isOverview && (
                    <div className="space-y-3 p-5 sm:px-6">
                        <div className="relative w-full sm:max-w-sm">
                            <Search
                                size={17}
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-500"
                            />
                            <input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search order, customer, phone or item..."
                                className="w-full rounded-full border border-brand-100 bg-brand-50/50 py-2.5 pl-11 pr-4 text-sm outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
                            />
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {["All", ...ORDER_STATUSES].map((filter) => (
                                <button
                                    key={filter}
                                    onClick={() => setActiveFilter(filter)}
                                    className={`rounded-full px-3.5 py-2 text-xs font-bold transition ${
                                        activeFilter === filter
                                            ? "bg-brand-600 text-white shadow-md shadow-brand-500/30"
                                            : "bg-slate-100 text-slate-500 hover:bg-brand-50 hover:text-brand-700"
                                    }`}
                                >
                                    {filter}
                                    <span className="ml-1.5 opacity-70">
                                        {counts[filter] ?? 0}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {error && (
                    <div className="mx-5 mb-4 flex items-center justify-between gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-700 sm:mx-6">
                        <span>{error}</span>
                        <button onClick={onReload} className="font-bold underline">
                            Try again
                        </button>
                    </div>
                )}

                {actionError && !selected && (
                    <div className="mx-5 mb-4 flex items-center justify-between gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-700 sm:mx-6">
                        <span>{actionError}</span>
                        <button
                            onClick={() => setActionError("")}
                            className="font-bold underline"
                        >
                            Dismiss
                        </button>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px] text-left">
                        <thead className="bg-brand-50/60 text-[11px] uppercase tracking-wider text-slate-400">
                            <tr>
                                <th className="px-6 py-4 font-bold">Order</th>
                                <th className="px-6 py-4 font-bold">Customer</th>
                                <th className="px-6 py-4 font-bold">Items</th>
                                <th className="px-6 py-4 font-bold">Fulfilment</th>
                                <th className="px-6 py-4 font-bold">Amount</th>
                                <th className="px-6 py-4 font-bold">Payment</th>
                                <th className="px-6 py-4 font-bold">Status</th>
                                <th className="px-6 py-4 font-bold">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && orders.length === 0 && !error ? (
                                <tr>
                                    <td
                                        colSpan="8"
                                        className="px-6 py-14 text-center text-sm text-slate-400"
                                    >
                                        Loading orders...
                                    </td>
                                </tr>
                            ) : visibleOrders.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan="8"
                                        className="px-6 py-14 text-center text-sm text-slate-400"
                                    >
                                        {orders.length === 0
                                            ? "No orders yet. New customer orders appear here automatically."
                                            : "No matching orders. Try another search or filter."}
                                    </td>
                                </tr>
                            ) : (
                                visibleOrders.map((order) => (
                                    <tr
                                        key={order.id}
                                        className="transition hover:bg-brand-50/40"
                                    >
                                        <td className="px-6 py-5">
                                            <p className="text-sm font-extrabold text-brand-700">
                                                #{order.shortId}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-400">
                                                {formatDateTime(order.createdAt)}
                                            </p>
                                        </td>
                                        <td className="px-6 py-5">
                                            <p className="whitespace-nowrap text-sm font-bold text-brand-900">
                                                {order.customer}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-400">
                                                {order.phone || order.email || "-"}
                                            </p>
                                        </td>
                                        <td className="max-w-[240px] px-6 py-5 text-sm text-slate-600">
                                            {order.itemsText || "-"}
                                        </td>
                                        <td className="px-6 py-5">
                                            <p className="flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-brand-900">
                                                {order.method === "takeaway" ? (
                                                    <Store size={14} className="text-brand-600" />
                                                ) : (
                                                    <Truck size={14} className="text-brand-600" />
                                                )}
                                                {order.method === "takeaway"
                                                    ? "Takeaway"
                                                    : "Delivery"}
                                            </p>
                                            <p className="mt-1 whitespace-nowrap text-xs text-slate-400">
                                                {formatScheduleDate(order.scheduledDate)}
                                                {order.slotLabel ? `, ${order.slotLabel}` : ""}
                                            </p>
                                        </td>
                                        <td className="px-6 py-5 text-sm font-extrabold text-brand-900">
                                            {formatPrice(order.amount)}
                                        </td>
                                        <td className="px-6 py-5">
                                            <PaymentPill payment={order.payment} />
                                        </td>
                                        <td className="px-6 py-5">
                                            <StatusPill status={order.status} />
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-2">
                                                {renderAction(order)}
                                                <button
                                                    aria-label={`View order ${order.shortId}`}
                                                    onClick={() => {
                                                        setActionError("");
                                                        setSelectedId(order.id);
                                                    }}
                                                    className="rounded-full border border-brand-100 p-2 text-slate-500 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                                                >
                                                    <Eye size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-xs text-slate-400">
                    <span>
                        Showing {visibleOrders.length} of {orders.length} orders
                    </span>
                    <span>Auto-refreshes every 30 seconds</span>
                </div>
            </section>

            {selected && (
                <div className="fixed inset-0 z-[60] overflow-y-auto bg-brand-900/50 p-4 backdrop-blur-sm">
                    <div className="mx-auto my-6 w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl sm:p-8">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">
                                    Order details
                                </p>
                                <h2 className="mt-1 font-display text-3xl font-extrabold text-brand-900">
                                    #{selected.shortId}
                                </h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    Placed {formatDateTime(selected.createdAt)}
                                </p>
                            </div>
                            <button
                                aria-label="Close order details"
                                onClick={closeModal}
                                className="rounded-full p-2 text-slate-500 transition hover:bg-brand-50 hover:text-brand-900"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        <div className="mt-5 flex flex-wrap items-center gap-2">
                            <StatusPill status={selected.status} />
                            <PaymentPill payment={selected.payment} />
                        </div>

                        {/* Progress tracker */}
                        {selected.status === "Cancelled" ? (
                            <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                                This order was cancelled.
                                {selected.cancelReason ? ` ${selected.cancelReason}` : ""}
                            </p>
                        ) : selected.payment !== "Paid" ? (
                            <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
                                Waiting for the customer to pay. Unpaid orders are
                                cancelled automatically.
                            </p>
                        ) : (
                            <ol className="mt-5 flex items-start">
                                {(PROGRESS[selected.method] || []).map((step, index, list) => {
                                    const currentIndex = list.indexOf(selected.status);
                                    const done = index <= currentIndex;

                                    return (
                                        <li key={step} className="relative flex-1 text-center">
                                            {index > 0 && (
                                                <span
                                                    className={`absolute left-[-50%] right-[50%] top-4 h-0.5 ${
                                                        done ? "bg-brand-500" : "bg-slate-200"
                                                    }`}
                                                />
                                            )}
                                            <span
                                                className={`relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold ${
                                                    done
                                                        ? "bg-brand-500 text-white"
                                                        : "bg-slate-200 text-slate-500"
                                                }`}
                                            >
                                                {done ? <CheckCircle2 size={16} /> : index + 1}
                                            </span>
                                            <span
                                                className={`mt-2 block text-[11px] font-semibold ${
                                                    done ? "text-brand-700" : "text-slate-400"
                                                }`}
                                            >
                                                {step}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ol>
                        )}

                        <div className="mt-6 space-y-3 rounded-3xl bg-brand-50/60 p-5">
                            <DetailRow label="Customer" value={selected.customer} />
                            <DetailRow label="Email" value={selected.email} />
                            <DetailRow label="Phone" value={selected.phone} />
                            <DetailRow
                                label="Fulfilment"
                                value={selected.method === "takeaway" ? "Takeaway" : "Doorstep delivery"}
                            />
                            <DetailRow
                                label="Scheduled for"
                                value={`${formatScheduleDate(selected.scheduledDate)}${
                                    selected.slotLabel ? `, ${selected.slotLabel}` : ""
                                }`}
                            />
                        </div>

                        <div className="mt-4 flex items-start gap-3 rounded-3xl border border-brand-100 p-5 text-sm">
                            <MapPin size={18} className="mt-0.5 shrink-0 text-brand-600" />
                            {selected.method === "delivery" && selected.address ? (
                                <div className="text-brand-900">
                                    <p className="font-bold">Deliver to</p>
                                    <p className="mt-1 text-slate-600">
                                        {selected.address.recipientName},{" "}
                                        {selected.address.houseNumber}, {selected.address.street},{" "}
                                        {selected.address.locality}, {selected.address.city},{" "}
                                        {selected.address.state} - {selected.address.pinCode}
                                    </p>
                                    {selected.address.landmark && (
                                        <p className="mt-1 text-slate-500">
                                            Landmark: {selected.address.landmark}
                                        </p>
                                    )}
                                    <p className="mt-1 text-slate-500">
                                        Phone: {selected.address.phone}
                                    </p>
                                    {Number.isFinite(selected.address.latitude) &&
                                        Number.isFinite(selected.address.longitude) && (
                                            <a
                                                href={`https://www.google.com/maps?q=${selected.address.latitude},${selected.address.longitude}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="mt-2 inline-block font-semibold text-brand-700 underline"
                                            >
                                                Open in Google Maps
                                            </a>
                                        )}
                                </div>
                            ) : (
                                <div className="text-brand-900">
                                    <p className="font-bold">Customer collects from the shop</p>
                                    {selected.pickup && (
                                        <p className="mt-1 text-slate-600">
                                            {selected.pickup.name}, {selected.pickup.address},{" "}
                                            {selected.pickup.pinCode}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="mt-4 rounded-3xl border border-brand-100 p-5">
                            <p className="font-display font-bold text-brand-900">Items</p>
                            <div className="mt-3 space-y-2 text-sm">
                                {selected.items.map((item, index) => (
                                    <div
                                        key={`${item.name}-${item.size}-${index}`}
                                        className="flex justify-between gap-3 text-slate-600"
                                    >
                                        <span>
                                            {item.name} ({item.size}), {formatKg(item.quantityKg)} kg at{" "}
                                            {formatPrice(item.pricePerKg)}
                                        </span>
                                        <span className="shrink-0 font-semibold text-brand-900">
                                            {formatPrice(item.lineTotal)}
                                        </span>
                                    </div>
                                ))}

                                {selected.bill && (
                                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                                        <div className="flex justify-between text-slate-600">
                                            <span>Item subtotal</span>
                                            <span>{formatPrice(selected.bill.subtotal)}</span>
                                        </div>
                                        {selected.method === "delivery" && (
                                            <>
                                                <div className="flex justify-between text-slate-600">
                                                    <span>Delivery fee</span>
                                                    <span>{formatPrice(selected.bill.deliveryFee)}</span>
                                                </div>
                                                <div className="flex justify-between text-slate-600">
                                                    <span>Doorstep service charge</span>
                                                    <span>{formatPrice(selected.bill.serviceCharge)}</span>
                                                </div>
                                            </>
                                        )}
                                        {selected.bill.tax > 0 && (
                                            <div className="flex justify-between text-slate-600">
                                                <span>Taxes</span>
                                                <span>{formatPrice(selected.bill.tax)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-extrabold text-brand-900">
                                    <span>Total</span>
                                    <span>{formatPrice(selected.amount)}</span>
                                </div>
                            </div>
                        </div>

                        {selected.payment === "Paid" && (
                            <div className="mt-4 space-y-3 rounded-3xl bg-emerald-50/60 p-5">
                                <DetailRow label="Paid on" value={formatDateTime(selected.paidAt)} />
                                <DetailRow label="Razorpay payment" value={selected.paymentRef} />
                            </div>
                        )}

                        {actionError && (
                            <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
                                {actionError}
                            </p>
                        )}

                        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                            {nextStatusFor(selected) && (
                                <button
                                    onClick={() => advance(selected)}
                                    disabled={Boolean(updatingId)}
                                    className="rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/30 transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {updatingId === selected.id
                                        ? "Saving..."
                                        : `Mark as ${nextStatusFor(selected)}`}
                                </button>
                            )}
                            <button
                                onClick={closeModal}
                                className="rounded-full border border-brand-100 px-6 py-3 text-sm font-bold text-brand-700 transition hover:bg-brand-50"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}