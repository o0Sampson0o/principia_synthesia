import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Pricing — Principia Synthesia" };

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: ["3 articles", "1 book", "Public read-only", "Basic animations"],
    cta: "sign-up",
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
    cta: "coming-soon",
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
    cta: "coming-soon",
  },
] as const;

export default function PricingPage() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-3 text-zinc-900 dark:text-zinc-100">Pricing</h1>
        <p className="text-zinc-500 dark:text-zinc-400">Simple, transparent pricing.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`themed-card flex flex-col p-6 rounded-xl border${
              tier.name === "Pro"
                ? " ring-2 ring-offset-2 ring-zinc-900 dark:ring-zinc-100"
                : ""
            }`}
          >
            <h2 className="text-xl font-bold mb-1 text-zinc-900 dark:text-zinc-100">{tier.name}</h2>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{tier.price}</span>
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-6">{tier.period}</p>

            <ul className="space-y-2 mb-8 flex-1">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="text-green-600 dark:text-green-400 font-semibold shrink-0">&#10003;</span>
                  {f}
                </li>
              ))}
            </ul>

            {tier.cta === "sign-up" ? (
              <Link
                href="/login"
                className="themed-btn-primary w-full text-center py-2 px-4 rounded-lg text-sm font-medium"
              >
                Get started
              </Link>
            ) : (
              <button
                disabled
                className="themed-btn-primary opacity-50 cursor-not-allowed w-full py-2 px-4 rounded-lg text-sm font-medium"
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
