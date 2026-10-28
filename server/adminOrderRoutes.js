// ---------------------------------------------------------------
// adminOrderRoutes.js
// Admin-only endpoints for viewing and managing customer orders.
// ---------------------------------------------------------------

const express = require("express");
const { ObjectId } = require("mongodb");

const MAX_ORDERS = 500;
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

// Allowed next steps, by fulfillment method. Change statuses here only.
const NEXT_STATUS = {
    takeaway: {
        Confirmed: ["Preparing"],
        Preparing: ["Ready"],
        Ready: ["Completed"],
    },
    delivery: {
        Confirmed: ["Preparing"],
        Preparing: ["Out for delivery"],
        "Out for delivery": ["Delivered"],
    },
};

function createAdminOrderRoutes({ getDb, requireAdmin }) {
    const router = express.Router();

    // ADMIN: list all orders, newest first, with customer name and email.
    router.get("/api/admin/orders", requireAdmin, async (req, res) => {
        try {
            const db = getDb();

            const orders = await db
                .collection("orders")
                .find({})
                .sort({ createdAt: -1 })
                .limit(MAX_ORDERS)
                .toArray();

            // Look up each customer once (never return password hashes).
            const uniqueIds = [
                ...new Map(
                    orders
                        .filter((order) => order.customerId)
                        .map((order) => [String(order.customerId), order.customerId])
                ).values(),
            ];

            const customers = await db
                .collection("customers")
                .find({ _id: { $in: uniqueIds } })
                .project({ name: 1, email: 1 })
                .toArray();

            const customerById = new Map(
                customers.map((customer) => [String(customer._id), customer])
            );

            res.json({
                success: true,
                orders: orders.map((order) => {
                    const customer = customerById.get(String(order.customerId));

                    return {
                        ...order,
                        customer: customer
                            ? { name: customer.name, email: customer.email }
                            : null,
                    };
                }),
            });
        } catch (error) {
            console.error("Fetch admin orders failed:", error.message);

            res.status(500).json({
                success: false,
                message: "Unable to fetch orders.",
            });
        }
    });
    // ADMIN: move a paid order to its next fulfillment status.
    router.patch(
        "/api/admin/orders/:id/status",
        requireAdmin,
        async (req, res) => {
            try {
                const { id } = req.params;
                const nextStatus = req.body?.status;

                if (!OBJECT_ID_PATTERN.test(id)) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid order ID.",
                    });
                }

                if (typeof nextStatus !== "string" || !nextStatus.trim()) {
                    return res.status(400).json({
                        success: false,
                        message: "A status is required.",
                    });
                }

                const orders = getDb().collection("orders");
                const order = await orders.findOne({ _id: new ObjectId(id) });

                if (!order) {
                    return res.status(404).json({
                        success: false,
                        message: "Order not found.",
                    });
                }

                if (order.paymentStatus !== "Paid") {
                    return res.status(409).json({
                        success: false,
                        message:
                            "Only paid orders can be moved through fulfillment.",
                    });
                }

                const allowed =
                    NEXT_STATUS[order.fulfillmentMethod]?.[order.status] || [];

                if (!allowed.includes(nextStatus)) {
                    return res.status(400).json({
                        success: false,
                        message: allowed.length
                            ? `From "${order.status}" this order can only move to: ${allowed.join(", ")}.`
                            : `A "${order.status}" order cannot be changed this way.`,
                    });
                }

                // The filter repeats the current status and payment, so
                // this only works if nothing changed in the meantime.
                const result = await orders.updateOne(
                    {
                        _id: order._id,
                        status: order.status,
                        paymentStatus: "Paid",
                    },
                    { $set: { status: nextStatus, updatedAt: new Date() } }
                );

                if (result.modifiedCount !== 1) {
                    return res.status(409).json({
                        success: false,
                        message:
                            "This order was just changed. Please refresh and try again.",
                    });
                }

                return res.json({
                    success: true,
                    message: "Order status updated.",
                    orderId: order._id,
                    status: nextStatus,
                });
            } catch (error) {
                console.error("Update order status failed:", error.message);

                return res.status(500).json({
                    success: false,
                    message: "Unable to update the order status.",
                });
            }
        }
    );
    return router;
}

module.exports = createAdminOrderRoutes;