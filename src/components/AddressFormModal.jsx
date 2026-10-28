import { useState } from "react";
import { LocateFixed, MapPin, CheckCircle2, X } from "lucide-react";
// Fields shown in the form: [key, label, placeholder, required]
const FIELDS = [
    ["recipientName", "Recipient name", "Full name", true],
    ["phone", "Phone number", "10-digit mobile number", true],
    ["houseNumber", "House / Flat number", "House or flat number", true],
    ["street", "Street", "Street name", true],
    ["locality", "Locality", "Area or locality", true],
    ["city", "City", "City or town", true],
    ["state", "State", "State", true],
    ["pinCode", "PIN code", "6-digit PIN code", true],
    ["landmark", "Landmark (optional)", "Nearby landmark", false],
];

export default function AddressFormModal({
    isEditing,
    form,
    setForm,
    saving,
    error,
    onSubmit,
    onClose,
}) {
    const [locating, setLocating] = useState(false);
    const [locationError, setLocationError] = useState("");

    const hasLocation =
        Number.isFinite(form.latitude) && Number.isFinite(form.longitude);

    // Asks the browser for the phone's/computer's current GPS position.
    function useCurrentLocation() {
        setLocationError("");

        if (!navigator.geolocation) {
            setLocationError("Your browser does not support location access.");
            return;
        }

        setLocating(true);

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setForm((current) => ({
                    ...current,
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                }));
                setLocating(false);
            },
            (geoError) => {
                setLocating(false);

                if (geoError.code === 1) {
                    setLocationError(
                        "Location permission was denied. Please allow location access in your browser and try again."
                    );
                } else if (geoError.code === 2) {
                    setLocationError(
                        "Your location could not be found. Please try again."
                    );
                } else {
                    setLocationError("Finding your location took too long. Please try again.");
                }
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    }

    function handleSubmit(event) {
        event.preventDefault();

        // Delivery distance needs coordinates, so they are required.
        if (!hasLocation) {
            event.stopPropagation();
            setLocationError(
                "Please tap 'Use my current location' while you are at the delivery address."
            );
            return;
        }

        onSubmit(event);
    }

        // Fields that take the full width of the form.
    const WIDE_FIELDS = ["recipientName", "street", "landmark"];

    const fieldClass =
        "w-full rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100";
    const labelClass = "mb-1.5 block text-sm font-semibold text-brand-900";

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-brand-900/60 p-4 backdrop-blur-sm">
            <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl sm:p-8">
                <div className="mb-6 flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">
                            Delivery details
                        </p>
                        <h2 className="mt-1 font-display text-2xl font-extrabold text-brand-900">
                            {isEditing ? "Edit address" : "Add new address"}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Tell us where to bring your seafood.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-2 text-slate-500 transition hover:bg-brand-50 hover:text-brand-900"
                        aria-label="Close address form"
                    >
                        <X size={22} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                        <label className={labelClass}>Address label</label>
                        <select
                            value={form.label}
                            onChange={(event) =>
                                setForm({ ...form, label: event.target.value })
                            }
                            className={fieldClass}
                        >
                            <option>Home</option>
                            <option>Work</option>
                            <option>Other</option>
                        </select>
                    </div>

                    {FIELDS.map(([name, label, placeholder, required]) => (
                        <div
                            key={name}
                            className={WIDE_FIELDS.includes(name) ? "sm:col-span-2" : ""}
                        >
                            <label className={labelClass}>{label}</label>
                            <input
                                type="text"
                                value={form[name] ?? ""}
                                onChange={(event) =>
                                    setForm({ ...form, [name]: event.target.value })
                                }
                                placeholder={placeholder}
                                required={required}
                                maxLength={name === "pinCode" ? 6 : name === "phone" ? 10 : 120}
                                inputMode={
                                    ["phone", "pinCode"].includes(name) ? "numeric" : "text"
                                }
                                pattern={
                                    name === "pinCode"
                                        ? "[0-9]{6}"
                                        : name === "phone"
                                          ? "[0-9]{10}"
                                          : undefined
                                }
                                className={fieldClass}
                            />
                        </div>
                    ))}

                    {/* Delivery location */}
                    <div className="rounded-3xl border border-brand-100 bg-brand-50 p-5 sm:col-span-2">
                        <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm">
                                <MapPin className="h-5 w-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="font-display font-bold text-brand-900">
                                    Delivery location
                                </p>
                                <p className="mt-1 text-xs leading-5 text-slate-600">
                                    We use your location to check the distance and delivery
                                    charge. Tap the button while you are at the delivery
                                    address.
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={useCurrentLocation}
                            disabled={locating}
                            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-3 text-sm font-bold text-white shadow-md shadow-brand-500/30 transition hover:opacity-95 active:scale-[0.99] disabled:opacity-60"
                        >
                            <LocateFixed size={16} />
                            {locating
                                ? "Finding your location..."
                                : hasLocation
                                  ? "Update my current location"
                                  : "Use my current location"}
                        </button>

                        {hasLocation && (
                            <div className="mt-3 flex items-start gap-2 rounded-2xl bg-emerald-50 p-3 text-xs text-emerald-800">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                                <p>
                                    Location saved.{" "}
                                    <a
                                        href={`https://www.google.com/maps?q=${form.latitude},${form.longitude}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-semibold underline"
                                    >
                                        Check it on Google Maps
                                    </a>
                                </p>
                            </div>
                        )}

                        {locationError && (
                            <p className="mt-3 rounded-2xl bg-red-50 p-3 text-xs text-red-700">
                                {locationError}
                            </p>
                        )}
                    </div>

                    {error && (
                        <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-600 sm:col-span-2">
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={saving}
                        className="btn-sheen w-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-3.5 font-bold text-white shadow-lg shadow-brand-500/30 transition hover:opacity-95 active:scale-[0.99] disabled:opacity-50 sm:col-span-2"
                    >
                        {saving
                            ? "Saving..."
                            : isEditing
                              ? "Update address"
                              : "Save address"}
                    </button>
                </form>
            </div>
        </div>
    );
}