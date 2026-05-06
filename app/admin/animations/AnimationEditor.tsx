"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { saveAnimation } from "@/app/admin/actions";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { javascript } from "@codemirror/lang-javascript";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });

// Token keys must match ThemeTokens in db/schema.ts
const TOKEN_KEYS = [
  "background", "foreground", "muted", "mutedForeground", "border",
  "link", "linkHover", "codeBackground", "surface", "surfaceHover",
  "primaryBtn", "primaryBtnText", "inputBorder", "inputFocusBorder", "secondaryText",
] as const;

function camelToKebab(s: string) {
  return s.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`);
}

function readThemeTokens() {
  const style = getComputedStyle(document.documentElement);
  const result: Record<string, string> = {};
  for (const key of TOKEN_KEYS) {
    result[key] = style.getPropertyValue(`--${camelToKebab(key)}`).trim();
  }
  return result;
}

const DEFAULT_CODE = `function MyAnimation() {
  const canvas = document.getElementById('canvas');
  if (!canvas) return;
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // window.theme gives you the user's current theme colors, e.g.:
  //   theme.background, theme.foreground, theme.muted, theme.mutedForeground,
  //   theme.border, theme.link, theme.surface, theme.primaryBtn, ...

  function draw() {
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 80, 0, Math.PI * 2);
    ctx.fillStyle = theme.primaryBtn;
    ctx.fill();

    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = theme.primaryBtnText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('theme.primaryBtn', canvas.width / 2, canvas.height / 2);

    requestAnimationFrame(draw);
  }

  draw();
}`;

interface Props {
  initial?: { slug: string; name: string; code: string }
}

export default function AnimationEditor({ initial }: Props) {
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? DEFAULT_CODE);
  const [isDark, setIsDark] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const buildPreviewSrc = useCallback((key: number) => {
    const light = readThemeTokens();
    // For dark we can't easily read dark vars from CSS (they're behind a media query),
    // so we pass the light tokens for both and let the iframe handle prefers-color-scheme.
    // A future improvement could inject dark tokens via a data attribute on <html>.
    const theme = encodeURIComponent(JSON.stringify({ light, dark: light }));
    return `/api/animations/${slug}?v=${key}&theme=${theme}`;
  }, [slug]);

  async function handleSave() {
    if (!slug || !name || !code) { alert("Please fill in all fields"); return; }
    setSaving(true);
    const formData = new FormData();
    formData.append("slug", slug);
    formData.append("name", name);
    formData.append("code", code);
    await saveAnimation(formData);
    setPreviewKey((k) => k + 1);
    setSaving(false);
  }

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold themed-heading">{isEdit ? `Edit: ${initial.name}` : "New Animation"}</h1>
        <button onClick={handleSave} disabled={saving} className="themed-btn-primary">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 h-[600px] mb-4">
        <div className="themed-border border rounded overflow-hidden">
          <CodeMirror
            value={code}
            height="600px"
            theme={isDark ? vscodeDark : "light"}
            extensions={[javascript()]}
            onChange={(val) => setCode(val)}
            className="h-full"
          />
        </div>

        <div className="themed-border border rounded p-4 overflow-y-auto space-y-4">
          <div>
            <label className="block text-sm font-medium themed-secondary mb-1">Slug</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={isEdit}
              placeholder="my-animation"
              className="themed-input text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium themed-secondary mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Animation"
              className="themed-input text-sm"
            />
          </div>
          {slug && (
            <div>
              <p className="text-xs themed-muted mb-2">Preview {previewKey === 0 ? "(save to load)" : ""}</p>
              {previewKey > 0 && (
                <iframe
                  key={previewKey}
                  src={buildPreviewSrc(previewKey)}
                  className="w-full themed-border border rounded"
                  style={{ height: "400px" }}
                  title={`Animation: ${slug}`}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 p-3 rounded themed-surface border themed-border text-xs themed-muted font-mono">
        <strong className="themed-secondary">Available theme tokens:</strong>{" "}
        {TOKEN_KEYS.map((k, i) => (
          <span key={k}><code>theme.{k}</code>{i < TOKEN_KEYS.length - 1 ? ", " : ""}</span>
        ))}
      </div>
    </main>
  );
}
