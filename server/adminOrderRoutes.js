// ---------------------------------------------------------------
// adminOrderRoutes.js
// Admin-only endpoints for viewing and managing customer orders.
// ---------------------------------------------------------------

const express = require("express");
const { ObjectId } = require("mongodb");
const { v2: cloudinary } = require("cloudinary");

const { releaseStock, releaseSlot } = require("./orderRoutes");
const { PAYMENT } = require("./shopConfig");

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

// An order can be prepared and delivered once the money is received
// ("Paid") or promised in cash ("COD").
const READY_FOR_FULFILLMENT = ["Paid", "COD"];

// Cash is collected at hand-over, so only from these statuses.
const CASH_COLLECTION_STATUSES = [
    "Out for delivery",
    "Delivered",
    "Ready",
    "Completed",
];

// An order that reached one of these can no longer be cancelled here.
// Only these orders can be deleted.
const FINAL_STATUSES = ["Cancelled", "Delivered", "Completed"];

// Removes a private payment screenshot from Cloudinary.
// A failure here is only logged, because the order is already handled.
async function deleteProofImage(publicId) {
    try {
        await cloudinary.uploader.destroy(publicId, {
            resource_type: "image",
            type: "authenticated",
        });
    } catch (error) {
        console.error("Could not delete payment screenshot:", error.message);
    }
}

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

    // ADMIN: show the payment screenshot of an order.
    // The browser cannot open the private image itself, so the server
    // fetches it with a signed link and passes it on to the admin only.
    router.get("/api/admin/orders/:id/proof", requireAdmin, async (req, res) => {
        try {
            const { id } = req.params;

            if (!OBJECT_ID_PATTERN.test(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid order ID.",
                });
            }

            const order = await getDb()
                .collection("orders")
                .findOne({ _id: new ObjectId(id) });

            const publicId = order?.manualPayment?.proofPublicId;

            if (!publicId) {
                return res.status(404).json({
                    success: false,
                    message: "This order has no payment screenshot.",
                });
            }

            if (typeof fetch !== "function") {
                console.error(
                    "Viewing screenshots needs Node.js 18 or newer. Run: node -v"
                );

                return res.status(500).json({
                    success: false,
                    message: "The server cannot load screenshots yet.",
                });
            }

            const signedUrl = cloudinary.url(publicId, {
                resource_type: "image",
                type: "authenticated",
                sign_url: true,
                secure: true,
            });

            const upstream = await fetch(signedUrl);

            if (!upstream.ok) {
                return res.status(502).json({
                    success: false,
                    message: "Could not load the screenshot.",
                });
            }

            const contentType = upstream.headers.get("content-type") || "";
            const buffer = Buffer.from(await upstream.arrayBuffer());

            res.set({
                "Content-Type": contentType.startsWith("image/")
                    ? contentType
                    : "image/jpeg",
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            });

            return res.send(buffer);
        } catch (error) {
            console.error("Load payment screenshot failed:", error.message);

            return res.status(500).json({
                success: false,
                message: "Could not load the screenshot.",
            });
        }
    });

    // ADMIN: approve or reject a UPI screenshot, or record cash collected.
    // Body: { action: "approve" | "reject" | "cod_collected", reason? }
    router.post(
        "/api/admin/orders/:id/payment",
        requireAdmin,
        async (req, res) => {
            try {
                const { id } = req.params;
                const action = req.body?.action;

                if (!OBJECT_ID_PATTERN.test(id)) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid order ID.",
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

                const now = new Date();
                const stale = {
                    success: false,
                    message:
                        "This order was just changed. Please refresh the list and try again.",
                };

                // ---- Approve: the money is in the bank ----
                if (action === "approve") {
                    const result = await orders.updateOne(
                        {
                            _id: order._id,
                            paymentMethod: "UPI_SCREENSHOT",
                            status: "Pending",
                            paymentStatus: "Under review",
                            stockReserved: true,
                        },
                        {
                            $set: {
                                paymentStatus: "Paid",
                                status: "Confirmed",
                                paidAt: now,
                                "manualPayment.verifiedAt": now,
                                "manualPayment.verifiedBy": req.admin?.username || "admin",
                                updatedAt: now,
                            },
                        }
                    );

                    if (result.modifiedCount !== 1) {
                        return res.status(409).json(stale);
                    }

                    return res.json({
                        success: true,
                        message: "Payment approved. The order is confirmed.",
                    });
                }

                // ---- Reject: the payment could not be found ----
                if (action === "reject") {
                    const reason =
                        typeof req.body?.reason === "string"
                            ? req.body.reason.trim()
                            : "";

                    if (reason.length < 3 || reason.length > 200) {
                        return res.status(400).json({
                            success: false,
                            message:
                                "Give a short reason (3 to 200 characters) so the customer knows what to fix.",
                        });
                    }

                    if (!order.manualPayment?.proofPublicId) {
                        return res.status(409).json(stale);
                    }

                    // The customer gets a fresh time window to upload again.
                    const dueAt = new Date(
                        Date.now() + PAYMENT.upiScreenshot.payWithinMinutes * 60 * 1000
                    );

                    const result = await orders.updateOne(
                        {
                            _id: order._id,
                            paymentMethod: "UPI_SCREENSHOT",
                            status: "Pending",
                            paymentStatus: "Under review",
                            "manualPayment.proofPublicId": order.manualPayment.proofPublicId,
                            stockReserved: true,
                        },
                        {
                            $set: {
                                paymentStatus: "Pending",
                                paymentDueAt: dueAt,
                                paymentRejection: { reason, at: now },
                                updatedAt: now,
                            },
                            // Keep a record of the rejected screenshot.
                            $push: {
                                rejectedPayments: {
                                    ...order.manualPayment,
                                    rejectedAt: now,
                                    rejectedReason: reason,
                                },
                            },
                            $unset: { manualPayment: "" },
                        }
                    );

                    if (result.modifiedCount !== 1) {
                        return res.status(409).json(stale);
                    }

                    return res.json({
                        success: true,
                        message:
                            "Payment rejected. The customer can upload a new screenshot until the time limit ends.",
                    });
                }

                // ---- Cash collected ----
                if (action === "cod_collected") {
                    if (!CASH_COLLECTION_STATUSES.includes(order.status)) {
                        return res.status(409).json({
                            success: false,
                            message:
                                "Mark cash as collected only once the order is out for delivery, ready, or finished.",
                        });
                    }

                    const result = await orders.updateOne(
                        {
                            _id: order._id,
                            paymentMethod: "COD",
                            paymentStatus: "COD",
                            status: order.status,
                        },
                        {
                            $set: {
                                paymentStatus: "Paid",
                                paidAt: now,
                                cashCollectedAt: now,
                                updatedAt: now,
                            },
                        }
                    );

                    if (result.modifiedCount !== 1) {
                        return res.status(409).json(stale);
                    }

                    return res.json({
                        success: true,
                        message: "Cash payment recorded.",
                    });
                }

                return res.status(400).json({
                    success: false,
                    message: "Unknown payment action.",
                });
            } catch (error) {
                console.error("Admin payment action failed:", error.message);

                return res.status(500).json({
                    success: false,
                    message: "Unable to update the payment.",
                });
            }
        }
    );

    // ADMIN: cancel an order and give its stock and time slot back.
    // Body: { reason }
    router.post(
        "/api/admin/orders/:id/cancel",
        requireAdmin,
        async (req, res) => {
            try {
                const { id } = req.params;
                const reason =
                    typeof req.body?.reason === "string"
                        ? req.body.reason.trim()
                        : "";

                if (!OBJECT_ID_PATTERN.test(id)) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid order ID.",
                    });
                }

                if (reason.length < 3 || reason.length > 200) {
                    return res.status(400).json({
                        success: false,
                        message: "Give a short reason (3 to 200 characters).",
                    });
                }

                const db = getDb();
                const orders = db.collection("orders");
                const order = await orders.findOne({ _id: new ObjectId(id) });

                if (!order) {
                    return res.status(404).json({
                        success: false,
                        message: "Order not found.",
                    });
                }

                if (FINAL_STATUSES.includes(order.status)) {
                    return res.status(409).json({
                        success: false,
                        message: `A "${order.status}" order cannot be cancelled.`,
                    });
                }

                // Money may already have been received for these.
                const refundDue = ["Paid", "Under review"].includes(
                    order.paymentStatus
                );

                const now = new Date();

                // The filter repeats what we just read, so two admins (or the
                // expiry job) cannot cancel and release the stock twice.
                const claimed = await orders.updateOne(
                    {
                        _id: order._id,
                        status: order.status,
                        paymentStatus: order.paymentStatus,
                        stockReserved: true,
                    },
                    {
                        $set: {
                            status: "Cancelled",
                            paymentStatus: ["Pending", "COD"].includes(
                                order.paymentStatus
                            )
                                ? "Cancelled"
                                : order.paymentStatus,
                            stockReserved: false,
                            refundDue,
                            cancelledAt: now,
                            cancelReason: reason,
                            cancelledBy: req.admin?.username || "admin",
                            updatedAt: now,
                        },
                    }
                );

                if (claimed.modifiedCount !== 1) {
                    return res.status(409).json({
                        success: false,
                        message:
                            "This order was just changed. Please refresh the list and try again.",
                    });
                }

                // Give the stock and the time slot back.
                try {
                    if (Array.isArray(order.items)) {
                        await releaseStock(db, order.items);
                    }

                    if (order.slot?.id && order.scheduledDate) {
                        await releaseSlot(
                            db,
                            order.scheduledDate,
                            order.slot.id,
                            order.fulfillmentMethod
                        );
                    }
                } catch (releaseError) {
                    console.error(
                        `Could not release stock or slot for cancelled order ${order._id}:`,
                        releaseError.message
                    );
                }

                return res.json({
                    success: true,
                    refundDue,
                    message: refundDue
                        ? "Order cancelled. Remember to refund the customer."
                        : "Order cancelled.",
                });
            } catch (error) {
                console.error("Cancel order failed:", error.message);

                return res.status(500).json({
                    success: false,
                    message: "Unable to cancel the order.",
                });
            }
        }
    );

    // ADMIN: move a paid (or cash) order to its next fulfillment status.
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

                if (!READY_FOR_FULFILLMENT.includes(order.paymentStatus)) {
                    return res.status(409).json({
                        success: false,
                        message:
                            "Only paid or cash-on-delivery orders can be moved through fulfillment.",
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
                        paymentStatus: order.paymentStatus,
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

    // ADMIN: delete a finished order for good.
    // Only Cancelled, Delivered and Completed orders can be deleted.
    // Body: { confirmRefunded } (must be true when a refund is marked as due)
    router.delete("/api/admin/orders/:id", requireAdmin, async (req, res) => {
        try {
            const { id } = req.params;

            if (!OBJECT_ID_PATTERN.test(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid order ID.",
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

            if (!FINAL_STATUSES.includes(order.status)) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Only cancelled, delivered or completed orders can be deleted. Cancel an active order first.",
                });
            }

            if (order.refundDue === true && req.body?.confirmRefunded !== true) {
                return res.status(409).json({
                    success: false,
                    message:
                        "A refund is marked as due for this order. Delete it only after you have refunded the customer.",
                });
            }

            // The filter repeats the status we read, so this only deletes
            // if nothing changed in the meantime. Stock is not touched here:
            // a cancelled order already gave its stock back, and a delivered
            // order's stock was really sold.
            const result = await orders.deleteOne({
                _id: order._id,
                status: order.status,
            });

            if (result.deletedCount !== 1) {
                return res.status(409).json({
                    success: false,
                    message:
                        "This order was just changed. Please refresh the list and try again.",
                });
            }

            // The order is gone, so remove its private screenshots too.
            const publicIds = [
                order.manualPayment?.proofPublicId,
                ...(Array.isArray(order.rejectedPayments)
                    ? order.rejectedPayments.map((payment) => payment?.proofPublicId)
                    : []),
            ].filter(Boolean);

            for (const publicId of publicIds) {
                await deleteProofImage(publicId);
            }

            return res.json({
                success: true,
                message: "Order deleted.",
            });
        } catch (error) {
            console.error("Delete order failed:", error.message);

            return res.status(500).json({
                success: false,
                message: "Unable to delete the order.",
            });
        }
    });

    return router;
}

module.exports = createAdminOrderRoutes;