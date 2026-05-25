"use client";

import { useState } from "react";
import Link from "next/link";
import { bulkVerifyArticles } from "@/app/notifications/actions";

type Article = {
  articleId: number;
  slug: string;
  publisherSlug: string;
  title: string;
};

type Props = {
  notificationId: number;
  articles: Article[];
};

export default function StaleDigestCard({ notificationId, articles }: Props) {
  const [checked, setChecked] = useState<Set<number>>(() => new Set(articles.map((a) => a.articleId)));
  const allChecked = checked.size === articles.length;

  function toggle(id: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(articles.map((a) => a.articleId)));
  }

  return (
    <form action={bulkVerifyArticles} className="mt-2">
      <input type="hidden" name="notificationId" value={notificationId} />

      <div className="flex items-center justify-between mb-2">
        <label className="flex items-center gap-2 text-xs themed-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            className="rounded"
          />
          Select all
        </label>
        <button
          type="submit"
          disabled={checked.size === 0}
          className="themed-btn-primary text-xs px-3 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Verify {checked.size > 0 ? `${checked.size} selected` : "selected"}
        </button>
      </div>

      <ul className="space-y-1">
        {articles.map((a) => (
          <li key={a.articleId} className="flex items-center gap-2">
            <input
              type="checkbox"
              name="articleId"
              value={a.articleId}
              checked={checked.has(a.articleId)}
              onChange={() => toggle(a.articleId)}
              className="rounded shrink-0"
            />
            <Link
              href={`/${a.publisherSlug}/articles/${a.slug}`}
              className="text-xs themed-link truncate"
            >
              {a.title}
            </Link>
          </li>
        ))}
      </ul>
    </form>
  );
}
