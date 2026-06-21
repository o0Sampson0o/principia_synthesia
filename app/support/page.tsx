import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/lib/config";

export const metadata: Metadata = { title: "Support — Principia Synthesia" };

const QUICK_LINKS = [
  {
    label: "Getting started",
    description: "New to the platform? Start here.",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </svg>
    ),
  },
  {
    label: "Publishing",
    description: "Articles, books, and formatting guides.",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    ),
  },
  {
    label: "Account & billing",
    description: "Plans, themes, and your account settings.",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
        <line x1="1" y1="10" x2="23" y2="10"/>
      </svg>
    ),
  },
  {
    label: "Technical help",
    description: "LaTeX, animations, and embeds.",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="4 17 10 11 4 5"/>
        <line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    ),
  },
] as const;

const FAQ_LEFT = [
  {
    q: "How do I use LaTeX math in articles?",
    a: "Wrap inline math in $...$ and display math in $$...$$. The editor renders KaTeX live as you type.",
  },
  {
    q: "What's the difference between an article and a book?",
    a: "Articles are standalone pieces. Books are collections of chapters you can build incrementally and share as a whole.",
  },
  {
    q: "Can I import from other platforms?",
    a: "Markdown files with standard frontmatter can be pasted directly into the editor. LaTeX import is on the roadmap.",
  },
  {
    q: "How does access control work?",
    a: "Each resource can be set to public or private. Private content is only visible to you and your organization members.",
  },
];

const FAQ_RIGHT = [
  {
    q: "Is my content permanently mine?",
    a: "Yes. You retain full ownership. Deleting your account removes it from the platform, but we recommend exporting first.",
  },
  {
    q: "What browsers are supported?",
    a: "All modern browsers (Chrome, Firefox, Safari, Edge). The editor works best on desktop for complex formatting.",
  },
  {
    q: "Why is my animation not rendering?",
    a: "Animations use a custom syntax. Check the animation reference docs for supported parameters and types.",
  },
  {
    q: "How do I report a bug?",
    a: "Use the contact options below or open an issue on our GitHub. We aim to respond within 48 hours.",
  },
];

export default function SupportPage() {
  return (
    <main className="flex-1">

      {/* ── Framed masthead ─────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-5xl mx-auto px-5 py-14 sm:py-20">
          <p className="ps-eyebrow mb-5">Principia Synthesia</p>
          <h1
            className="ps-hero themed-heading"
            style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}
          >
            How can we help?
          </h1>
          <p
            className="themed-muted mt-5"
            style={{ fontSize: "1.0625rem", lineHeight: 1.65, maxWidth: "28rem" }}
          >
            Browse common questions or reach out directly.
          </p>
        </div>
      </div>

      {/* ── Quick-links ─────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-5 py-12 sm:py-16">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK_LINKS.map((card) => (
            <div
              key={card.label}
              className="group flex flex-col gap-3 transition-colors"
              style={{
                border: "1px solid var(--border)",
                borderRadius: "0.625rem",
                padding: "1rem 1.125rem",
                cursor: "default",
                transition: "background 0.15s, border-color 0.15s",
              }}
            >
              {card.icon}
              <div>
                <p className="themed-heading" style={{ fontSize: "0.875rem", lineHeight: 1.3, marginBottom: "0.25rem" }}>
                  {card.label}
                </p>
                <p className="themed-muted" style={{ fontSize: "0.75rem", lineHeight: 1.5 }}>
                  {card.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-5 pb-12 sm:pb-16">

        <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-8">
          <p className="ps-eyebrow-muted">Common questions</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12">

          {/* Left column */}
          <div>
            {FAQ_LEFT.map((item, i) => (
              <div
                key={i}
                style={{
                  borderBottom: "1px solid var(--border)",
                  paddingTop: i === 0 ? 0 : "1.25rem",
                  paddingBottom: "1.25rem",
                }}
              >
                <p
                  className="themed-heading"
                  style={{ fontSize: "0.9375rem", fontWeight: 500, marginBottom: "0.5rem", lineHeight: 1.4 }}
                >
                  {item.q}
                </p>
                <p className="themed-muted" style={{ fontSize: "0.875rem", lineHeight: 1.7 }}>
                  {item.a}
                </p>
              </div>
            ))}
          </div>

          {/* Right column */}
          <div>
            {FAQ_RIGHT.map((item, i) => (
              <div
                key={i}
                style={{
                  borderBottom: "1px solid var(--border)",
                  paddingTop: i === 0 ? 0 : "1.25rem",
                  paddingBottom: "1.25rem",
                }}
              >
                <p
                  className="themed-heading"
                  style={{ fontSize: "0.9375rem", fontWeight: 500, marginBottom: "0.5rem", lineHeight: 1.4 }}
                >
                  {item.q}
                </p>
                <p className="themed-muted" style={{ fontSize: "0.875rem", lineHeight: 1.7 }}>
                  {item.a}
                </p>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ── Contact strip ───────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-5 pb-16 sm:pb-24">
        <div
          style={{
            borderRadius: "0.75rem",
            padding: "2rem 2.5rem",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
          }}
          className="sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="ps-eyebrow mb-3">Still need help?</p>
            <h2
              className="ps-display themed-heading"
              style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", marginBottom: "0.375rem" }}
            >
              Get in touch.
            </h2>
            <p className="themed-muted" style={{ fontSize: "0.875rem", lineHeight: 1.6 }}>
              We respond to all messages within 48 hours.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <a
              href={`mailto:${config.contact.email}`}
              className="themed-btn-accent rounded-lg text-center"
              style={{ fontSize: "0.875rem", padding: "0.625rem 1.25rem" }}
            >
              Email us
            </a>
            <a
              href={config.contact.githubIssues}
              target="_blank"
              rel="noopener noreferrer"
              className="themed-btn-outline rounded-lg text-center"
              style={{ fontSize: "0.875rem", padding: "0.625rem 1.25rem" }}
            >
              Open a GitHub issue
            </a>
          </div>
        </div>
      </div>

    </main>
  );
}
