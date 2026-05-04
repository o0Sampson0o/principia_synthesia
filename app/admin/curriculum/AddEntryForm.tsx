'use client';

import { useState } from 'react';
import { upsertCurriculumEntry } from '@/app/admin/actions';

interface AddEntryFormProps {
  allArticles: Array<{ id: number; slug: string; title: string }>;
  bookList: Array<[string, { bookTitle: string; entries: Array<{ id: number; position: number }> }]>;
  existingArticleIds: number[];
  nextPositions: Record<string, number>;
}

export default function AddEntryForm({
  allArticles,
  bookList,
  existingArticleIds,
  nextPositions,
}: AddEntryFormProps) {
  const [selectedBook, setSelectedBook] = useState<string>('');
  const [bookSlug, setBookSlug] = useState('');
  const [bookTitle, setBookTitle] = useState('');

  const handleBookChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedBook(value);
    if (value === 'new') {
      setBookSlug('');
      setBookTitle('');
    } else {
      const book = bookList.find(([slug]) => slug === value);
      if (book) {
        setBookSlug(book[0]);
        setBookTitle(book[1].bookTitle);
      }
    }
  };

  const filteredArticles = allArticles.filter(
    (a) => !existingArticleIds.includes(a.id)
  );

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 mb-10">
      <h2 className="text-sm font-semibold mb-4">Add to a book</h2>
      <form action={upsertCurriculumEntry} className="space-y-3">
        <div className="mb-3">
          <label className="block text-xs font-medium mb-1">Book</label>
          <select
            value={selectedBook}
            onChange={handleBookChange}
            required
            className="border rounded px-3 py-2 text-sm bg-white dark:bg-zinc-900 w-full"
          >
            <option value="">Select a book...</option>
            {bookList.map(([slug, book]) => (
              <option key={slug} value={slug}>
                {book.bookTitle} ({slug})
              </option>
            ))}
            <option value="new">+ Create new book</option>
          </select>
        </div>

        {selectedBook === 'new' && (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input
              name="bookSlug"
              placeholder="book-slug"
              required
              className="border rounded px-3 py-2 text-sm bg-white dark:bg-zinc-900"
              value={bookSlug}
              onChange={(e) => setBookSlug(e.target.value)}
            />
            <input
              name="bookTitle"
              placeholder="Book Title"
              required
              className="border rounded px-3 py-2 text-sm bg-white dark:bg-zinc-900"
              value={bookTitle}
              onChange={(e) => setBookTitle(e.target.value)}
            />
          </div>
        )}

        {selectedBook && selectedBook !== 'new' && (
          <>
            <input type="hidden" name="bookSlug" value={bookSlug} />
            <input type="hidden" name="bookTitle" value={bookTitle} />
          </>
        )}

        <div className="grid grid-cols-3 gap-3">
          <select
            name="articleId"
            required
            className="border rounded px-3 py-2 text-sm bg-white dark:bg-zinc-900"
          >
            <option value="">Select article...</option>
            {filteredArticles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
          <input
            key={selectedBook}
            name="position"
            type="number"
            placeholder="Position"
            required
            className="border rounded px-3 py-2 text-sm bg-white dark:bg-zinc-900"
            defaultValue={
              selectedBook &&
              selectedBook !== 'new' &&
              nextPositions[selectedBook]
                ? nextPositions[selectedBook]
                : ''
            }
          />
          <input
            name="partTitle"
            placeholder="Part title (optional)"
            className="border rounded px-3 py-2 text-sm bg-white dark:bg-zinc-900"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 text-sm rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity"
        >
          Add entry
        </button>
      </form>
    </div>
  );
}
