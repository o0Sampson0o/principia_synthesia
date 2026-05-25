import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t themed-surface mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
        <span className="themed-muted">
          &copy; {new Date().getFullYear()} Principia Synthesia
        </span>
        <div className="flex items-center gap-4">
          <Link href="/pricing" className="themed-nav-link">
            Pricing
          </Link>
          <a href="#" className="themed-btn-ghost flex items-center gap-1.5">
            &#9829; Support this project
          </a>
        </div>
      </div>
    </footer>
  );
}
