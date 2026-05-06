"use client"

import { useState } from "react"
import { saveTheme, resetTheme } from "../actions"
import type { ThemeTokens } from "@/db/schema"

const TOKEN_LABELS: Record<keyof ThemeTokens, string> = {
  background:      "Background",
  foreground:      "Primary text",
  muted:           "Muted background",
  mutedForeground: "Secondary text",
  border:          "Borders & dividers",
  link:            "Link color",
  linkHover:       "Link hover",
  codeBackground:  "Code background",
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

  function updateToken(key: keyof ThemeTokens, value: string) {
    setTokens((prev) => ({ ...prev, [key]: value }))
    // Apply preview immediately via CSS vars
    document.documentElement.style.setProperty(`--${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`, value)
  }

  async function handleSave() {
    setSaving(true)
    const fd = new FormData()
    fd.append("mode", mode)
    for (const [key, value] of Object.entries(tokens)) {
      fd.append(key, value)
    }
    await saveTheme(fd)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleReset() {
    const fd = new FormData()
    fd.append("mode", mode)
    await resetTheme(fd)
    // Reload to reflect reset
    window.location.reload()
  }

  return (
    <div className="space-y-8">
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMode("light")}
          className={`px-4 py-1.5 text-sm rounded-full border transition-colors ${
            mode === "light"
              ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
              : "border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-400"
          }`}
        >
          Light
        </button>
        <button
          onClick={() => setMode("dark")}
          className={`px-4 py-1.5 text-sm rounded-full border transition-colors ${
            mode === "dark"
              ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
              : "border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-400"
          }`}
        >
          Dark
        </button>
        <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-2">
          Editing {mode} mode tokens
        </span>
      </div>

      {/* Token grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(Object.keys(TOKEN_LABELS) as (keyof ThemeTokens)[]).map((key) => (
          <div key={key} className="flex items-center gap-3">
            <div className="relative">
              <input
                type="color"
                value={tokens[key]}
                onChange={(e) => updateToken(key, e.target.value)}
                className="w-10 h-10 rounded border border-zinc-200 dark:border-zinc-700 cursor-pointer p-0.5 bg-transparent"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {TOKEN_LABELS[key]}
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">
                {tokens[key]}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-3"
        style={{ backgroundColor: tokens.background, color: tokens.foreground }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: tokens.mutedForeground }}>
          Preview
        </p>
        <h2 className="text-xl font-bold">General Relativity</h2>
        <p style={{ color: tokens.mutedForeground }} className="text-sm">
          Einstein's geometric theory of gravitation, describing gravity as curvature of spacetime.
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
        <code className="text-xs px-2 py-1 rounded"
          style={{ background: tokens.codeBackground, color: tokens.foreground }}>
          G_μν + Λg_μν = 8πG/c⁴ · T_μν
        </code>
        <hr style={{ borderColor: tokens.border }} />
        <p className="text-xs" style={{ color: tokens.mutedForeground }}>
          Updated Jan 1, 2025
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? "Saving..." : saved ? "Saved!" : `Save ${mode} theme`}
        </button>
        <button
          onClick={handleReset}
          className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors underline underline-offset-2"
        >
          Reset {mode} to default
        </button>
      </div>
    </div>
  )
}
