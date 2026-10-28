// ---------------------------------------------------------------
// orderExpiry.js
// Cancels orders that were never paid and gives their stock and
// time slot back, so unpaid orders cannot block other customers.
// ---------------------------------------------------------------

const { releaseStock, releaseSlot } = require("./orderRoutes");

const { UNPAID_ORDER_MINUTES } = require("./shopConfig");
const CHECK_EVERY_MS = 60 * 1000; // look for old unpaid orders every minute
const BATCH_SIZE = 20; // handle at most 20 orders per check

async function expireUnpaidOrders(db) {
    const orders = db.collection("orders");
    const cutoff = new Date(Date.now() - UNPAID_ORDER_MINUTES * 60 * 1000);

    // Orders that are still waiting for payment and are older than the cutoff.
    const staleOrders = await orders
        .find({
            status: "Pending",
            paymentStatus: "Pending",
            stockReserved: true,
            createdAt: { $lt: cutoff },
        })
        .limit(BATCH_SIZE)
        .toArray();

    for (const order of staleOrders) {
        // Step 1: claim the order. The filter means this works only while it
        // is still Pending and unpaid. If a payment is confirmed at this exact
        // moment, one side wins and the other does nothing.
        const claimed = await orders.updateOne(
            {
                _id: order._id,
                status: "Pending",
                paymentStatus: "Pending",
                stockReserved: true,
            },
            {
                $set: {
                    status: "Cancelled",
                    paymentStatus: "Expired",
                    stockReserved: false,
                    cancelledAt: new Date(),
                    cancelReason: "Payment was not completed in time.",
                    updatedAt: new Date(),
                },
            }
        );

        if (claimed.modifiedCount !== 1) continue;

        // Step 2: give the stock and the slot back.
        try {
            if (Array.isArray(order.items)) {
                await releaseStock(db, order.items);
            }

            await releaseSlot(
                db,
                order.scheduledDate,
                order.slot.id,
                order.fulfillmentMethod
            );

            console.log(`Expired unpaid order ${order._id}. Stock and slot released.`);
        } catch (error) {
            console.error(
                `Could not release stock or slot for expired order ${order._id}:`,
                error.message
            );
        }
    }
}

function startOrderExpiry({ getDb }) {
    let running = false;

    async function check() {
        // Skip if the previous check is still running.
        if (running) return;
        running = true;

        try {
            await expireUnpaidOrders(getDb());
        } catch (error) {
            console.error("Order expiry check failed:", error.message);
        } finally {
            running = false;
        }
    }

    check();
    setInterval(check, CHECK_EVERY_MS);
}

module.exports = startOrderExpiry;