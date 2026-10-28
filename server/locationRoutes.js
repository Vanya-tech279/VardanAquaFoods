// ---------------------------------------------------------------
// locationRoutes.js
// A small public endpoint: "do you deliver to these coordinates?"
// It only calculates. It does NOT save the customer's location.
// ---------------------------------------------------------------

const express = require("express");
const { getDeliveryQuote } = require("./billing");
const { DELIVERY } = require("./shopConfig");

// Accepts a number or a numeric string and returns a number, or null.
function toCoordinate(value, min, max) {
    if (value === undefined || value === null || value === "") return null;

    const number = Number(value);

    if (!Number.isFinite(number) || number < min || number > max) {
        return null;
    }

    return number;
}

function createLocationRoutes() {
    const router = express.Router();

    router.post("/api/delivery/check-location", (req, res) => {
        const latitude = toCoordinate(req.body?.latitude, -90, 90);
        const longitude = toCoordinate(req.body?.longitude, -180, 180);

        if (latitude === null || longitude === null) {
            return res.status(400).json({
                success: false,
                message: "A valid latitude and longitude are required.",
            });
        }

        // Same rules as checkout: distance from the shop, fee tiers, 6 km limit.
        const quote = getDeliveryQuote(latitude, longitude);

        return res.json({
            success: true,
            available: quote.available,
            distanceKm: quote.distanceKm ?? null,
            deliveryFee: quote.deliveryFee ?? null,
            maxRadiusKm: DELIVERY.maxRadiusKm,
            message: quote.available ? "" : quote.reason,
        });
    });

    return router;
}

module.exports = createLocationRoutes;