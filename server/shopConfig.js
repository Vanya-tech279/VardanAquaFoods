// ---------------------------------------------------------------
// shopConfig.js
// Every business rule lives here. When the owner confirms a rule
// (for example the ₹9 charge), you change it in this one file only.
// ---------------------------------------------------------------

// Shop details. Delivery works only because latitude/longitude are set.
const SHOP = {
    name: "VARDAN AQUA FOODS",
    address: "RH Colony, Seven Temples Road",
    pinCode: "530046",
    latitude: 17.692526820091327,
    longitude: 83.17088802883556,
};

// Delivery rules.
const DELIVERY = {
    maxRadiusKm: 6,
    // Checked from top to bottom. The first tier that fits is used.
    feeTiers: [
        { upToKm: 3, fee: 30 },
        { upToKm: 6, fee: 50 }, // earlier stated rule: ₹50 above 3 km
    ],
    // Nature of this ₹9 is still unconfirmed (service charge or tax?).
    extraServiceCharge: 9,
};

// Tax percentage applied to the item subtotal. 0 until the business
// confirms what is legally applicable.
const TAX_PERCENT = 0;

// All date/time logic uses this time zone.
const TIME_ZONE = "Asia/Kolkata";

// Morning slots. "id" is stored in MongoDB, "label" is shown to customers.
const SLOTS = [
    { id: "0630-0730", label: "6:30 AM–7:30 AM" },
    { id: "0730-0830", label: "7:30 AM–8:30 AM" },
    { id: "0830-0930", label: "8:30 AM–9:30 AM" },
    { id: "0930-1030", label: "9:30 AM–10:30 AM" },
    { id: "1030-1130", label: "10:30 AM–11:30 AM" },
];

// Maximum orders per slot. Separate for pickup and delivery.
// 10 is a placeholder, so set the real numbers with the owner.
const SLOT_CAPACITY = {
    takeaway: 10,
    delivery: 10,
};

// Dates (YYYY-MM-DD) when the shop is closed, for example holidays.
const CLOSED_DATES = [];

// How many minutes a customer has to pay before an unpaid order is
// cancelled and its stock and slot are released.
const UNPAID_ORDER_MINUTES = 15;

module.exports = {
    SHOP,
    DELIVERY,
    TAX_PERCENT,
    TIME_ZONE,
    SLOTS,
    SLOT_CAPACITY,
    CLOSED_DATES,
    UNPAID_ORDER_MINUTES,
};