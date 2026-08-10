import Link from "next/link";

export const metadata = { title: "Terms of Service — Akoko Solutions" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:py-24">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-brand transition-colors"
      >
        ← Back to home
      </Link>

      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted">Last updated: July 2026</p>

      <div className="mt-10 space-y-8 text-base text-ink/80 leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-ink">1. Agreement</h2>
          <p className="mt-2">
            By placing an order on jokasfarms.com you agree to these terms. If you do not
            agree, please do not use this site. These terms govern the relationship between
            you (the buyer) and Akoko Solutions (the seller).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ink">2. Products and pricing</h2>
          <p className="mt-2">
            All prices are in Ghana Cedis (GHS) and include applicable taxes. Prices may
            change without notice. We reserve the right to correct pricing errors and
            cancel orders placed at incorrect prices.
          </p>
          <p className="mt-2">
            Product images are illustrative. Actual packaging may differ from images shown.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ink">3. Orders and payment</h2>
          <p className="mt-2">
            Placing an order through this site is a request to buy, not a payment — no
            card or Mobile Money details are collected at checkout. After you submit your
            order, our team will call you on the phone number provided to confirm the
            order, delivery details, and final total. We may decline orders at our
            discretion (e.g., stock unavailability).
          </p>
          <p className="mt-2">
            Payment (by Mobile Money, bank transfer, or cash) is arranged with our team
            during that confirmation call. Orders are held for dispatch only after payment
            is confirmed.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ink">4. Delivery</h2>
          <p className="mt-2">
            Delivery timelines are estimates and not guarantees. We will contact you with
            an estimated delivery window after your order is confirmed. Akoko Solutions is not
            liable for delays caused by third-party couriers, weather, or circumstances
            beyond our control.
          </p>
          <p className="mt-2">
            Risk of loss passes to you upon delivery to the address you provided. Ensure
            someone is available to receive the goods.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ink">5. Returns and refunds</h2>
          <p className="mt-2">
            If you receive damaged or incorrect goods, contact us within 48 hours of
            delivery at{" "}
            <a href="tel:+233505455090" className="text-brand hover:underline">
              +233 50 545 5090
            </a>{" "}
            or{" "}
            <a href="mailto:info@akokosolutionsgh.com" className="text-brand hover:underline">
              info@akokosolutionsgh.com
            </a>
            . We will arrange a replacement or refund at our discretion.
          </p>
          <p className="mt-2">
            We do not accept returns of feed products once the bag has been opened or used,
            for biosecurity and quality-control reasons.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ink">6. Limitation of liability</h2>
          <p className="mt-2">
            Akoko Solutions&apos; total liability to you for any claim arising from an order is
            limited to the amount you paid for that order. We are not liable for
            consequential losses, including livestock losses, income loss, or business
            interruption.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ink">7. Governing law</h2>
          <p className="mt-2">
            These terms are governed by the laws of the Republic of Ghana. Any disputes
            will be resolved in the courts of Ghana.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ink">8. Contact</h2>
          <p className="mt-2">
            Akoko Solutions, Abrepo Road, Kumasi, Ghana.{" "}
            <a href="tel:+233505455090" className="text-brand hover:underline">
              +233 50 545 5090
            </a>
            {" · "}
            <a href="mailto:info@akokosolutionsgh.com" className="text-brand hover:underline">
              info@akokosolutionsgh.com
            </a>
          </p>
        </section>
      </div>

      <div className="mt-12 border-t border-gray-100 pt-8 text-sm text-muted">
        <Link href="/privacy" className="hover:text-brand transition-colors">Privacy Policy</Link>
        <span className="mx-3">·</span>
        <Link href="/contact" className="hover:text-brand transition-colors">Contact us</Link>
      </div>
    </main>
  );
}
