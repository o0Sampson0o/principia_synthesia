"use client"

import { useRouter } from "next/navigation"
import CategoryPicker from "./CategoryPicker"

interface Props {
  tags: string[]
  query: string
  categorySlug: string
}

function buildUrl(query: string, categorySlug: string, tags: string[]) {
  const params = new URLSearchParams()
  if (query) params.set("q", query)
  if (categorySlug) params.set("category", categorySlug)
  if (tags.length) params.set("tags", tags.join(","))
  const qs = params.toString()
  return `/search${qs ? `?${qs}` : ""}`
}

export default function TagFilterBar({ tags, query, categorySlug }: Props) {
  const router = useRouter()

  return (
    <div className="mt-3">
      <CategoryPicker
        key={tags.join(",")}
        initialSelected={tags}
        onChange={(slugs) => router.push(buildUrl(query, categorySlug, slugs))}
      />
    </div>
  )
}
