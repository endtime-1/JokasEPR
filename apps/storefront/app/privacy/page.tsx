import Link from "next/link";

export const metadata = { title: "Privacy Policy — Jokas Farms" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:py-24">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-brand transition-colors"
      >
        ← Back to home
      </Link>

      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted">Last updated: July 2026</p>

      <div className="mt-10 space-y-8 text-base text-ink/80 leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-ink">1. Who we are</h2>
          <p className="mt-2">
            Jokas Farms operates this storefront at jokasfarms.com. We produce and sell
            poultry feeds, farm inputs, and related products. Questions about this policy
            can be sent to{" "}
            <a href="mailto:info@jokasfarms.com" className="text-brand hover:underline">
              info@jokasfarms.com
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ink">2. Information we collect</h2>
          <p className="mt-2">When you place an order we collect:</p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>Your full name and phone number</li>
            <li>Delivery address (region, town, street)</li>
            <li>Order details and payment reference</li>
          </ul>
          <p className="mt-2">
            We do not collect payment card details — all card processing is handled by our
            payment provider under their own privacy terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ink">3. How we use your information</h2>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>To process and deliver your order</li>
            <li>To contact you about your order status</li>
            <li>To resolve disputes or handle returns</li>
            <li>To comply with legal and regulatory requirements in Ghana</li>
          </ul>
          <p className="mt-2">We do not sell or share your information with third parties for marketing purposes.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ink">4. Data retention</h2>
          <p className="mt-2">
            We retain order records for a minimum of 5 years to comply with Ghana Revenue
            Authority requirements. You may request deletion of your personal details
            (name, phone, address) by contacting us — we will anonymise your record while
            keeping the transaction for legal compliance.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ink">5. Your rights</h2>
          <p className="mt-2">
            Under the Ghana Data Protection Act 2012 you have the right to access,
            correct, or request deletion of personal data we hold about you. Contact us
            at{" "}
            <a href="mailto:info@jokasfarms.com" className="text-brand hover:underline">
              info@jokasfarms.com
            </a>{" "}
            and we will respond within 14 days.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ink">6. Cookies</h2>
          <p className="mt-2">
            This site stores your shopping cart in your browser&apos;s local storage only.
            We do not use tracking cookies or third-party analytics.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-ink">7. Changes</h2>
          <p className="mt-2">
            We may update this policy from time to time. The &quot;last updated&quot; date at the
            top of this page reflects the most recent revision.
          </p>
        </section>
      </div>

      <div className="mt-12 border-t border-gray-100 pt-8 text-sm text-muted">
        <Link href="/terms" className="hover:text-brand transition-colors">Terms of Service</Link>
        <span className="mx-3">·</span>
        <Link href="/contact" className="hover:text-brand transition-colors">Contact us</Link>
      </div>
    </main>
  );
}
