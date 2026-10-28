// ---------------------------------------------------------------
// paymentRoutes.js
// Razorpay UPI payments.
// The browser never decides whether an order is paid. Only this
// file does, after checking Razorpay's signature on the server.
// ---------------------------------------------------------------

const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const { ObjectId } = require("mongodb");

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

// True when the value is a non-empty string of a sensible length.
function isShortText(value) {
    return typeof value === "string" && value.length > 0 && value.length <= 200;
}

function createPaymentRoutes({ getDb, requireCustomer }) {
    const router = express.Router();

    // The keys are read HERE, inside the function, and not at the top of
    // the file. In server.js the .env file is loaded after the require
    // lines, so a top-of-file read would find the keys empty.
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    let razorpay = null;

    if (keyId && keySecret) {
        razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

        // Test keys start with "rzp_test_". This line shows which mode is on.
        console.log(
            `Razorpay ready in ${keyId.startsWith("rzp_test_") ? "TEST" : "LIVE"} mode.`
        );
    } else {
        console.warn("Razorpay keys are missing. Payment routes are switched off.");
    }

    // Runs before each payment route. Stops the request if keys are missing.
    function paymentsReady(req, res, next) {
        if (!razorpay) {
            return res.status(503).json({
                success: false,
                message: "Online payment is not available right now.",
            });
        }
        next();
    }

    // CUSTOMER: start a payment for an order that is already saved.
    // The browser sends only the order id. The amount comes from MongoDB.
    router.post(
        "/api/payments/create-order",
        requireCustomer,
        paymentsReady,
        async (req, res) => {
            try {
                const { orderId } = req.body || {};

                if (typeof orderId !== "string" || !OBJECT_ID_PATTERN.test(orderId)) {
                    return res.status(400).json({
                        success: false,
                        message: "A valid order is required.",
                    });
                }

                const orders = getDb().collection("orders");

                // "customerId" in the filter means you can only pay your own orders.
                const order = await orders.findOne({
                    _id: new ObjectId(orderId),
                    customerId: req.customerId,
                });

                if (!order) {
                    return res.status(404).json({
                        success: false,
                        message: "Order not found.",
                    });
                }

                if (order.paymentStatus === "Paid") {
                    return res.status(409).json({
                        success: false,
                        message: "This order is already paid.",
                    });
                }

                if (order.status === "Cancelled") {
                    return res.status(409).json({
                        success: false,
                        message: "This order was cancelled.",
                    });
                }

                // Razorpay wants the amount in paise (1 rupee = 100 paise).
                const amount = Math.round(Number(order.bill?.total) * 100);

                if (!Number.isInteger(amount) || amount <= 0) {
                    return res.status(500).json({
                        success: false,
                        message: "This order has an invalid amount.",
                    });
                }

                // If a Razorpay order was already made for this order (for
                // example the customer retried), reuse it.
                let razorpayOrderId = order.razorpayOrderId;

                if (!razorpayOrderId) {
                    const created = await razorpay.orders.create({
                        amount,
                        currency: "INR",
                        receipt: String(order._id),
                        notes: { orderId: String(order._id) },
                    });

                    razorpayOrderId = created.id;

                    // Save it, but only if nobody saved one a moment ago.
                    const saved = await orders.updateOne(
                        { _id: order._id, razorpayOrderId: { $exists: false } },
                        { $set: { razorpayOrderId, updatedAt: new Date() } }
                    );

                    if (saved.modifiedCount === 0) {
                        const fresh = await orders.findOne({ _id: order._id });
                        razorpayOrderId = fresh?.razorpayOrderId || razorpayOrderId;
                    }
                }

                return res.json({
                    success: true,
                    keyId, // the public key id is safe to send to the browser
                    razorpayOrderId,
                    amount,
                    currency: "INR",
                    orderId: order._id,
                });
            } catch (error) {
                console.error(
                    "Create payment failed:",
                    error?.error?.description || error.message
                );

                return res.status(500).json({
                    success: false,
                    message: "Unable to start the payment. Please try again.",
                });
            }
        }
    );

    // CUSTOMER: after paying, the browser sends what Razorpay gave it.
    // We check the signature here. Only a valid signature marks the order Paid.
    router.post(
        "/api/payments/verify",
        requireCustomer,
        paymentsReady,
        async (req, res) => {
            try {
                const {
                    orderId,
                    razorpay_order_id,
                    razorpay_payment_id,
                    razorpay_signature,
                } = req.body || {};

                if (
                    typeof orderId !== "string" ||
                    !OBJECT_ID_PATTERN.test(orderId) ||
                    !isShortText(razorpay_order_id) ||
                    !isShortText(razorpay_payment_id) ||
                    !isShortText(razorpay_signature)
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "Payment details are missing or invalid.",
                    });
                }

                const orders = getDb().collection("orders");

                const order = await orders.findOne({
                    _id: new ObjectId(orderId),
                    customerId: req.customerId,
                });

                if (!order) {
                    return res.status(404).json({
                        success: false,
                        message: "Order not found.",
                    });
                }

                // The Razorpay order must be the one we made for THIS order.
                if (!order.razorpayOrderId || order.razorpayOrderId !== razorpay_order_id) {
                    return res.status(400).json({
                        success: false,
                        message: "This payment does not belong to this order.",
                    });
                }

                // Customer clicked twice, or it was already confirmed: still success.
                if (order.paymentStatus === "Paid") {
                    if (order.razorpayPaymentId === razorpay_payment_id) {
                        return res.json({
                            success: true,
                            message: "Payment already confirmed.",
                        });
                    }

                    return res.status(409).json({
                        success: false,
                        message: "This order is already paid.",
                    });
                }

                // Razorpay signs "order_id|payment_id" with your secret key.
                // We make the same signature and compare the two.
                const expected = crypto
                    .createHmac("sha256", keySecret)
                    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
                    .digest("hex");

                const given = Buffer.from(razorpay_signature, "utf8");
                const wanted = Buffer.from(expected, "utf8");

                // timingSafeEqual needs equal lengths, so check that first.
                const signatureIsValid =
                    given.length === wanted.length &&
                    crypto.timingSafeEqual(given, wanted);

                if (!signatureIsValid) {
                    return res.status(400).json({
                        success: false,
                        message: "We could not verify this payment.",
                    });
                }

                // Mark paid. The filter means this only works while the order
                // is still Pending and unpaid.
                const result = await orders.updateOne(
                    { _id: order._id, paymentStatus: "Pending", status: "Pending" },
                    {
                        $set: {
                            paymentStatus: "Paid",
                            status: "Confirmed",
                            razorpayPaymentId: razorpay_payment_id,
                            paidAt: new Date(),
                            updatedAt: new Date(),
                        },
                    }
                );

                if (result.modifiedCount === 0) {
                    const fresh = await orders.findOne({ _id: order._id });

                    if (fresh?.paymentStatus === "Paid") {
                        return res.json({
                            success: true,
                            message: "Payment already confirmed.",
                        });
                    }

                    // A valid payment arrived for an order that can no longer
                    // take it (for example it was cancelled). Log it so the
                    // money can be refunded.
                    console.error(
                        `PAID BUT NOT CONFIRMED: order ${order._id}, payment ${razorpay_payment_id}`
                    );

                    return res.status(409).json({
                        success: false,
                        message:
                            "Your payment was received but the order could not be confirmed. Please contact us.",
                    });
                }

                return res.json({
                    success: true,
                    message: "Payment successful. Your order is confirmed.",
                });
            } catch (error) {
                console.error("Verify payment failed:", error.message);

                return res.status(500).json({
                    success: false,
                    message: "Unable to verify the payment right now.",
                });
            }
        }
    );

    return router;
}

module.exports = createPaymentRoutes;