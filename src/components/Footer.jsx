import { useEffect, useRef, useState } from "react";
import { Fish, Mail, MapPin, MessageCircle, Phone, X } from "lucide-react";

/* ------------------------------------------------------------------
   BUSINESS DETAILS: fill these in once, they are used on every page.
------------------------------------------------------------------ */

const BUSINESS = {
  name: "VARDAN AQUA FOODS",
  email: "vardanaquafoods@gmail.com",
  phone: "+91 9381824979",
  phoneHref: "tel:+919381824979",

  // The hours when customers can place orders on the website.
  // Please confirm these with the shop owner.
  orderingHours: "6:30 AM to 8:30 PM",

  // Hours when you answer calls and emails, for example "6 AM to 8 PM".
  // Leave "" to hide this line on the Contact page.
  supportHours: "",

  // How long after delivery or pickup a customer can report a problem.
  // The owner should confirm this number.
  complaintWindowHours: 1,

  // How many working days a refund takes to reach the customer, for example "2 to 3".
  // Leave "" and the Refunds page will not promise a number.
  refundDays: "",

  // The shop's FSSAI number. Leave "" until you have it.
  // When filled in, it is shown at the bottom of the footer.
  fssai: "",

  // Change this date whenever you edit the policy text.
  lastUpdated: "6 November 2026",
};

// 1 -> "1 hour", 2 -> "2 hours"
function hoursText(count) {
  return `${count} ${count === 1 ? "hour" : "hours"}`;
}

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
  const unpaidMinutes =
    config?.paymentMethods?.upiScreenshot?.payWithinMinutes ?? 30;

  // Mentions the cash limit only when the shop has set one.
  const cod = config?.paymentMethods?.cod;
  const cashLimitNote =
    cod?.enabled && Number(cod.maxOrderTotal) > 0
      ? ` Pay on delivery is available for orders up to ₹${Number(
          cod.maxOrderTotal
        ).toLocaleString("en-IN")}.`
      : "";

  // The shop's WhatsApp number comes from the server (digits with country code).
  const whatsappNumber = config?.whatsappNumber || "";
  const whatsappLine = whatsappNumber
    ? [`WhatsApp: +${whatsappNumber}`]
    : [];

  const tiers = (config?.feeTiers || []).map((tier, index, all) => {
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
            "Order what is in stock on our website and we deliver it in about 1 hour, or you can collect it from our shop.",
            "For special meats and fish that are not in stock, you can pre-book a date that suits you or contact us on WhatsApp.",
          ],
        },
        {
          heading: "Why we keep it fresh",
          body: [
            "We sell from fresh stock and tell you clearly what is available. When something is out of stock or needs to be arranged, we ask for a little notice so we can bring it in fresh instead of selling you something old.",
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
            ...whatsappLine,
            ...(BUSINESS.supportHours
              ? [`Support hours: ${BUSINESS.supportHours}`]
              : []),
          ],
        },
        {
          heading: "Special orders",
          body: [
            "For special meats, fish that are out of stock, or large orders, message us on WhatsApp. We need about 1 to 2 days' notice.",
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
          heading: "How you can order",
          body: [
            `• In-stock items: order on the website between ${BUSINESS.orderingHours}. We deliver in about 1 hour after your order is confirmed, or it is ready for pickup in about 1 hour.`,
            "• Pre-book items: items marked Pre-book can be ordered ahead. You choose the date at checkout, and we deliver or have it ready for pickup on that date. Pre-book items must be ordered separately from in-stock items.",
            "• Special orders: items marked Contact for Special Order, and items that are out of stock, are arranged on WhatsApp and need about 1 to 2 days' notice. They cannot be added to the cart.",
            "The 1-hour time is an estimate and not a guarantee. Traffic, weather and the number of orders can change it.",
          ],
        },
        {
          heading: "Orders and prices",
          body: [
            "Prices are per kg and are shown in Indian rupees. The final bill, including any delivery fee, is shown at checkout before you place your order.",
            "Stock is limited and changes through the day. We may change prices or remove an item if stock runs out or a price was shown by mistake. If this affects a paid order, we will contact you or refund you in full.",
            "Weights are approximate for whole fish, crabs and similar items. The final weight can differ slightly from what you ordered.",
          ],
        },
        {
          heading: "Payment",
          body: [
            "You can pay in one of two ways:",
            "• Pay by UPI: pay to the shop's UPI ID shown at checkout, then upload a screenshot of your payment. We check the payment and then confirm your order.",
            `• Pay on delivery: pay in cash or by UPI when your order arrives, or at the shop when you collect a takeaway order.${cashLimitNote}`,
            `A UPI order is confirmed only after we have checked your payment. If you do not upload your screenshot within ${unpaidMinutes} minutes of placing the order, the order is cancelled automatically and your items go back on sale.`,
            "If we cannot find your payment, we will tell you why, and you can upload again within the time we give you.",
            "We never see or store your UPI PIN or your bank login.",
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
            "Be available at the address, or come to the shop, when your order is ready.",
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
            "• Your name and email when you create an account. If you sign in with Google, we receive your name and email from Google.",
            "• A phone number, for delivery addresses and for takeaway orders.",
            "• Your delivery addresses and their map location, so we can check delivery distance.",
            "• Your orders, cart and payment status.",
            "• The payment screenshot you upload for UPI orders.",
            "• Your device location, only if you allow it, to check whether we deliver to you.",
            "• Messages you send us on WhatsApp, email or phone, if you contact us.",
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
            "For UPI payments you pay the shop directly from your own UPI app, and we never see your UPI PIN. We keep the payment screenshot you upload only to check your payment, and only the shop's administrator can view it.",
          ],
        },
        {
          heading: "Sharing",
          body: [
            "We do not sell your data. We share it only with service providers who help us run the business (such as image storage and website hosting), and when the law requires it.",
          ],
        },
        {
          heading: "Your choices",
          body: [
            `You can edit or delete your saved addresses from My addresses. To correct or delete your account data, email us at ${BUSINESS.email}.`,
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
          heading: "In-stock orders",
          body: [
            `You can order in-stock items on the website between ${BUSINESS.orderingHours}.`,
            "We deliver in about 1 hour after your order is confirmed. A UPI order is confirmed after we check your payment, and a pay-on-delivery order is confirmed straight away.",
            "The 1-hour time is an estimate. Traffic, weather and the number of orders can make it a little longer, and we will call you if there is a big delay.",
          ],
        },
        {
          heading: "Pre-book orders",
          body: [
            "Items marked Pre-book are ordered ahead. You choose the date at checkout, and we deliver or have your order ready for pickup on that date.",
            "Pre-book items must be ordered separately from in-stock items.",
          ],
        },
        {
          heading: "Special orders",
          body: [
            "Special meats and items that are out of stock are arranged on WhatsApp. They need about 1 to 2 days' notice, and we will confirm the price and the day with you.",
          ],
        },
        {
          heading: "Doorstep delivery",
          body: [
            `We deliver within ${radius} km of our shop. Your address must have a saved location so we can check the distance.`,
            ...tiers,
            "A doorstep service charge may also apply. The exact amount is shown in your bill before you place your order.",
            "We do not use outside couriers. Our own team delivers your order, so there are no long courier delays.",
          ],
        },
        {
          heading: "Takeaway",
          body: [
            `Collect your order from ${address}. It is usually ready in about 1 hour after it is confirmed, or on your pre-book date. There is no delivery fee. Show your order number when you collect.`,
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
            "Our delivery person will call you on arrival. If we cannot reach you, please contact us immediately. Because seafood is perishable, we may not be able to redeliver.",
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
            `Contact us within ${hoursText(
              BUSINESS.complaintWindowHours
            )} of delivery or pickup. Email ${BUSINESS.email} or call ${
              BUSINESS.phone
            } with your order number and clear photos of the item and packing.`,
            "Please keep the item chilled and do not cook or discard it until we reply. Reports made after the time limit cannot be accepted, because freshness cannot be checked.",
          ],
        },
        {
          heading: "What we will do",
          body: [
            "After we check your report, we will either send a replacement or refund the affected items, whichever you prefer where stock allows.",
            "We do not refund for changes of mind, wrong cooking, or taste preferences.",
          ],
        },
        {
          heading: "Cancellations",
          body: [
            `A UPI order with no payment screenshot is cancelled automatically after ${unpaidMinutes} minutes. To cancel an order you have already paid for, a pay-on-delivery order, or a pre-book order, contact us as early as possible before we start preparing it. Orders already prepared cannot be cancelled.`,
            "If we cancel your order (for example, stock ran out or we cannot deliver), you get a full refund of anything you have paid.",
          ],
        },
        {
          heading: "Refund timeline",
          body: [
            BUSINESS.refundDays
              ? `Approved refunds are sent by UPI. For a UPI payment, the money goes back to the UPI account you paid from. For an order paid in cash, we send the refund by UPI to the number you give us. Refunds usually reach you in ${BUSINESS.refundDays} working days after approval. If it takes longer, email us and we will help you track it.`
              : "Approved refunds are sent by UPI. For a UPI payment, the money goes back to the UPI account you paid from. For an order paid in cash, we send the refund by UPI to the number you give us. We will tell you when to expect the money, and if it takes longer, email us and we will help you track it.",
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
  // Keep the latest onClose in a ref, so the keyboard listener below is
  // added once and not again every time the page re-renders.
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") closeRef.current();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

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
  const whatsappNumber = config?.whatsappNumber || "";

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
              Fresh seafood delivered in about 1 hour, or ready for pickup at
              our shop. Pre-book for a date you choose, or message us on
              WhatsApp for special orders.
            </p>
            <p className="mt-3 text-xs text-brand-200">
              Order online: {BUSINESS.orderingHours}
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
              {whatsappNumber && (
                <li className="flex items-start gap-2.5">
                  <MessageCircle
                    size={16}
                    className="mt-0.5 shrink-0 text-brand-300"
                  />
                  <a
                    href={`https://wa.me/${whatsappNumber}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white hover:underline"
                  >
                    Special orders on WhatsApp
                  </a>
                </li>
              )}
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
          {BUSINESS.fssai && <p>FSSAI No. {BUSINESS.fssai}</p>}
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