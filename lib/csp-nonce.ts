"use client";

/**
 * Reads the current page's CSP nonce from the DOM.
 *
 * `middleware.ts` mints a nonce per request and Next stamps it onto its own
 * `<script>` tags. A client component that builds a document containing an
 * inline script — `<InlineAnimation>`'s iframe `srcdoc`, which inherits this
 * page's policy — has no other way to learn it, short of threading it down as a
 * prop from every server component that could render one.
 *
 * The nonce *attribute* is emptied by the browser once parsed (so credential
 * exfiltration through CSS selectors is not possible); the `nonce` IDL property
 * keeps the real value. `getAttribute` is only a fallback for environments
 * (jsdom) that do not implement the property.
 */
export function readCspNonce(): string {
  if (typeof document === "undefined") return "";
  for (const el of document.querySelectorAll<HTMLScriptElement>("script[nonce]")) {
    const nonce = el.nonce || el.getAttribute("nonce");
    if (nonce) return nonce;
  }
  return "";
}
