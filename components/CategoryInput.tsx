"use client"

import { useState, KeyboardEvent } from "react"

export default function CategoryInput({ initial }: { initial: string[] }) {
  const [tags, setTags] = useState<string[]>(initial)
  const [input, setInput] = useState("")

  function add() {
    const val = input.trim().toLowerCase().replace(/\s+/g, "-")
    if (val && !tags.includes(val)) {
      setTags([...tags, val])
    }
    setInput("")
  }

  function remove(tag: string) {
    setTags(tags.filter((t) => t !== tag))
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      add()
    } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
      setTags(tags.slice(0, -1))
    }
  }

  return (
    <div>
      {/* Hidden input carries the comma-separated list to the form action */}
      <input type="hidden" name="categories" value={tags.join(",")} />
      <div className="flex flex-wrap gap-2 mb-2 min-h-6">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors leading-none"
            >
              ×
            </button>
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
        className="w-full border rounded px-4 py-2 text-sm bg-transparent text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 focus:outline-none"
      />
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
        Press Enter or comma to add. Spaces become hyphens.
      </p>
    </div>
  )
}
