// ---------------------------------------------------------------
// manualPaymentRoutes.js
// "Pay by UPI and upload a screenshot".
//
// The customer pays to the shop's UPI ID, then uploads a screenshot
// of the payment. That is all. The order then waits for the admin to
// check it against the bank app and approve it. Nothing here marks an
// order as paid.
//
// Screenshots show names and UPI IDs, so they are stored as
// PRIVATE ("authenticated") images. Only the admin routes can show them.
// ---------------------------------------------------------------

const express = require("express");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const { ObjectId } = require("mongodb");

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const MAX_PROOF_BYTES = 5 * 1024 * 1024; // 5 MB

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PROOF_BYTES, files: 1 },
});

// Looks at the first bytes of the file. The "type" the browser reports
// can be faked, but the real file header cannot.
function detectImageType(buffer) {
    if (
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
    ) {
        return "jpeg";
    }

    if (
        buffer.length >= 8 &&
        buffer
            .subarray(0, 8)
            .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
        return "png";
    }

    if (
        buffer.length >= 12 &&
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
        return "webp";
    }

    return null;
}

// Sends the screenshot to Cloudinary as a private image.
function uploadProof(buffer) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "vardan-aqua-foods/payment-proofs",
                resource_type: "image",
                type: "authenticated", // not viewable without a signed link
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );

        stream.end(buffer);
    });
}

async function deleteProof(publicId) {
    try {
        await cloudinary.uploader.destroy(publicId, {
            resource_type: "image",
            type: "authenticated",
        });
    } catch (error) {
        console.error("Could not delete payment screenshot:", error.message);
    }
}

// Runs multer and turns its errors into friendly messages.
function readScreenshot(req, res, next) {
    upload.single("screenshot")(req, res, (error) => {
        if (error) {
            return res.status(400).json({
                success: false,
                message:
                    error.code === "LIMIT_FILE_SIZE"
                        ? "The screenshot must be smaller than 5 MB."
                        : "We could not read your upload. Please try again.",
            });
        }

        next();
    });
}

function createManualPaymentRoutes({ getDb, requireCustomer }) {
    const router = express.Router();

    // CUSTOMER: send the payment screenshot for an order.
    router.post(
        "/api/payments/manual/proof",
        requireCustomer,
        readScreenshot,
        async (req, res) => {
            let uploadedPublicId = null;

            try {
                const orderId = req.body?.orderId;

                if (typeof orderId !== "string" || !OBJECT_ID_PATTERN.test(orderId)) {
                    return res.status(400).json({
                        success: false,
                        message: "A valid order is required.",
                    });
                }

                if (!req.file) {
                    return res.status(400).json({
                        success: false,
                        message: "Please choose a screenshot of your payment.",
                    });
                }

                if (!detectImageType(req.file.buffer)) {
                    return res.status(400).json({
                        success: false,
                        message: "Only JPG, PNG or WebP screenshots are allowed.",
                    });
                }

                const orders = getDb().collection("orders");

                // "customerId" in the filter means you can only use your own order.
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

                if (order.paymentMethod !== "UPI_SCREENSHOT") {
                    return res.status(400).json({
                        success: false,
                        message: "This order is not paid by UPI screenshot.",
                    });
                }

                if (order.status === "Cancelled") {
                    return res.status(409).json({
                        success: false,
                        message:
                            "This order was cancelled because payment took too long. Please place a new order.",
                    });
                }

                if (order.paymentStatus === "Under review") {
                    return res.status(409).json({
                        success: false,
                        message:
                            "We already have your payment screenshot and are checking it.",
                    });
                }

                if (order.paymentStatus !== "Pending") {
                    return res.status(409).json({
                        success: false,
                        message: "This order cannot take a payment right now.",
                    });
                }

                // Upload first. If saving then fails, we delete the file again.
                const uploaded = await uploadProof(req.file.buffer);
                uploadedPublicId = uploaded.public_id;

                const now = new Date();

                // Only works while the order is still Pending and unpaid, so it
                // cannot clash with the expiry job or an admin cancel.
                const result = await orders.updateOne(
                    {
                        _id: order._id,
                        customerId: req.customerId,
                        paymentMethod: "UPI_SCREENSHOT",
                        status: "Pending",
                        paymentStatus: "Pending",
                        stockReserved: true,
                    },
                    {
                        $set: {
                            paymentStatus: "Under review",
                            manualPayment: {
                                proofPublicId: uploadedPublicId,
                                amount: order.bill?.total ?? order.totalAmount ?? null,
                                submittedAt: now,
                            },
                            updatedAt: now,
                        },
                    }
                );

                if (result.modifiedCount !== 1) {
                    await deleteProof(uploadedPublicId);
                    uploadedPublicId = null;

                    return res.status(409).json({
                        success: false,
                        message:
                            "This order can no longer accept a payment. If money was taken from your account, please contact us.",
                    });
                }

                return res.json({
                    success: true,
                    message:
                        "Thank you. We received your payment screenshot and will confirm your order after checking it.",
                });
            } catch (error) {
                console.error("Payment screenshot failed:", error.message);

                if (uploadedPublicId) await deleteProof(uploadedPublicId);

                return res.status(500).json({
                    success: false,
                    message: "Unable to save your screenshot. Please try again.",
                });
            }
        }
    );

    return router;
}

module.exports = createManualPaymentRoutes;