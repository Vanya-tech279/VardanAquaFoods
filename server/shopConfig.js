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

// The shop's WhatsApp number for special orders and enquiries.
// Digits only, with the country code and no "+" or spaces.
const WHATSAPP = {
    number: "919381824979",
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

// Old Razorpay leftover. Checkout no longer uses it. It stays here only
// until we have checked orderExpiry.js and adminOrderRoutes.js.
const UNPAID_ORDER_MINUTES = 15;

// ---------------------------------------------------------------
// PAYMENT METHODS
// Change these values here only.
// ---------------------------------------------------------------
const PAYMENT = {
    // Customer pays to your UPI number or ID, then uploads a screenshot
    // of the payment. You check your bank app and approve the order.
    upiScreenshot: {
        enabled: true,

        // Shown to every customer on the checkout screen.
        upiId: "Q143155676@ybl",
        payeeName: "Vardan Aqua Foods",

        // Minutes the customer has to pay and upload the screenshot before
        // the order is cancelled. An order waiting for your approval never expires.
        payWithinMinutes: 30,
    },

    // Cash on delivery for delivery orders, and "pay at the shop" for takeaway.
    cod: {
        enabled: true,
        // PLACEHOLDER. Orders above this amount must be paid by UPI.
        maxOrderTotal: 3000,
    },
};

module.exports = {
    SHOP,
    WHATSAPP,
    DELIVERY,
    TAX_PERCENT,
    TIME_ZONE,
    SLOTS,
    SLOT_CAPACITY,
    CLOSED_DATES,
    UNPAID_ORDER_MINUTES,
    PAYMENT,
};