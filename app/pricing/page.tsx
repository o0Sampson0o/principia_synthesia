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
      "PDF / EPUB export",
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
    <main className="flex-1">

      {/* ── Framed masthead ─────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-5xl mx-auto px-5 py-16 sm:py-24">
          <p className="ps-eyebrow mb-6">Principia Synthesia</p>
          <h1
            className="ps-hero themed-heading"
            style={{ fontSize: "clamp(2.75rem, 6vw, 5rem)", maxWidth: "22rem" }}
          >
            Publish what matters.
          </h1>
          <p
            className="themed-muted mt-6"
            style={{ fontSize: "1.0625rem", lineHeight: 1.7, maxWidth: "30rem" }}
          >
            Start writing for free — no credit card, no catch.
            <br />
            Pro and Team tiers are coming for publishers who need more room.
          </p>
        </div>
      </div>

      {/* ── Tier grid ───────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-5 py-14 sm:py-20">
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x themed-border">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className="flex flex-col py-10 sm:first:pr-10 sm:[&:nth-child(2)]:px-10 sm:last:pl-10"
            >

              {/* Tier label + soon badge */}
              <div className="flex items-center justify-between mb-7">
                <p
                  className="ps-eyebrow"
                  style={
                    tier.cta === "sign-up"
                      ? { textShadow: "0 0 18px var(--accent)" }
                      : undefined
                  }
                >
                  {tier.name}
                </p>
                {tier.cta === "coming-soon" && (
                  <span
                    className="themed-muted"
                    style={{
                      fontSize: "0.5rem",
                      fontFamily: "ui-monospace, monospace",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      border: "1px solid var(--border)",
                      borderRadius: "0.2rem",
                      padding: "2px 5px",
                    }}
                  >
                    Soon
                  </span>
                )}
              </div>

              {/* Price */}
              <div className="mb-1">
                <span
                  className="ps-display themed-heading"
                  style={{
                    fontSize: "clamp(2.5rem, 5vw, 3.5rem)",
                    letterSpacing: "-0.04em",
                    lineHeight: 1,
                  }}
                >
                  {tier.price}
                </span>
              </div>
              <p
                className="themed-muted"
                style={{
                  fontSize: "0.5625rem",
                  fontFamily: "ui-monospace, monospace",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginTop: "0.375rem",
                  marginBottom: "2.5rem",
                }}
              >
                {tier.period}
              </p>

              {/* Feature list */}
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

              {/* CTA */}
              {tier.cta === "sign-up" ? (
                <Link
                  href="/signup"
                  className="themed-btn-accent rounded-lg text-center"
                  style={{ fontSize: "0.875rem", padding: "0.625rem 1.25rem" }}
                >
                  Get started free
                </Link>
              ) : (
                <button
                  disabled
                  className="themed-btn-outline rounded-lg opacity-40 cursor-not-allowed"
                  style={{ fontSize: "0.875rem", padding: "0.625rem 1.25rem", width: "100%" }}
                  title="Coming soon"
                >
                  Coming soon
                </button>
              )}

            </div>
          ))}
        </div>
      </div>

      {/* ── FAQ strip ───────────────────────────────────────────────── */}
      <div
        className="max-w-5xl mx-auto px-5 pb-20 sm:pb-28"
        style={{ borderTop: "1px solid var(--border)", paddingTop: "3.5rem" }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-16 gap-y-9">
          {[
            {
              q: 'What does “coming soon” mean?',
              a: "Pro and Team are actively in development. Sign up for Free now and you'll be first to know when they launch.",
            },
            {
              q: "Can I keep my content if I don't upgrade?",
              a: "Yes — everything you publish on Free is yours permanently, publicly accessible, and never paywalled.",
            },
            {
              q: "What export formats will Pro support?",
              a: "PDF with full LaTeX rendering and EPUB for e-readers. HTML bundles and citation exports are on the roadmap.",
            },
            {
              q: "No credit card required?",
              a: "The Free tier needs no payment information, ever. You'll only be asked when Pro or Team become available.",
            },
          ].map(({ q, a }) => (
            <div key={q}>
              <p
                className="themed-heading mb-2"
                style={{
                  fontSize: "0.75rem",
                  fontFamily: "ui-monospace, monospace",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {q}
              </p>
              <p className="themed-muted" style={{ fontSize: "0.875rem", lineHeight: 1.7 }}>
                {a}
              </p>
            </div>
          ))}
        </div>
      </div>

    </main>
  );
}
