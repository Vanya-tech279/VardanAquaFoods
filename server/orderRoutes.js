// ---------------------------------------------------------------
// orderRoutes.js
// Everything about checkout: config, slots, price quote, and
// order creation. The server is the ONLY place prices are decided.
// The browser sends product IDs and quantities, never prices.
// ---------------------------------------------------------------

const express = require("express");
const { ObjectId } = require("mongodb");

const {
    SHOP,
    DELIVERY,
    SLOTS,
    SLOT_CAPACITY,
    UNPAID_ORDER_MINUTES,
} = require("./shopConfig");
const {
    roundMoney,
    getDeliveryQuote,
    getNextDayDate,
    validateSlotChoice,
    calculateBill,
} = require("./billing");

const MAX_LINE_ITEMS = 30;
const MAX_QUANTITY_KG = 50;
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

// A small helper so every error has the same shape.
function fail(status, message) {
    return { error: { status, message } };
}

// ---------- Cart checking ----------

// Checks the cart the browser sent and merges duplicate lines.
// Expected shape: [{ productId, size, quantityKg }]
function parseCartItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return { error: "Your cart is empty." };
    }

    if (items.length > MAX_LINE_ITEMS) {
        return { error: "Too many items in one order." };
    }

    const merged = new Map();

    for (const item of items) {
        const productId = item?.productId;
        const size =
            typeof item?.size === "string" ? item.size.trim().toUpperCase() : "";
        const quantityKg = Number(item?.quantityKg);

        if (
            typeof productId !== "string" ||
            !OBJECT_ID_PATTERN.test(productId) ||
            !size
        ) {
            return { error: "One of the cart items is invalid." };
        }

              // Only whole kilograms between 1 and 50 kg are allowed.
        if (
            !Number.isFinite(quantityKg) ||
            quantityKg < 1 ||
            quantityKg > MAX_QUANTITY_KG ||
            !Number.isInteger(quantityKg)
        ) {
            return { error: "Quantities must be whole kilograms (1 to 50 kg)." };
        }
        const key = `${productId}__${size}`;
        const previous = merged.get(key);

        merged.set(key, {
            productId,
            size,
            quantityKg: (previous?.quantityKg || 0) + quantityKg,
        });
    }

    const lines = [...merged.values()];

    if (lines.some((line) => line.quantityKg > MAX_QUANTITY_KG)) {
        return { error: "A single product cannot exceed 50 kg per order." };
    }

    return { lines };
}

// Reads a product's sizes. Older products without "variants"
// are treated as one size "S", same as your normalizeProduct().
function getVariants(product) {
    if (Array.isArray(product.variants) && product.variants.length > 0) {
        return {
            legacy: false,
            variants: product.variants.map((variant) => ({
                size: String(variant.size).trim().toUpperCase(),
                pricePerKg: Number(variant.pricePerKg) || 0,
                stockKg: Number(variant.stockKg) || 0,
                available:
                    variant.available !== false && Number(variant.stockKg) > 0,
            })),
        };
    }

    const stockKg = Number(product.stockKg) || 0;

    return {
        legacy: true,
        variants: [
            {
                size: "S",
                pricePerKg: Number(product.pricePerKg) || 0,
                stockKg,
                available: product.available !== false && stockKg > 0,
            },
        ],
    };
}

// Looks up every product in MongoDB and takes the REAL price and stock.
async function priceItems(db, lines) {
    const ids = [...new Set(lines.map((line) => line.productId))].map(
        (id) => new ObjectId(id)
    );

    const products = await db
        .collection("products")
        .find({ _id: { $in: ids } })
        .toArray();

    const productById = new Map(
        products.map((product) => [product._id.toString(), product])
    );

    const items = [];

    for (const line of lines) {
        const product = productById.get(line.productId);

        if (!product) {
            return { error: "A product in your cart is no longer available." };
        }

        const { legacy, variants } = getVariants(product);
        const variant = variants.find((item) => item.size === line.size);

        if (!variant) {
            return {
                error: `${product.name} is not sold in size ${line.size}.`,
            };
        }

        if (variant.pricePerKg <= 0) {
            return { error: `${product.name} is not available right now.` };
        }

        if (!variant.available || variant.stockKg < line.quantityKg) {
            return {
                error: `Only ${Math.max(variant.stockKg, 0)} kg of ${product.name} (size ${line.size}) is available.`,
            };
        }

        items.push({
            productId: product._id,
            name: product.name,
            category: product.category,
            imageUrl: product.imageUrl || "",
            size: line.size,
            quantityKg: line.quantityKg,
            pricePerKg: variant.pricePerKg,
            lineTotal: roundMoney(variant.pricePerKg * line.quantityKg),
            legacyProduct: legacy,
        });
    }

    return { items };
}

// ---------- Stock reservation ----------

// Takes stock out in ONE atomic step per item. The filter contains
// "stockKg >= quantity", so two customers can never buy the same last kg.
async function reserveStock(db, items) {
    const products = db.collection("products");
    const reserved = [];

    for (const item of items) {
        const filter = item.legacyProduct
            ? { _id: item.productId, stockKg: { $gte: item.quantityKg } }
            : {
                  _id: item.productId,
                  variants: {
                      $elemMatch: {
                          size: item.size,
                          stockKg: { $gte: item.quantityKg },
                      },
                  },
              };

        const update = item.legacyProduct
            ? { $inc: { stockKg: -item.quantityKg } }
            : {
                  $inc: {
                      "variants.$.stockKg": -item.quantityKg,
                      stockKg: -item.quantityKg,
                  },
              };

        const result = await products.updateOne(filter, update);

        if (result.modifiedCount !== 1) {
            // Someone bought it first. Put back what we already took.
            await releaseStock(db, reserved);
            return false;
        }

        reserved.push(item);
    }

    return true;
}

// Gives stock back (used when something fails, and later for cancellations).
async function releaseStock(db, items) {
    const products = db.collection("products");

    for (const item of items) {
        if (item.legacyProduct) {
            await products.updateOne(
                { _id: item.productId },
                { $inc: { stockKg: item.quantityKg } }
            );
        } else {
            await products.updateOne(
                { _id: item.productId, "variants.size": item.size },
                {
                    $inc: {
                        "variants.$.stockKg": item.quantityKg,
                        stockKg: item.quantityKg,
                    },
                }
            );
        }
    }
}

// ---------- Slot reservation ----------

// One MongoDB document per (date, slot, method) keeps a counter.
// The unique index plus "bookedCount < capacity" makes this race-proof.
async function reserveSlot(db, date, slotId, method) {
    const capacity = SLOT_CAPACITY[method];

    if (!(capacity > 0)) return false;

    try {
        await db.collection("slot_bookings").updateOne(
            { date, slotId, method, bookedCount: { $lt: capacity } },
            {
                $inc: { bookedCount: 1 },
                $setOnInsert: { createdAt: new Date() },
            },
            { upsert: true }
        );
        return true;
    } catch (error) {
        // 11000 = duplicate key = the slot document exists and is full.
        if (error.code === 11000) return false;
        throw error;
    }
}

async function releaseSlot(db, date, slotId, method) {
    await db.collection("slot_bookings").updateOne(
        { date, slotId, method, bookedCount: { $gt: 0 } },
        { $inc: { bookedCount: -1 } }
    );
}

// ---------- Shared checkout preparation ----------

// Validates everything and calculates the bill. Used by BOTH the
// quote endpoint (live bill) and the order endpoint (real order).
async function prepareCheckout(db, customerId, body, requireSlot) {
    const { items, fulfillmentMethod, addressId, date, slotId } = body || {};

    if (!["takeaway", "delivery"].includes(fulfillmentMethod)) {
        return fail(400, "Please choose Takeaway or Doorstep Delivery.");
    }

    const cart = parseCartItems(items);
    if (cart.error) return fail(400, cart.error);

    let slot = null;

    if (requireSlot) {
        const check = validateSlotChoice(date, slotId);
        if (!check.valid) return fail(400, check.reason);
        slot = SLOTS.find((item) => item.id === slotId);
    }

    let address = null;
    let deliveryQuote = null;

    if (fulfillmentMethod === "delivery") {
        if (!addressId || !OBJECT_ID_PATTERN.test(String(addressId))) {
            return fail(400, "Please select a delivery address.");
        }

        address = await db.collection("customer_addresses").findOne({
            _id: new ObjectId(addressId),
            customerId,
        });

        if (!address) {
            return fail(400, "The selected delivery address was not found.");
        }

        if (!/^\d{10}$/.test(String(address.phone || "").trim())) {
            return fail(400, "A valid 10-digit recipient phone number is required.");
        }

        deliveryQuote = getDeliveryQuote(address.latitude, address.longitude);

        if (!deliveryQuote.available) {
            return fail(400, deliveryQuote.reason);
        }
    }

    const priced = await priceItems(db, cart.lines);
    if (priced.error) return fail(409, priced.error);

    const itemSubtotal = priced.items.reduce(
        (total, item) => total + item.lineTotal,
        0
    );

    const bill = calculateBill({ itemSubtotal, fulfillmentMethod, deliveryQuote });

    return {
        data: {
            fulfillmentMethod,
            items: priced.items,
            bill,
            slot,
            date: requireSlot ? date : null,
            address,
        },
    };
}

// ---------- The router ----------

function createOrderRoutes({ getDb, requireCustomer }) {
    const router = express.Router();

    // Creates the unique index once, the first time it is needed.
    let indexPromise = null;
    function ensureIndexes() {
        if (!indexPromise) {
            indexPromise = getDb()
                .collection("slot_bookings")
                .createIndex(
                    { date: 1, slotId: 1, method: 1 },
                    { unique: true }
                )
                .catch((error) => {
                    indexPromise = null;
                    throw error;
                });
        }
        return indexPromise;
    }

    // PUBLIC: shop details, slots, and the next bookable date.
    router.get("/api/checkout/config", (req, res) => {
        res.json({
            success: true,
            shop: {
                name: SHOP.name,
                address: SHOP.address,
                pinCode: SHOP.pinCode,
            },
            nextDate: getNextDayDate(),
            slots: SLOTS,
            deliveryEnabled:
                Number.isFinite(SHOP.latitude) &&
                Number.isFinite(SHOP.longitude),
            maxRadiusKm: DELIVERY.maxRadiusKm,
               feeTiers: DELIVERY.feeTiers,
            unpaidOrderMinutes: UNPAID_ORDER_MINUTES,         feeTiers: DELIVERY.feeTiers,
        });
    });

    // PUBLIC: slots for tomorrow with how many places are left.
    router.get("/api/checkout/slots", async (req, res) => {
        try {
            const method = req.query.method;

            if (!["takeaway", "delivery"].includes(method)) {
                return res.status(400).json({
                    success: false,
                    message: "Choose takeaway or delivery.",
                });
            }

            const date = getNextDayDate();
            const bookings = await getDb()
                .collection("slot_bookings")
                .find({ date, method })
                .toArray();

            const bookedBySlot = new Map(
                bookings.map((item) => [item.slotId, item.bookedCount])
            );

            const slots = SLOTS.map((slot) => {
                const remaining = Math.max(
                    SLOT_CAPACITY[method] - (bookedBySlot.get(slot.id) || 0),
                    0
                );
                return { ...slot, remaining, available: remaining > 0 };
            });

            res.json({ success: true, date, method, slots });
        } catch (error) {
            console.error("Fetch slots failed:", error.message);
            res.status(500).json({
                success: false,
                message: "Unable to load time slots.",
            });
        }
    });

    // CUSTOMER: live bill. Nothing is saved or reserved here.
    router.post("/api/checkout/quote", requireCustomer, async (req, res) => {
        try {
            const result = await prepareCheckout(
                getDb(),
                req.customerId,
                req.body,
                false
            );

            if (result.error) {
                return res.status(result.error.status).json({
                    success: false,
                    message: result.error.message,
                });
            }

            res.json({
                success: true,
                bill: result.data.bill,
                items: result.data.items.map((item) => ({
                    productId: item.productId,
                    name: item.name,
                    size: item.size,
                    quantityKg: item.quantityKg,
                    pricePerKg: item.pricePerKg,
                    lineTotal: item.lineTotal,
                })),
            });
        } catch (error) {
            console.error("Quote failed:", error.message);
            res.status(500).json({
                success: false,
                message: "Unable to calculate your bill.",
            });
        }
    });

    // CUSTOMER: create the order.
    router.post("/api/orders", requireCustomer, async (req, res) => {
        const db = getDb();
        let slotReserved = false;
        let stockReserved = false;
        let prepared = null;

        try {
            await ensureIndexes();

            const result = await prepareCheckout(
                db,
                req.customerId,
                req.body,
                true
            );

            if (result.error) {
                return res.status(result.error.status).json({
                    success: false,
                    message: result.error.message,
                });
            }

            prepared = result.data;
            const { fulfillmentMethod, date, slot, address, items, bill } =
                prepared;

            // 1) Reserve the slot.
            slotReserved = await reserveSlot(
                db,
                date,
                slot.id,
                fulfillmentMethod
            );

            if (!slotReserved) {
                return res.status(409).json({
                    success: false,
                    message: "That time slot is full. Please choose another slot.",
                });
            }

            // 2) Reserve the stock.
            stockReserved = await reserveStock(db, items);

            if (!stockReserved) {
                await releaseSlot(db, date, slot.id, fulfillmentMethod);
                slotReserved = false;

                return res.status(409).json({
                    success: false,
                    message:
                        "Stock changed while you were checking out. Please review your cart.",
                });
            }

            // 3) Save the order.
            const order = {
                customerId: req.customerId,
                fulfillmentMethod,
                scheduledDate: date,
                slot: { id: slot.id, label: slot.label },

                pickupLocation:
                    fulfillmentMethod === "takeaway"
                        ? {
                              name: SHOP.name,
                              address: SHOP.address,
                              pinCode: SHOP.pinCode,
                          }
                        : null,

                addressId: address ? address._id : null,
                deliveryAddress: address
                    ? {
                          label: address.label,
                          recipientName: address.recipientName,
                          phone: address.phone,
                          houseNumber: address.houseNumber,
                          street: address.street,
                          locality: address.locality,
                          city: address.city,
                          state: address.state,
                          pinCode: address.pinCode,
                          landmark: address.landmark || "",
                          latitude: address.latitude,
                          longitude: address.longitude,
                      }
                    : null,

                items,
                bill,
                totalAmount: bill.total, // used by "My Orders" in the frontend

                status: "Pending",
                paymentMethod: "UPI",
                paymentStatus: "Pending",
                stockReserved: true,

                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const insertResult = await db.collection("orders").insertOne(order);

            return res.status(201).json({
                success: true,
                message: "Order created successfully.",
                orderId: insertResult.insertedId,
                bill,
            });
        } catch (error) {
            console.error("Create order failed:", error.message);

            // Undo anything we reserved before the failure.
            try {
                if (stockReserved && prepared) {
                    await releaseStock(db, prepared.items);
                }
                if (slotReserved && prepared) {
                    await releaseSlot(
                        db,
                        prepared.date,
                        prepared.slot.id,
                        prepared.fulfillmentMethod
                    );
                }
            } catch (cleanupError) {
                console.error("Cleanup failed:", cleanupError.message);
            }

            return res.status(500).json({
                success: false,
                message: "Unable to create your order.",
            });
        }
    });

    return router;
}

module.exports = createOrderRoutes;
module.exports.releaseStock = releaseStock;
module.exports.releaseSlot = releaseSlot;