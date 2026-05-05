"use client";

import { useState } from "react";
import { deleteCurriculumBook } from "@/app/admin/actions";

export default function DeleteBookButton({
  bookSlug,
  bookTitle,
}: {
  bookSlug: string;
  bookTitle: string;
}) {
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    // Call server action
    const formData = new FormData();
    formData.append("bookSlug", bookSlug);
    await deleteCurriculumBook(formData);
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      className={`text-xs transition-colors ${
        confirming
          ? "text-red-500 hover:text-red-700"
          : "text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400"
      }`}
    >
      {confirming ? "Click again to confirm" : "Delete book"}
    </button>
  );
}
