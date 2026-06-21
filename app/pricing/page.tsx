import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Pricing — Principia Synthesia" };

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: ["3 articles", "1 book", "Public read-only", "Basic animations"],
    cta: "sign-up" as const,
  },
  {
    name: "Pro",
    price: "$9",
    period: "per month",
    features: [
      "Unlimited articles & books",
      "PDF/EPUB export",
      "Custom theme",
      "Animations library",
    ],
    cta: "coming-soon" as const,
  },
  {
    name: "Team",
    price: "$29",
    period: "per month",
    features: [
      "Everything in Pro",
      "Collaboration",
      "Permissions",
      "Audit logs",
      "Priority support",
    ],
    cta: "coming-soon" as const,
  },
] as const;

export default function PricingPage() {
  return (
    <main className="max-w-5xl mx-auto px-5 py-16 sm:py-24">

      {/* ── Header ── */}
      <div className="mb-16">
        <p className="ps-eyebrow mb-4">Pricing</p>
        <h1
          className="ps-hero themed-heading"
          style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}
        >
          Simple,<br />
          <span style={{ color: "var(--accent)" }}>transparent pricing.</span>
        </h1>
      </div>

      <hr className="themed-hr mb-0" />

      {/* ── Tiers ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x themed-border">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className="pt-10 pb-12 flex flex-col gap-0 sm:first:pr-10 sm:[&:nth-child(2)]:px-10 sm:last:pl-10"
          >
            <p className="ps-eyebrow mb-6">{tier.name}</p>

            <div className="flex items-baseline gap-1.5 mb-1">
              <span
                className="ps-display themed-heading"
                style={{ fontSize: "clamp(2rem, 4vw, 2.75rem)" }}
              >
                {tier.price}
              </span>
            </div>
            <p className="themed-muted mb-8" style={{ fontSize: "0.8125rem" }}>
              {tier.period}
            </p>

            <ul className="space-y-3 flex-1 mb-10">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5" style={{ fontSize: "0.875rem" }}>
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 mt-0.5"
                    style={{ color: "var(--accent)" }}
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="themed-secondary">{f}</span>
                </li>
              ))}
            </ul>

            {tier.cta === "sign-up" ? (
              <Link
                href="/signup"
                className="themed-btn-accent rounded-lg justify-center"
                style={{ fontSize: "0.875rem", padding: "0.6rem 1.25rem" }}
              >
                Get started
              </Link>
            ) : (
              <button
                disabled
                className="themed-btn-outline rounded-lg justify-center opacity-50 cursor-not-allowed"
                style={{ fontSize: "0.875rem", padding: "0.6rem 1.25rem" }}
                title="Stripe integration coming soon"
              >
                Coming soon
              </button>
            )}
          </div>
        ))}
      </div>

    </main>
  );
}
