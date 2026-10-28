// ---------------------------------------------------------------
// razorpay.js
// Two small helpers for Razorpay's payment popup (Checkout).
// ---------------------------------------------------------------

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

// TEMPORARY: false = the popup shows every payment method, so we can
// test our own code in test mode. Set it back to true before going live,
// because the shop accepts UPI only.
const UPI_ONLY = false;

// Loads Razorpay's script once. Resolves true when it is ready,
// false when it could not load (for example, no internet).
export function loadRazorpay() {
    if (window.Razorpay) return Promise.resolve(true);

    return new Promise((resolve) => {
        let script = document.querySelector(`script[src="${CHECKOUT_SRC}"]`);

        if (!script) {
            script = document.createElement("script");
            script.src = CHECKOUT_SRC;
            script.async = true;
            document.body.appendChild(script);
        }

        script.addEventListener("load", () => resolve(true));
        script.addEventListener("error", () => {
            // Remove the broken tag so a retry can load it again.
            script.remove();
            resolve(false);
        });
    });
}

// Opens the popup and waits until the customer pays or closes it.
// Resolves with one of:
//   { status: "paid", response }          response has the 3 values to verify
//   { status: "dismissed", lastError }    closed without paying
export function openRazorpayCheckout({
    keyId,
    razorpayOrderId,
    amount,
    currency,
    description,
    prefill,
    themeColor,
}) {
    return new Promise((resolve) => {
        let finished = false;
        let lastError = "";

        // Makes sure we answer only once, even if two events fire.
        function finish(result) {
            if (finished) return;
            finished = true;
            resolve(result);
        }

        const options = {
            key: keyId,
            amount,
            currency,
            order_id: razorpayOrderId,
            name: "VARDAN AQUA FOODS",
            description,
            prefill,
            theme: { color: themeColor },

            // Runs when the payment succeeds.
            handler: (response) => finish({ status: "paid", response }),

            modal: {
                confirm_close: true, // asks "are you sure?" before closing
                ondismiss: () => finish({ status: "dismissed", lastError }),
            },
        };

        // Show only UPI and hide cards, net banking and wallets.
        if (UPI_ONLY) {
            options.config = {
                display: {
                    blocks: {
                        upi: {
                            name: "Pay with UPI",
                            instruments: [{ method: "upi" }],
                        },
                    },
                    sequence: ["block.upi"],
                    preferences: { show_default_blocks: false },
                },
            };
        }

        const checkout = new window.Razorpay(options);

        // A failed try does NOT end things: the customer can retry inside
        // the popup. We only remember the message in case they give up.
        checkout.on("payment.failed", (response) => {
            lastError = response?.error?.description || "The payment failed.";
        });

        checkout.open();
    });
}