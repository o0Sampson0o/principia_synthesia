import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-auto border-t themed-border">
      <div className="max-w-6xl mx-auto px-5 py-5 flex items-center justify-between gap-4">
        <span className="themed-muted" style={{ fontSize: "0.75rem", letterSpacing: "-0.02em" }}>
          © {new Date().getFullYear()} Principia Synthesia
        </span>
        <div className="flex items-center gap-4">
          <Link href="/settings/theme" className="themed-nav-link transition-colors hover:text-[var(--foreground)]" style={{ fontSize: "0.75rem" }}>
            Theme
          </Link>
          <Link href="/settings/api-tokens" className="themed-nav-link transition-colors hover:text-[var(--foreground)]" style={{ fontSize: "0.75rem" }}>
            API
          </Link>
          <Link href="/pricing" className="themed-nav-link transition-colors hover:text-[var(--foreground)]" style={{ fontSize: "0.75rem" }}>
            Pricing
          </Link>
          <Link href="/support" className="themed-nav-link transition-colors hover:text-[var(--foreground)]" style={{ fontSize: "0.75rem" }}>
            Support
          </Link>
        </div>
      </div>
    </footer>
  );
}
