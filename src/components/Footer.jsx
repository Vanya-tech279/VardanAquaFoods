import { useEffect, useState } from "react";
import { Fish, Mail, MapPin, Phone, X } from "lucide-react";

/* ------------------------------------------------------------------
   BUSINESS DETAILS: fill these in once, they are used on every page.
------------------------------------------------------------------ */

const BUSINESS = {
  name: "VARDAN AQUA FOODS",
  email: "vardanaquafoods@gmail.com",
  // TODO: put your real, active support number here (Razorpay asks for it).
  phone: "+91 9381824979",
  phoneHref: "tel:+919381824979",
  supportHours: "Every day, 6:00 AM to 8:00 PM",
  // How long after delivery a customer can report a problem.
  complaintWindowHours: 2,
  // How many working days a refund takes to reach the customer.
  refundDays: "5 to 7",
  lastUpdated: "28 October 2026",
};

/* ------------------------------------------------------------------
   PAGE CONTENT
   Each page is a title plus sections. A section has a heading and
   paragraphs. Items starting with "• " are shown as a list.
------------------------------------------------------------------ */

function buildPages(config) {
  const shop = config?.shop || {};
  const address = `${shop.name || BUSINESS.name}, ${shop.address || ""}, ${
    shop.pinCode || ""
  }`;
  const radius = config?.maxRadiusKm ?? 6;
  const unpaidMinutes = config?.unpaidOrderMinutes ?? 15;
  const slots = config?.slots || [];
  const slotRange = slots.length
    ? `${slots[0].label.split("–")[0]} to ${
        slots[slots.length - 1].label.split("–")[1]
      }`
    : "6:30 AM to 11:30 AM";
  const tiers = (config?.feeTiers || [])
    .map((tier, index, all) => {
      const from = index === 0 ? 0 : all[index - 1].upToKm;
      return `• ${from} to ${tier.upToKm} km: ₹${tier.fee} delivery fee`;
    });

  return {
    about: {
      title: "About us",
      sections: [
        {
          heading: "",
          body: [
            `${BUSINESS.name} is a seafood shop in Visakhapatnam. We sell alive fish, chilled fish, crabs, prawns, special meat, dried seafood and fresh Godavari fish.`,
            "We work on pre-orders. You choose your seafood today, pick a morning slot for tomorrow, and we prepare your order fresh for that slot.",
            "You can have it delivered to your door, or collect it from our shop.",
          ],
        },
        {
          heading: "Why we take pre-orders",
          body: [
            "Pre-orders let us buy and clean only what customers have asked for. That keeps the catch fresh and keeps waste low.",
          ],
        },
        {
          heading: "Visit us",
          body: [address],
        },
      ],
    },

    contact: {
      title: "Contact us",
      sections: [
        {
          heading: "Get in touch",
          body: [
            `Email: ${BUSINESS.email}`,
            `Phone: ${BUSINESS.phone}`,
            `Support hours: ${BUSINESS.supportHours}`,
          ],
        },
        {
          heading: "Our address",
          body: [address],
        },
        {
          heading: "When you write to us",
          body: [
            "Please include your order number (the 6 letters shown on your order) and the phone number you used. This helps us find your order quickly.",
            "We reply to emails within 1 working day.",
          ],
        },
      ],
    },

    terms: {
      title: "Terms of service",
      sections: [
        {
          heading: "About these terms",
          body: [
            `These terms apply when you use the ${BUSINESS.name} website and place an order with us. By placing an order, you agree to them.`,
          ],
        },
        {
          heading: "Your account",
          body: [
            "You must give correct name, phone and address details. You are responsible for activity on your account, so keep your sign-in details private.",
          ],
        },
        {
          heading: "Orders and prices",
          body: [
            "All orders are pre-orders for the next day. Prices are per kg and are shown in Indian rupees. The final bill, including any delivery fee, is shown at checkout before you pay.",
            "Stock is limited and changes through the day. We may change prices or remove an item if stock runs out or a price was shown by mistake. If this affects a paid order, we will contact you or refund you in full.",
            "Weights are approximate for whole fish, crabs and similar items. The final weight can differ slightly from what you ordered.",
          ],
        },
        {
          heading: "Payment",
          body: [
            "Payment is made online by UPI through Razorpay. We do not see or store your UPI PIN or bank details.",
            `Your order is confirmed only after payment succeeds. Unpaid orders are cancelled automatically after ${unpaidMinutes} minutes.`,
          ],
        },
        {
          heading: "Delivery and pickup",
          body: [
            "Delivery and takeaway are covered in our Shipping & delivery page. Refunds are covered in our Refunds & returns page. Both form part of these terms.",
          ],
        },
        {
          heading: "Your responsibilities",
          body: [
            "Be available at the address or shop during your chosen slot.",
            "Store seafood in a refrigerator or on ice as soon as you receive it.",
            "Do not misuse the site, try to break into it, or place false orders.",
          ],
        },
        {
          heading: "Our liability",
          body: [
            "We take care to supply fresh, safe seafood. Our liability for any order is limited to the amount you paid for it. We are not liable for delays caused by things outside our control, such as bad weather, road closures or strikes.",
          ],
        },
        {
          heading: "Governing law",
          body: [
            "These terms follow the laws of India. Any dispute will be handled by the courts at Visakhapatnam, Andhra Pradesh.",
          ],
        },
        {
          heading: "Changes",
          body: [
            "We may update these terms. The date at the top of this page shows the latest version. Orders are covered by the terms in force when you placed them.",
          ],
        },
      ],
    },

    privacy: {
      title: "Privacy policy",
      sections: [
        {
          heading: "What we collect",
          body: [
            "• Your name, email and phone number when you create an account.",
            "• Your delivery addresses and their map location, so we can check delivery distance.",
            "• Your orders, cart and payment status.",
            "• Your device location, only if you allow it, to check whether we deliver to you.",
          ],
        },
        {
          heading: "How we use it",
          body: [
            "• To take, prepare, deliver and confirm your orders.",
            "• To tell you about your order or help with a problem.",
            "• To keep the site secure and prevent fraud.",
          ],
        },
        {
          heading: "Payments",
          body: [
            "Payments are processed by Razorpay. They handle your UPI details under their own privacy policy. We only receive the payment status and a payment reference.",
          ],
        },
        {
          heading: "Sharing",
          body: [
            "We do not sell your data. We share it only with service providers who help us run the business (such as the payment provider and hosting), and when the law requires it.",
          ],
        },
        {
          heading: "Your choices",
          body: [
            "You can edit or delete your saved addresses from My addresses. To correct or delete your account data, email us at " +
              BUSINESS.email +
              ".",
            "You can switch off location access in your browser settings at any time. You can still order, but we may not be able to check delivery distance automatically.",
          ],
        },
        {
          heading: "Storage on your device",
          body: [
            "We keep your sign-in and cart in your browser so you stay signed in and your cart is not lost. Logging out clears them.",
          ],
        },
        {
          heading: "Security and retention",
          body: [
            "We protect your data with reasonable security measures. We keep order records for as long as needed for accounts, tax and legal reasons.",
          ],
        },
      ],
    },

    shipping: {
      title: "Shipping & delivery",
      sections: [
        {
          heading: "How it works",
          body: [
            "Every order is a pre-order. Orders placed today are delivered or ready for pickup tomorrow, in the time slot you choose.",
            `Slots run from ${slotRange}. Slots can fill up, and full slots cannot be selected.`,
          ],
        },
        {
          heading: "Doorstep delivery",
          body: [
            `We deliver within ${radius} km of our shop. Your address must have a saved location so we can check the distance.`,
            ...tiers,
            "A doorstep service charge may also apply. The exact amount is shown in your bill before you pay.",
            "We do not use outside couriers. Our own team delivers your order, so there are no long courier delays.",
          ],
        },
        {
          heading: "Takeaway",
          body: [
            `Collect your order from ${address} in your chosen slot. There is no delivery fee. Show your order number when you collect.`,
          ],
        },
        {
          heading: "Handling",
          body: [
            "Seafood is cleaned, packed and kept cold until it leaves our shop. Please keep it chilled and cook it the same day, or freeze it.",
          ],
        },
        {
          heading: "If you are not available",
          body: [
            "Our delivery partner will call you on arrival. If we cannot reach you or deliver within your slot, please contact us immediately. Because seafood is perishable, we may not be able to redeliver.",
          ],
        },
        {
          heading: "Delays",
          body: [
            "Rain, traffic or road closures can sometimes delay delivery. We will call you if your order is going to be late.",
          ],
        },
      ],
    },

    refunds: {
      title: "Refunds & returns",
      sections: [
        {
          heading: "Returns",
          body: [
            "Seafood is perishable, so we cannot take back items once they are delivered or collected. We replace or refund items that have a problem, as set out below.",
          ],
        },
        {
          heading: "When you can ask for a refund or replacement",
          body: [
            "• The item is spoiled, smells bad or is not fresh.",
            "• The item is wrong, missing, or much lighter than ordered.",
            "• The item was damaged during delivery.",
          ],
        },
        {
          heading: "How to report a problem",
          body: [
            `Contact us within ${BUSINESS.complaintWindowHours} hours of delivery or pickup. Email ${BUSINESS.email} or call ${BUSINESS.phone} with your order number and clear photos of the item and packing.`,
            "Please keep the item chilled and do not cook or discard it until we reply. Reports made after the time limit cannot be accepted, because freshness cannot be checked.",
          ],
        },
        {
          heading: "What we will do",
          body: [
            "After we check your report, we will either send a replacement in a later slot or refund the affected items, whichever you prefer where stock allows.",
            "We do not refund for changes of mind, wrong cooking, or taste preferences.",
          ],
        },
        {
          heading: "Cancellations",
          body: [
            `Unpaid orders are cancelled automatically after ${unpaidMinutes} minutes. To cancel a paid order, contact us as early as possible before it is prepared. Orders already prepared for your slot cannot be cancelled.`,
            "If we cancel your order (for example, stock ran out or we cannot deliver), you get a full refund.",
          ],
        },
        {
          heading: "Refund timeline",
          body: [
            `Approved refunds are sent to your original payment method (the UPI account you paid from). They usually reach you in ${BUSINESS.refundDays} working days after approval. If it takes longer, email us and we will help you track it.`,
          ],
        },
      ],
    },
  };
}

/* ------------------------------------------------------------------
   POLICY WINDOW
------------------------------------------------------------------ */

function PolicyModal({ page, onClose }) {
  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-brand-900/60 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={page.title}
      onClick={onClose}
    >
      <div
        className="animate-fadeIn flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-brand-100 p-5 sm:px-8">
          <div>
            <h2 className="font-display text-2xl font-extrabold text-brand-900">
              {page.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Last updated {BUSINESS.lastUpdated}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-slate-500 transition hover:bg-brand-50 hover:text-brand-900"
          >
            <X size={22} />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-5 sm:px-8 sm:py-6">
          {page.sections.map((section, index) => {
            const lines = section.body;
            const bullets = lines.filter((line) => line.startsWith("• "));
            const paragraphs = lines.filter((line) => !line.startsWith("• "));

            return (
              <section key={`${section.heading}-${index}`}>
                {section.heading && (
                  <h3 className="font-display text-lg font-bold text-brand-900">
                    {section.heading}
                  </h3>
                )}

                <div className={section.heading ? "mt-2 space-y-2" : "space-y-2"}>
                  {paragraphs.map((line, i) => (
                    <p key={i} className="text-sm leading-6 text-slate-600">
                      {line}
                    </p>
                  ))}

                  {bullets.length > 0 && (
                    <ul className="space-y-1.5">
                      {bullets.map((line, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2.5 text-sm leading-6 text-slate-600"
                        >
                          <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                          <span>{line.slice(2)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <div className="border-t border-brand-100 bg-brand-50/60 px-5 py-4 text-sm text-slate-600 sm:px-8">
          Questions? Email{" "}
          <a
            href={`mailto:${BUSINESS.email}`}
            className="font-semibold text-brand-700 hover:underline"
          >
            {BUSINESS.email}
          </a>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   FOOTER
------------------------------------------------------------------ */

function FooterLink({ onClick, children }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="text-left text-sm text-brand-100 transition hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300"
      >
        {children}
      </button>
    </li>
  );
}

export default function Footer({ config }) {
  const [openPage, setOpenPage] = useState(null);
  const pages = buildPages(config);
  const shop = config?.shop || {};

  return (
    <>
      <footer className="relative z-10 bg-brand-900 px-4 pb-8 pt-12 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.4fr]">
          {/* Brand and short about */}
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white">
                <Fish size={24} />
              </span>
              <div>
                <p className="font-display text-lg font-extrabold tracking-tight">
                  {BUSINESS.name}
                </p>
                <p className="text-xs text-brand-200">Freshness from the sea</p>
              </div>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-6 text-brand-100">
              Pre-order today and get fresh seafood tomorrow, delivered to your
              door or ready for pickup at our shop.
            </p>
          </div>

          {/* Company */}
          <nav aria-label="Company">
            <h3 className="font-display text-base font-bold">Company</h3>
            <ul className="mt-4 space-y-3">
              <FooterLink onClick={() => setOpenPage("about")}>
                About us
              </FooterLink>
              <FooterLink onClick={() => setOpenPage("contact")}>
                Contact us
              </FooterLink>
            </ul>
          </nav>

          {/* Policies */}
          <nav aria-label="Policies">
            <h3 className="font-display text-base font-bold">Policies</h3>
            <ul className="mt-4 space-y-3">
              <FooterLink onClick={() => setOpenPage("terms")}>
                Terms of service
              </FooterLink>
              <FooterLink onClick={() => setOpenPage("privacy")}>
                Privacy policy
              </FooterLink>
              <FooterLink onClick={() => setOpenPage("shipping")}>
                Shipping &amp; delivery
              </FooterLink>
              <FooterLink onClick={() => setOpenPage("refunds")}>
                Refunds &amp; returns
              </FooterLink>
            </ul>
          </nav>

          {/* Contact details */}
          <div>
            <h3 className="font-display text-base font-bold">Reach us</h3>
            <ul className="mt-4 space-y-3 text-sm text-brand-100">
              <li className="flex items-start gap-2.5">
                <Mail size={16} className="mt-0.5 shrink-0 text-brand-300" />
                <a
                  href={`mailto:${BUSINESS.email}`}
                  className="break-all hover:text-white hover:underline"
                >
                  {BUSINESS.email}
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <Phone size={16} className="mt-0.5 shrink-0 text-brand-300" />
                <a
                  href={BUSINESS.phoneHref}
                  className="hover:text-white hover:underline"
                >
                  {BUSINESS.phone}
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <MapPin size={16} className="mt-0.5 shrink-0 text-brand-300" />
                <span>
                  {shop.name || BUSINESS.name}, {shop.address}, {shop.pinCode}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-2 border-t border-white/10 pt-6 text-xs text-brand-200 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {BUSINESS.name}. All rights reserved.
          </p>
          <p>Payments are processed securely by Razorpay.</p>
        </div>
      </footer>

      {openPage && pages[openPage] && (
        <PolicyModal
          page={pages[openPage]}
          onClose={() => setOpenPage(null)}
        />
      )}
    </>
  );
}
