"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { removeCurriculumEntry, reorderCurriculumEntries } from "@/app/admin/actions";

interface Entry {
  id: number;
  position: number;
  partTitle: string | null;
  article: { slug: string; title: string; isInternal: boolean };
  bookSlug: string;
}

interface Props {
  bookSlug: string;
  entries: Entry[];
}

function SortableRow({ item }: { item: Entry }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const editHref = item.article.isInternal
    ? `/curriculum/${item.bookSlug}/${item.article.slug}`
    : `/${item.article.slug}`;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between py-1 group"
    >
      <div className="flex items-baseline gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 cursor-grab active:cursor-grabbing shrink-0 select-none"
          aria-label="Drag to reorder"
        >
          &#10783;
        </button>
        <span className="text-xs text-zinc-300 dark:text-zinc-600 w-5 text-right shrink-0 tabular-nums">
          {item.position}
        </span>
        <Link
          href={editHref}
          className="text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          {item.article.title}
        </Link>
        {item.article.isInternal && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
            Sub-page
          </span>
        )}
        {item.partTitle && (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            &mdash; {item.partTitle}
          </span>
        )}
      </div>
      <form action={removeCurriculumEntry}>
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="bookSlug" value={item.bookSlug} />
        <button
          type="submit"
          className="text-xs text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
        >
          Remove
        </button>
      </form>
    </li>
  );
}

export default function SortableEntriesList({ bookSlug, entries }: Props) {
  const [items, setItems] = useState(() =>
    [...entries].sort((a, b) => a.position - b.position)
  );
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((e) => e.id === active.id);
    const newIndex = items.findIndex((e) => e.id === over.id);
    const newOrder = arrayMove(items, oldIndex, newIndex);
    setItems(newOrder);
    startTransition(() =>
      reorderCurriculumEntries(bookSlug, newOrder.map((e) => e.id))
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((e) => e.id)} strategy={verticalListSortingStrategy}>
        <ol className="space-y-1">
          {items.map((item) => (
            <SortableRow key={item.id} item={item} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
