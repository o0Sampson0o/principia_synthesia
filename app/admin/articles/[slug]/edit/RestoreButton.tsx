"use client"

import { useFormStatus } from "react-dom"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation()
        if (!confirm("Restore this revision? Current content will be saved as a new revision.")) {
          e.preventDefault()
        }
      }}
      className="text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors disabled:opacity-50"
    >
      {pending ? "Restoring..." : "Restore"}
    </button>
  )
}

export default function RestoreButton({
  revisionId,
  articleId,
}: {
  revisionId: number
  articleId: number
}) {
  return <SubmitButton />
}
