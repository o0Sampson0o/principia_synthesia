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
    <div className="space-y-8">

      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        {(["light", "dark"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-1.5 text-sm rounded-full border transition-colors ${
              mode === m
                ? "border-current themed-heading"
                : "themed-border themed-muted hover:themed-heading"
            }`}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
        <span className="text-xs themed-muted ml-2">Editing {mode} mode</span>
      </div>

      {/* Preset picker */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest themed-muted mb-3">Presets</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => {
            const t = mode === "light" ? preset.light : preset.dark
            return (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg themed-border border themed-secondary hover:themed-heading transition-colors"
              >
                {/* Color swatch showing bg + primary + accent of the preset */}
                <span className="flex gap-0.5">
                  <span className="w-3 h-3 rounded-full border themed-border" style={{ background: t.background }} />
                  <span className="w-3 h-3 rounded-full border themed-border" style={{ background: t.primaryBtn }} />
                  <span className="w-3 h-3 rounded-full border themed-border" style={{ background: t.accent }} />
                </span>
                {preset.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Token grid */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest themed-muted mb-3">Customize</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(Object.keys(TOKEN_LABELS) as (keyof ThemeTokens)[]).map((key) => (
            <div key={key} className="flex items-center gap-3">
              <input
                type="color"
                value={tokens[key]}
                onChange={(e) => updateToken(key, e.target.value)}
                className="w-10 h-10 rounded themed-border border cursor-pointer p-0.5 bg-transparent"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium themed-heading">{TOKEN_LABELS[key]}</p>
                <p className="text-xs themed-muted font-mono">{tokens[key]}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest themed-muted mb-3">Preview</p>
        <div
          className="rounded-xl border p-6 space-y-3"
          style={{ backgroundColor: tokens.background, color: tokens.foreground, borderColor: tokens.border }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: tokens.mutedForeground }}>
            Article
          </p>
          <h2 className="text-xl font-bold">General Relativity</h2>
          <p className="text-sm" style={{ color: tokens.mutedForeground }}>
            Einstein&apos;s geometric theory of gravitation, describing gravity as curvature of spacetime.
          </p>
          <p className="text-sm">
            See also{" "}
            <a href="#" style={{ color: tokens.link }} className="underline underline-offset-2">
              Special Relativity
            </a>{" "}
            and{" "}
            <a href="#" style={{ color: tokens.link }} className="underline underline-offset-2">
              Tensor Calculus
            </a>.
          </p>
          <code
            className="text-xs px-2 py-1 rounded"
            style={{ background: tokens.codeBackground, color: tokens.foreground }}
          >
            G_μν + Λg_μν = 8πG/c⁴ · T_μν
          </code>
          <hr style={{ borderColor: tokens.border }} />
          <div className="flex items-center gap-4 flex-wrap">
            <button
              className="text-xs px-3 py-1.5 rounded"
              style={{ background: tokens.primaryBtn, color: tokens.primaryBtnText }}
            >
              Primary button
            </button>
            <button
              className="text-xs px-3 py-1.5 rounded"
              style={{ background: tokens.accent, color: "#fff" }}
            >
              Accent button
            </button>
            <input
              placeholder="Input field"
              className="text-xs px-3 py-1.5 rounded"
              style={{
                background: "transparent",
                color: tokens.foreground,
                border: `1px solid ${tokens.inputBorder}`,
              }}
              readOnly
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="themed-btn-primary"
        >
          {saving ? "Saving..." : saved ? "Saved!" : `Save ${mode} theme`}
        </button>
        <button onClick={handleReset} className="themed-link text-sm">
          Reset {mode} to default
        </button>
      </div>
    </div>
  )
}
