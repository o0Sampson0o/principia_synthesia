"use client"

import { useState, KeyboardEvent } from "react"

export default function CategoryInput({ initial }: { initial: string[] }) {
  const [tags, setTags] = useState<string[]>(initial)
  const [input, setInput] = useState("")

  function add() {
    const val = input.trim().toLowerCase().replace(/\s+/g, "-")
    if (val && !tags.includes(val)) setTags([...tags, val])
    setInput("")
  }

  function remove(tag: string) {
    setTags(tags.filter((t) => t !== tag))
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add() }
    else if (e.key === "Backspace" && input === "" && tags.length > 0) setTags(tags.slice(0, -1))
  }

  return (
    <div>
      <input type="hidden" name="categories" value={tags.join(",")} />
      <div className="flex flex-wrap gap-2 mb-2 min-h-6">
        {tags.map((tag) => (
          <span key={tag} className="themed-tag flex items-center gap-1">
            {tag}
            <button type="button" onClick={() => remove(tag)} className="themed-btn-ghost leading-none">×</button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={add}
        placeholder="Add category and press Enter..."
        className="themed-input text-sm"
      />
      <p className="text-xs themed-muted mt-1">Press Enter or comma to add. Spaces become hyphens.</p>
    </div>
  )
}
