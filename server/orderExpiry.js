// ---------------------------------------------------------------
// orderExpiry.js
// Cancels orders that were never paid and gives their stock and
// time slot back, so unpaid orders cannot block other customers.
//
// Each order has its own deadline, "paymentDueAt". Orders whose
// payment screenshot is waiting for the admin ("Under review")
// and cash orders are never cancelled here.
// ---------------------------------------------------------------

const { releaseStock, releaseSlot } = require("./orderRoutes");
const { UNPAID_ORDER_MINUTES } = require("./shopConfig");

const CHECK_EVERY_MS = 60 * 1000; // look for overdue orders every minute
const BATCH_SIZE = 20; // handle at most 20 orders per check

// Builds the "this order is overdue" condition.
// Older orders have no paymentDueAt, so they use their creation time.
function overdueCondition() {
    const legacyCutoff = new Date(Date.now() - UNPAID_ORDER_MINUTES * 60 * 1000);

    return {
        $or: [
            { paymentDueAt: { $lte: new Date() } },
            { paymentDueAt: { $exists: false }, createdAt: { $lt: legacyCutoff } },
        ],
    };
}

async function expireUnpaidOrders(db) {
    const orders = db.collection("orders");

    const staleOrders = await orders
        .find({
            status: "Pending",
            paymentStatus: "Pending",
            stockReserved: true,
            ...overdueCondition(),
        })
        .limit(BATCH_SIZE)
        .toArray();

    for (const order of staleOrders) {
        // Step 1: claim the order. The filter repeats every condition, so if the
        // customer uploaded a screenshot (or the admin rejected it and gave more
        // time) a moment ago, this does nothing.
        const claimed = await orders.updateOne(
            {
                _id: order._id,
                status: "Pending",
                paymentStatus: "Pending",
                stockReserved: true,
                ...overdueCondition(),
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