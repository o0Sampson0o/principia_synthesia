import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t themed-surface mt-auto">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">
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
