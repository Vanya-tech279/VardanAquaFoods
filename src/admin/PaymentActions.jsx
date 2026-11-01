import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import {
    CASH_COLLECTION_STATUSES,
    FINAL_STATUSES,
    formatDateTime,
    formatPrice,
    paymentMethodLabel,
} from "./orderUtils";

function Row({ label, value }) {
    return (
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
            <span className="text-sm text-slate-500">{label}</span>
            <span className="max-w-[65%] text-right text-sm font-bold text-brand-900">
                {value || "-"}
            </span>
        </div>
    );
}

// Props:
//   order            the mapped order (see mapOrder in orderUtils.js)
//   onLoadProof(id)  -> { ok, url } or { ok: false, message }
//   onPaymentAction(id, action, reason) -> { ok, message }
//   onCancel(id, reason) -> { ok, message }
export default function PaymentActions({
    order,
    onLoadProof,
    onPaymentAction,
    onCancel,
}) {
    const [proofUrl, setProofUrl] = useState("");
    const [proofLoading, setProofLoading] = useState(false);
    const [proofError, setProofError] = useState("");
    const [panel, setPanel] = useState(""); // "" | "reject" | "cancel"
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null); // { ok, text }

    const underReview =
        order.payment === "Under review" && order.status === "Pending";
    const isCod = order.payment === "COD";
    const canCollectCash =
        isCod && CASH_COLLECTION_STATUSES.includes(order.status);
    const canCancel = !FINAL_STATUSES.includes(order.status);
    const moneyMayBeReceived =
        order.payment === "Paid" || order.payment === "Under review";

    async function loadProof() {
        setProofLoading(true);
        setProofError("");

        const result = await onLoadProof(order.id);

        setProofLoading(false);

        if (result.ok) setProofUrl(result.url);
        else setProofError(result.message || "Could not load the screenshot.");
    }

    // Free the temporary image address when it changes or the window closes.
    useEffect(() => {
        return () => {
            if (proofUrl) URL.revokeObjectURL(proofUrl);
        };
    }, [proofUrl]);

    // An order waiting for review shows its screenshot straight away.
    useEffect(() => {
        if (underReview && order.hasProof) loadProof();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Runs one admin action and shows what the server answered.
    async function run(task) {
        if (busy) return;

        setBusy(true);
        setMessage(null);

        const result = await task();

        setBusy(false);
        setMessage({ ok: result.ok, text: result.message });

        if (result.ok) {
            setPanel("");
            setReason("");
        }
    }

    function approve() {
        const sure = window.confirm(
            `Approve this payment of ${formatPrice(order.amount)}?\n\nContinue only if your bank or UPI app shows this amount received.`
        );

        if (sure) run(() => onPaymentAction(order.id, "approve"));
    }

    function collectCash() {
        const sure = window.confirm(
            `Record that you received ${formatPrice(order.amount)} from the customer?`
        );

        if (sure) run(() => onPaymentAction(order.id, "cod_collected"));
    }

    function openPanel(name) {
        setPanel(name);
        setReason("");
        setMessage(null);
    }

    const reasonOk = reason.trim().length >= 3;

    return (
        <>
            {/* Payment details */}
            <div className="mt-4 space-y-3 rounded-3xl bg-brand-50/60 p-5">
                <Row label="Payment method" value={paymentMethodLabel(order)} />
                <Row label="Payment status" value={order.payment} />

                {order.paymentMethod === "UPI_SCREENSHOT" &&
                    order.payment === "Pending" &&
                    order.status === "Pending" &&
                    order.paymentDueAt && (
                        <Row
                            label="Customer must pay by"
                            value={formatDateTime(order.paymentDueAt)}
                        />
                    )}

                {order.rejectionReason && order.payment === "Pending" && (
                    <Row label="Last rejection" value={order.rejectionReason} />
                )}

                {order.proofSubmittedAt && (
                    <Row
                        label="Screenshot uploaded"
                        value={formatDateTime(order.proofSubmittedAt)}
                    />
                )}

                {order.paidAt && (
                    <Row label="Paid on" value={formatDateTime(order.paidAt)} />
                )}

                {order.cashCollectedAt && (
                    <Row
                        label="Cash collected"
                        value={formatDateTime(order.cashCollectedAt)}
                    />
                )}

                {order.refundDue && (
                    <Row label="Refund" value="Due. Pay the customer back." />
                )}
            </div>

            {/* Payment screenshot */}
            {order.hasProof && (
                <div className="mt-4 rounded-3xl border border-brand-100 p-5">
                    <p className="font-display font-bold text-brand-900">
                        Payment screenshot
                    </p>

                    {underReview && (
                        <p className="mt-2 rounded-2xl bg-violet-50 p-3 text-xs leading-5 text-violet-800">
                            Check your bank or UPI app for{" "}
                            <b>{formatPrice(order.amount)}</b> received around the time
                            this order was placed. The same screenshot can be sent twice,
                            so match the amount and time with your bank before you
                            approve.
                        </p>
                    )}

                    {proofUrl ? (
                        <div className="mt-3">
                            <img
                                src={proofUrl}
                                alt="Payment screenshot"
                                className="max-h-96 w-full rounded-2xl border border-slate-200 bg-slate-50 object-contain"
                            />
                            <a
                                href={proofUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-block text-sm font-semibold text-brand-700 underline"
                            >
                                Open full size
                            </a>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={loadProof}
                            disabled={proofLoading}
                            className="mt-3 flex items-center gap-2 rounded-full border border-brand-100 px-5 py-2.5 text-sm font-bold text-brand-700 transition hover:bg-brand-50 disabled:opacity-60"
                        >
                            {proofLoading && <Loader2 size={15} className="animate-spin" />}
                            {proofLoading ? "Loading..." : "Show screenshot"}
                        </button>
                    )}

                    {proofError && (
                        <p className="mt-2 text-sm text-red-700">{proofError}</p>
                    )}
                </div>
            )}

            {/* Approve or reject */}
            {underReview && (
                <div className="mt-4 rounded-3xl border border-brand-100 p-5">
                    <p className="font-display font-bold text-brand-900">
                        Review this payment
                    </p>

                    <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                        <button
                            type="button"
                            onClick={approve}
                            disabled={busy}
                            className="rounded-full bg-gradient-to-r from-emerald-500 to-emerald-700 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:opacity-90 active:scale-95 disabled:opacity-50"
                        >
                            Approve payment
                        </button>
                        <button
                            type="button"
                            onClick={() => openPanel("reject")}
                            disabled={busy}
                            className="rounded-full border border-red-200 px-6 py-3 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                        >
                            Reject payment
                        </button>
                    </div>

                    {panel === "reject" && (
                        <div className="mt-4">
                            <label className="text-sm font-semibold text-brand-900">
                                Reason (the customer will see this)
                            </label>
                            <input
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                maxLength={200}
                                placeholder="e.g. We did not receive this amount"
                                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                            />
                            <button
                                type="button"
                                onClick={() =>
                                    run(() =>
                                        onPaymentAction(order.id, "reject", reason.trim())
                                    )
                                }
                                disabled={busy || !reasonOk}
                                className="mt-3 rounded-full bg-red-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                            >
                                {busy ? "Saving..." : "Send rejection"}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Cash order */}
            {isCod && (
                <div className="mt-4 rounded-3xl border border-brand-100 p-5">
                    <p className="font-display font-bold text-brand-900">Cash payment</p>
                    <p className="mt-1 text-sm text-slate-500">
                        {canCollectCash
                            ? "Press the button once the customer has paid you."
                            : "You can record the payment once the order is ready, out for delivery, or finished."}
                    </p>
                    <button
                        type="button"
                        onClick={collectCash}
                        disabled={busy || !canCollectCash}
                        className="mt-3 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-700 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Mark payment collected
                    </button>
                </div>
            )}

            {/* Cancel */}
            {canCancel && (
                <div className="mt-4 rounded-3xl border border-red-100 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-display font-bold text-brand-900">
                            Cancel this order
                        </p>
                        {panel !== "cancel" && (
                            <button
                                type="button"
                                onClick={() => openPanel("cancel")}
                                disabled={busy}
                                className="rounded-full border border-red-200 px-5 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                            >
                                Cancel order
                            </button>
                        )}
                    </div>

                    {panel === "cancel" && (
                        <div className="mt-3">
                            <p className="text-xs leading-5 text-slate-500">
                                The stock and the time slot go back to the shop.
                                {moneyMayBeReceived &&
                                    " Money may already have been received, so remember to refund the customer yourself."}
                            </p>
                            <input
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                maxLength={200}
                                placeholder="Reason for cancelling"
                                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                            />
                            <div className="mt-3 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => run(() => onCancel(order.id, reason.trim()))}
                                    disabled={busy || !reasonOk}
                                    className="rounded-full bg-red-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                                >
                                    {busy ? "Cancelling..." : "Yes, cancel the order"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPanel("")}
                                    disabled={busy}
                                    className="rounded-full border border-brand-100 px-5 py-2.5 text-sm font-bold text-brand-700 transition hover:bg-brand-50"
                                >
                                    Keep order
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {message && (
                <p
                    className={`mt-4 rounded-2xl p-3 text-sm ${
                        message.ok
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-red-50 text-red-700"
                    }`}
                >
                    {message.text}
                </p>
            )}
        </>
    );
} 