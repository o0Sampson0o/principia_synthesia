"use client"

import { useState } from "react"
import { saveTheme, resetTheme } from "../actions"
import type { ThemeTokens } from "@/db/schema"
import { PRESETS } from "@/lib/theme"

const TOKEN_LABELS: Record<keyof ThemeTokens, string> = {
  background:       "Page background",
  foreground:       "Primary text",
  muted:            "Muted background",
  mutedForeground:  "Secondary text",
  border:           "Borders & dividers",
  accent:           "Accent color",
  accentForeground: "Accent foreground",
  link:             "Link color",
  linkHover:        "Link hover",
  codeBackground:   "Code background",
  surface:          "Nav & surface background",
  surfaceHover:     "Hovered surface",
  primaryBtn:       "Primary button",
  primaryBtnText:   "Primary button text",
  inputBorder:      "Input border",
  inputFocusBorder: "Input focus border",
  secondaryText:    "Labels & nav links",
}

interface Props {
  initialLight: ThemeTokens
  initialDark: ThemeTokens
}

export default function ThemeEditor({ initialLight, initialDark }: Props) {
  const [mode, setMode] = useState<"light" | "dark">("light")
  const [light, setLight] = useState<ThemeTokens>(initialLight)
  const [dark, setDark] = useState<ThemeTokens>(initialDark)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const tokens = mode === "light" ? light : dark
  const setTokens = mode === "light" ? setLight : setDark

  function applyVar(key: keyof ThemeTokens, value: string) {
    document.documentElement.style.setProperty(
      `--${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`,
      value
    )
  }

  function updateToken(key: keyof ThemeTokens, value: string) {
    setTokens((prev) => ({ ...prev, [key]: value }))
    applyVar(key, value)
  }

  function applyPreset(preset: typeof PRESETS[0]) {
    const t = mode === "light" ? preset.light : preset.dark
    setTokens(t)
    for (const [key, value] of Object.entries(t)) {
      applyVar(key as keyof ThemeTokens, value)
    }
  }

  async function handleSave() {
    setSaving(true)
    const fd = new FormData()
    fd.append("mode", mode)
    for (const [key, value] of Object.entries(tokens)) fd.append(key, value)
    await saveTheme(fd)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleReset() {
    const fd = new FormData()
    fd.append("mode", mode)
    await resetTheme(fd)
    window.location.reload()
  }

  return (
    <div className="space-y-10">

      {/* ── Mode toggle ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {(["light", "dark"] as const).map((m) => {
          const isActive = mode === m
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={isActive ? "themed-heading" : "themed-muted"}
              style={{
                borderRadius: "9999px",
                border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                padding: "0.3125rem 0.875rem",
                fontSize: "0.8125rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                background: "transparent",
                cursor: "pointer",
                transition: "border-color 0.15s, color 0.15s",
              }}
            >
              {m === "light" ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="4"/>
                  <line x1="12" y1="2" x2="12" y2="6"/>
                  <line x1="12" y1="18" x2="12" y2="22"/>
                  <line x1="4.22" y1="4.22" x2="7.05" y2="7.05"/>
                  <line x1="16.95" y1="16.95" x2="19.78" y2="19.78"/>
                  <line x1="2" y1="12" x2="6" y2="12"/>
                  <line x1="18" y1="12" x2="22" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="7.05" y2="16.95"/>
                  <line x1="16.95" y1="7.05" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          )
        })}
      </div>

      {/* ── Presets ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-4">
          <p className="ps-eyebrow-muted">Presets</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {PRESETS.map((preset) => {
            const t = mode === "light" ? preset.light : preset.dark
            return (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                className="shrink-0 hover:bg-[var(--surface)] transition-colors"
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "0.5rem",
                  padding: "0.5rem 0.75rem",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "0.375rem",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                <span className="flex gap-0.5">
                  <span style={{ width: "0.75rem", height: "0.75rem", borderRadius: "9999px", background: t.background, border: "1px solid var(--border)", display: "block" }} />
                  <span style={{ width: "0.75rem", height: "0.75rem", borderRadius: "9999px", background: t.primaryBtn, border: "1px solid var(--border)", display: "block" }} />
                  <span style={{ width: "0.75rem", height: "0.75rem", borderRadius: "9999px", background: t.accent, border: "1px solid var(--border)", display: "block" }} />
                </span>
                <span className="themed-secondary" style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                  {preset.name}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Token grid ──────────────────────────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-4">
          <p className="ps-eyebrow-muted">Tokens</p>
          <span className="themed-muted" style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}>
            {Object.keys(TOKEN_LABELS).length}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          {(Object.keys(TOKEN_LABELS) as (keyof ThemeTokens)[]).map((key) => (
            <div key={key} className="flex items-center gap-3">
              <input
                type="color"
                value={tokens[key]}
                onChange={(e) => updateToken(key, e.target.value)}
                style={{
                  width: "2rem",
                  height: "2rem",
                  borderRadius: "0.375rem",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  background: "transparent",
                  padding: 0,
                  flexShrink: 0,
                }}
              />
              <div className="min-w-0">
                <p className="themed-heading" style={{ fontSize: "0.875rem", lineHeight: 1.3 }}>
                  {TOKEN_LABELS[key]}
                </p>
                <p className="themed-muted" style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace" }}>
                  {tokens[key]}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Live preview ────────────────────────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-4">
          <p className="ps-eyebrow-muted">Preview</p>
        </div>
        <div
          style={{
            borderRadius: "0.75rem",
            border: `1px solid ${tokens.border}`,
            background: tokens.background,
            color: tokens.foreground,
            padding: "1.25rem",
          }}
        >
          <p style={{ fontSize: "0.625rem", fontFamily: "ui-monospace, monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: tokens.mutedForeground, marginBottom: "0.5rem" }}>
            Article
          </p>
          <h2 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: "1.125rem", fontWeight: 500, color: tokens.foreground, marginBottom: "0.375rem", letterSpacing: "-0.02em" }}>
            General Relativity
          </h2>
          <p style={{ fontSize: "0.8125rem", color: tokens.mutedForeground, marginBottom: "0.5rem", lineHeight: 1.55 }}>
            {"Einstein's geometric theory of gravitation. "}
            <a href="#" style={{ color: tokens.link, textDecoration: "underline", textUnderlineOffset: "2px" }}>
              Special Relativity
            </a>
          </p>
          <code style={{ fontSize: "0.6875rem", fontFamily: "ui-monospace, monospace", background: tokens.codeBackground, color: tokens.foreground, padding: "0.25rem 0.5rem", borderRadius: "0.25rem", display: "inline-block", marginBottom: "0.75rem" }}>
            G_μν + Λg_μν = 8πG/c⁴ · T_μν
          </code>
          <hr style={{ borderColor: tokens.border, marginBottom: "0.75rem" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <button style={{ fontSize: "0.75rem", padding: "0.25rem 0.75rem", borderRadius: "0.375rem", background: tokens.primaryBtn, color: tokens.primaryBtnText, border: "none", cursor: "default" }}>
              Primary
            </button>
            <span style={{ fontSize: "0.75rem", padding: "0.25rem 0.75rem", borderRadius: "0.375rem", background: tokens.accent, color: "#fff" }}>
              Accent
            </span>
            <input
              readOnly
              placeholder="Input"
              style={{ fontSize: "0.75rem", padding: "0.25rem 0.625rem", borderRadius: "0.375rem", background: "transparent", color: tokens.foreground, border: `1px solid ${tokens.inputBorder}`, outline: "none" }}
            />
          </div>
        </div>
      </div>

      {/* ── Actions ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          onClick={handleReset}
          className="themed-btn-outline rounded-lg"
          style={{ fontSize: "0.8125rem", padding: "0.5rem 1rem" }}
        >
          Reset to default
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="themed-btn-accent rounded-lg"
          style={{ fontSize: "0.8125rem", padding: "0.5rem 1rem" }}
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : `Save ${mode} theme`}
        </button>
      </div>

    </div>
  )
}
