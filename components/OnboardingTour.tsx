"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { completeOnboarding } from "@/app/settings/onboarding/actions";
import { useRouter, usePathname } from "next/navigation";

type Step = {
  id: string;
  title: string;
  body: string;
  fallbackRoute?: { label: string; href: string };
};

const STEPS: Step[] = [
  {
    id: "new-article-button",
    title: "Create your first article",
    body: "Use the New article button on your publisher page to start writing. Articles support MDX, math, animations, and wikilinks.",
    fallbackRoute: { label: "Go to my publisher", href: "" },
  },
  {
    id: "editor-content",
    title: "Embed animations with [[anim-…]]",
    body: "Inside the editor, type [[anim-slug]] to embed any animation you have created under your publisher. They render live in the article.",
    fallbackRoute: { label: "Open new article form", href: "" },
  },
  {
    id: "frontmatter-panel",
    title: "Frontmatter & book slug",
    body: "Open the Frontmatter section to set tags, description, and the canvas (book slug) that groups this article into a curriculum.",
    fallbackRoute: { label: "Open new article form", href: "" },
  },
  {
    id: "article-access-link",
    title: "Control who can see your work",
    body: "From any article's edit page, the Access & visibility link lets you choose public, organisation-only, or private — with explicit grants.",
    fallbackRoute: { label: "Open my publisher", href: "" },
  },
];

export default function OnboardingTour({ publisherSlug }: { publisherSlug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [isPending, startTransition] = useTransition();
  const targetRef = useRef<HTMLElement | null>(null);

  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(window.matchMedia("(min-width: 768px)").matches);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${STEPS[stepIndex].id}"]`);
    targetRef.current = el;
    setRect(el?.getBoundingClientRect() ?? null);

    if (el) el.classList.add("tour-highlight");
    return () => { el?.classList.remove("tour-highlight"); };
  }, [stepIndex, enabled, pathname]);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setRect(targetRef.current?.getBoundingClientRect() ?? null);
      });
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [enabled]);

  if (!enabled) return null;

  const step = STEPS[stepIndex];

  function finish(outcome: "completed" | "skipped") {
    const fd = new FormData();
    fd.set("outcome", outcome);
    startTransition(async () => {
      await completeOnboarding(fd);
    });
  }

  function next() {
    if (stepIndex === STEPS.length - 1) finish("completed");
    else setStepIndex((i) => i + 1);
  }

  function back() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  const fallback = step.fallbackRoute && {
    ...step.fallbackRoute,
    href:
      step.id === "new-article-button" ? `/${publisherSlug}` :
      step.id === "editor-content" || step.id === "frontmatter-panel" ? `/${publisherSlug}/articles/new` :
      `/${publisherSlug}`,
  };

  const popoverStyle: React.CSSProperties = rect
    ? {
        position: "fixed",
        top: Math.max(16, rect.top),
        left: Math.min(window.innerWidth - 360, rect.right + 12),
        width: 320,
        zIndex: 60,
      }
    : {
        position: "fixed",
        top: 80,
        left: "50%",
        transform: "translateX(-50%)",
        width: 360,
        zIndex: 60,
      };

  return (
    <>
      {!rect && <div className="fixed inset-0 bg-black/40 z-40" aria-hidden="true" />}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-tour-title"
        className="themed-surface themed-border border rounded-lg shadow-lg p-4"
        style={popoverStyle}
      >
        <p className="text-xs themed-muted mb-1">Step {stepIndex + 1} of {STEPS.length}</p>
        <h2 id="onboarding-tour-title" className="text-base font-semibold themed-heading mb-2">{step.title}</h2>
        <p className="text-sm themed-secondary mb-4">{step.body}</p>

        {!rect && fallback && (
          <button
            type="button"
            onClick={() => router.push(fallback.href)}
            className="text-sm themed-link mb-3 block"
          >
            {fallback.label} &rarr;
          </button>
        )}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => finish("skipped")}
            disabled={isPending}
            className="themed-btn-ghost text-xs"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <button type="button" onClick={back} disabled={isPending} className="themed-btn-ghost text-sm">
                Back
              </button>
            )}
            <button type="button" onClick={next} disabled={isPending} className="themed-btn-accent rounded-lg text-sm">
              {stepIndex === STEPS.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
