import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-auto border-t themed-border">
      <div className="max-w-6xl mx-auto px-5 py-5 flex items-center justify-between gap-4">
        <span className="themed-muted" style={{ fontSize: "0.75rem", letterSpacing: "-0.02em" }}>
          © {new Date().getFullYear()} Principia Synthesia
        </span>
        <div className="flex items-center gap-4">
          <Link href="/pricing" className="themed-nav-link transition-colors hover:text-[var(--foreground)]" style={{ fontSize: "0.75rem" }}>
            Pricing
          </Link>
          <a
            href="#"
            className="themed-nav-link transition-colors hover:text-[var(--foreground)] flex items-center gap-1.5"
            style={{ fontSize: "0.75rem" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="var(--accent)" stroke="none" aria-hidden="true">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            Support
          </a>
        </div>
      </div>
    </footer>
  );
}
