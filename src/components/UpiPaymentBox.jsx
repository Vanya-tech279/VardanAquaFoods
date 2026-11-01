import { useEffect, useState } from "react";
import { Clock, Loader2, Upload, XCircle } from "lucide-react";

const MAX_SCREENSHOT_MB = 5;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Shows what the customer must do for a "Pay by UPI" order.
// Props:
//   orderId, orderNumber, amountText   which order, and the exact amount to pay
//   dueAt                              when the 30 minutes end (date string)
//   paymentStatus                      "Pending" | "Under review"
//   rejectedReason                     text from the admin, or ""
//   upi                                { upiId, payeeName }
//   apiUrl                             backend address
//   onSubmitted()                      called after the upload works
//   onAuthExpired()                    called when the login has expired
export default function UpiPaymentBox({
  orderId,
  orderNumber,
  amountText,
  dueAt,
  paymentStatus,
  rejectedReason,
  upi,
  apiUrl,
  onSubmitted,
  onAuthExpired,
}) {
  const [now, setNow] = useState(() => Date.now());
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  // Refresh the countdown every 15 seconds.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // The admin is checking the screenshot.
  if (paymentStatus === "Under review") {
    return (
      <div className="mt-4 rounded-3xl bg-brand-50 p-4 text-left text-sm text-brand-900">
        <p className="flex items-center gap-2 font-semibold">
          <Clock size={16} className="text-brand-600" />
          We are checking your payment
        </p>
        <p className="mt-1 text-slate-600">
          Your order will be confirmed once we have checked the payment. You
          can see the progress in My orders.
        </p>
      </div>
    );
  }

  if (paymentStatus !== "Pending") return null;

  // Waiting for the screenshot.
  const dueMs = dueAt ? new Date(dueAt).getTime() : NaN;
  const hasTime = Number.isFinite(dueMs);
  const minutesLeft = hasTime ? Math.ceil((dueMs - now) / 60000) : null;
  const timeOver = hasTime && minutesLeft <= 0;

  function handleFileChange(event) {
    const chosen = event.target.files?.[0] || null;
    setError("");

    if (!chosen) {
      setFile(null);
      return;
    }

    if (!ALLOWED_TYPES.includes(chosen.type)) {
      setFile(null);
      setError("Please choose a JPG, PNG or WebP picture.");
      return;
    }

    if (chosen.size > MAX_SCREENSHOT_MB * 1024 * 1024) {
      setFile(null);
      setError(`The picture must be smaller than ${MAX_SCREENSHOT_MB} MB.`);
      return;
    }

    setFile(chosen);
  }

  async function handleUpload() {
    if (!file || uploading) return;

    const token = localStorage.getItem("vafCustomerToken");

    if (!token) {
      onAuthExpired();
      return;
    }

    setUploading(true);
    setError("");

    try {
      // A file upload uses FormData. We must NOT set Content-Type ourselves,
      // the browser adds it with the right boundary.
      const form = new FormData();
      form.append("orderId", String(orderId));
      form.append("screenshot", file);

      const response = await fetch(`${apiUrl}/api/payments/manual/proof`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      let data = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (response.status === 401) {
        onAuthExpired();
        return;
      }

      if (!response.ok || data.success === false) {
        throw new Error(data.message || "We could not upload the screenshot.");
      }

      setFile(null);
      onSubmitted();
    } catch (uploadError) {
      setError(uploadError.message || "We could not upload the screenshot.");
    } finally {
      setUploading(false);
    }
  }

  if (timeOver) {
    return (
      <p className="mt-4 rounded-3xl bg-amber-50 p-4 text-left text-sm text-amber-800">
        The payment time is over. This order will be cancelled shortly.
      </p>
    );
  }

  return (
    <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900">
      <p className="flex items-center gap-2 font-semibold">
        <Clock size={16} />
        {hasTime
          ? `Pay within ${minutesLeft} ${minutesLeft === 1 ? "minute" : "minutes"}`
          : "Pay now to confirm your order"}
      </p>

      {rejectedReason && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-red-50 p-3 text-red-700">
          <XCircle size={16} className="mt-0.5 shrink-0" />
          <span>
            Your last screenshot was not accepted: {rejectedReason}. Please
            pay correctly and upload a new screenshot.
          </span>
        </p>
      )}

      <div className="mt-3 space-y-1 rounded-2xl bg-white p-3 text-slate-700">
        <p>
          Amount to pay: <b className="text-brand-900">{amountText}</b>
        </p>
        <p>
          UPI number / ID: <b className="text-brand-900">{upi?.upiId}</b>
        </p>
        <p>
          Name: <b className="text-brand-900">{upi?.payeeName}</b>
        </p>
        <p>
          Order number: <b className="text-brand-900">#{orderNumber}</b>
        </p>
      </div>

      <p className="mt-3 text-xs">
        Pay the exact amount in any UPI app, then upload a screenshot of the
        payment here.
      </p>

      <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 bg-white p-3 font-medium text-brand-700">
        <Upload size={16} className="shrink-0" />
        <span className="truncate">
          {file ? file.name : "Choose the payment screenshot"}
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="sr-only"
        />
      </label>

      {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}

      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || uploading}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-5 py-3 text-sm font-bold text-white shadow-md shadow-brand-500/30 transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {uploading ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Uploading...
          </>
        ) : (
          "Upload screenshot"
        )}
      </button>
    </div>
  );
}