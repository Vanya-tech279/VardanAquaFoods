// ---------------------------------------------------------------
// billing.js
// Pure calculation functions: distance, delivery fee, slot dates,
// and the final bill. No database here, so it is easy to test.
// ---------------------------------------------------------------

const {
    SHOP,
    DELIVERY,
    TAX_PERCENT,
    TIME_ZONE,
    SLOTS,
    CLOSED_DATES,
} = require("./shopConfig");

// Rounds money to 2 decimal places (avoids 0.1 + 0.2 style errors).
function roundMoney(value) {
    return Math.round(value * 100) / 100;
}

// Straight-line distance between two GPS points, in km (Haversine formula).
function distanceInKm(lat1, lon1, lat2, lon2) {
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const earthRadiusKm = 6371;

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
            Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) ** 2;

    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Decides if a destination can be delivered to, and the delivery fee.
function getDeliveryQuote(latitude, longitude) {
    // Safety: delivery stays off until the shop location is verified.
    if (!Number.isFinite(SHOP.latitude) || !Number.isFinite(SHOP.longitude)) {
        return {
            available: false,
            reason: "Doorstep delivery is not enabled yet.",
        };
    }

    // The saved address must have coordinates.
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return {
            available: false,
            reason: "This address has no verified location. Please re-save it with your location.",
        };
    }

    const distanceKm =
        Math.round(
            distanceInKm(SHOP.latitude, SHOP.longitude, latitude, longitude) * 100
        ) / 100;

    const tier = DELIVERY.feeTiers.find((t) => distanceKm <= t.upToKm);

    if (!tier || distanceKm > DELIVERY.maxRadiusKm) {
        return {
            available: false,
            distanceKm,
            reason: `This address is ${distanceKm} km away. We deliver only within ${DELIVERY.maxRadiusKm} km.`,
        };
    }

    return { available: true, distanceKm, deliveryFee: tier.fee };
}

// Tomorrow's date as YYYY-MM-DD in Indian time.
function getNextDayDate() {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(
        tomorrow
    );
}

// Checks that the chosen date and slot are allowed (next day only for now).
function validateSlotChoice(date, slotId) {
    if (date !== getNextDayDate()) {
        return { valid: false, reason: "Please choose tomorrow's date." };
    }
    if (CLOSED_DATES.includes(date)) {
        return { valid: false, reason: "The shop is closed on this date." };
    }
    if (!SLOTS.some((slot) => slot.id === slotId)) {
        return { valid: false, reason: "Please choose a valid time slot." };
    }
    return { valid: true };
}

// Builds the full bill. "takeaway" has no delivery fee and no ₹9 charge.
function calculateBill({ itemSubtotal, fulfillmentMethod, deliveryQuote }) {
    const isDelivery = fulfillmentMethod === "delivery";

    if (isDelivery && !(deliveryQuote && deliveryQuote.available)) {
        throw new Error("Delivery is not available for this address.");
    }

    const subtotal = roundMoney(itemSubtotal);
    const deliveryFee = isDelivery ? deliveryQuote.deliveryFee : 0;
    const serviceCharge = isDelivery ? DELIVERY.extraServiceCharge : 0;
    const tax = roundMoney((subtotal * TAX_PERCENT) / 100);
    const total = roundMoney(subtotal + deliveryFee + serviceCharge + tax);

    return {
        fulfillmentMethod,
        subtotal,
        deliveryFee,
        serviceCharge,
        tax,
        total,
        distanceKm: isDelivery ? deliveryQuote.distanceKm : null,
    };
}

module.exports = {
    roundMoney,
    distanceInKm,
    getDeliveryQuote,
    getNextDayDate,
    validateSlotChoice,
    calculateBill,
};