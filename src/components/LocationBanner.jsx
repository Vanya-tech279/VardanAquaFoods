import { MapPin, CheckCircle2, XCircle, LocateFixed, X } from "lucide-react";

// Builds the colours, icon, and message for each state.
function describe(status) {
    switch (status.state) {
        case "checking":
            return {
                tone: "border-brand-200 bg-brand-50 text-brand-900",
                chip: "bg-white text-brand-600",
                icon: LocateFixed,
                title: "Checking your location",
                text: "Allow location access to see if we deliver to you.",
            };

        case "deliverable":
            return {
                tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
                chip: "bg-white text-emerald-600",
                icon: CheckCircle2,
                title: "Good news, we deliver to your location",
                text: `You are about ${status.distanceKm} km from our shop. Delivery starts at ₹${status.deliveryFee}.`,
            };

        case "outside":
            return {
                tone: "border-amber-200 bg-amber-50 text-amber-900",
                chip: "bg-white text-amber-600",
                icon: XCircle,
                title: "Sorry, we don't deliver to your current location",
                text: `You are about ${status.distanceKm} km away and we deliver within ${status.maxRadiusKm} km. You can still pre-order and collect from our shop, or deliver to an address inside our area.`,
            };

        case "disabled":
            return {
                tone: "border-amber-200 bg-amber-50 text-amber-900",
                chip: "bg-white text-amber-600",
                icon: XCircle,
                title: "Doorstep delivery isn't open yet",
                text: "You can still pre-order and collect from our shop.",
            };

        case "denied":
            return {
                tone: "border-slate-200 bg-white text-slate-800",
                chip: "bg-slate-100 text-slate-600",
                icon: MapPin,
                title: "Location access is off",
                text: "Turn on location in your browser to see if we deliver to you. You can also save an address at checkout.",
            };

        case "error":
            return {
                tone: "border-red-200 bg-red-50 text-red-800",
                chip: "bg-white text-red-600",
                icon: XCircle,
                title: "We couldn't check your location",
                text: status.message || "Please try again.",
            };

        default:
            return null;
    }
}

export default function LocationBanner({ status, dismissed, onRetry, onDismiss }) {
    if (dismissed) return null;

    const info = describe(status);
    if (!info) return null;

    const Icon = info.icon;
    const canRetry = ["denied", "error", "outside", "deliverable"].includes(
        status.state
    );

    return (
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
            <div
                role="status"
                className={`flex items-start gap-3 rounded-3xl border p-4 shadow-soft ${info.tone}`}
            >
                <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-sm ${info.chip}`}
                >
                    <Icon className="h-5 w-5" />
                </span>

                <div className="min-w-0 flex-1">
                    <p className="font-display font-bold">{info.title}</p>
                    <p className="mt-0.5 text-sm leading-5 opacity-90">{info.text}</p>

                    {canRetry && (
                        <button
                            type="button"
                            onClick={onRetry}
                            className="mt-2 text-sm font-semibold underline"
                        >
                            {status.state === "denied" || status.state === "error"
                                ? "Try again"
                                : "Check again"}
                        </button>
                    )}
                </div>

                {status.state !== "checking" && (
                    <button
                        type="button"
                        onClick={onDismiss}
                        aria-label="Close this message"
                        className="shrink-0 rounded-full p-1.5 transition hover:bg-black/5"
                    >
                        <X size={18} />
                    </button>
                )}
            </div>
        </div>
    );
}