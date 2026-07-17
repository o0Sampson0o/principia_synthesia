"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; size?: string }) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/api.js?render=explicit";

/**
 * Cloudflare Turnstile widget for guest comment forms. Renders nothing when
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (local dev — the server skips
 * verification too). The widget injects a hidden `cf-turnstile-response`
 * input into the surrounding form, which the server action verifies.
 *
 * The script loads once and is shared by all widgets on the page; allowed by
 * the CSP via 'strict-dynamic' (script) and an explicit frame-src entry.
 */
export default function TurnstileWidget() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let widgetId: string | undefined;
    let cancelled = false;

    const render = () => {
      if (cancelled || !ref.current || !window.turnstile) return;
      widgetId = window.turnstile.render(ref.current, { sitekey: siteKey, size: "flexible" });
    };

    if (window.turnstile) {
      render();
    } else {
      let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
      if (!script) {
        script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
    }

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={ref} className="mt-2" />;
}
