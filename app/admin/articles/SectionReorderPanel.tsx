"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  type DragEndEvent,
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
import { parseArticleSections, reconstructMdx, type Section } from "@/lib/article-sections";
import { updateArticleContent } from "@/app/admin/actions";

interface Props {
  articleSlug: string;
  initialContent: string;
}

function SortableCard({ section }: { section: Section }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const preview = section.body
    .split("\n")
    .slice(1)  // skip the heading line
    .join(" ")
    .trim()
    .slice(0, 80);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-3 bg-white dark:bg-zinc-950"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-lg leading-none"
        aria-label="Drag to reorder"
      >
        &#10783;
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{section.heading}</p>
        {preview && (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
            {preview}{section.body.trim().length > 80 + section.heading.length + 3 ? "…" : ""}
          </p>
        )}
      </div>
    </li>
  );
}

export default function SectionReorderPanel({ articleSlug, initialContent }: Props) {
  const parsed = parseArticleSections(initialContent);
  const preamble = parsed[0];
  const [sections, setSections] = useState<Section[]>(parsed.slice(1));
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (sections.length < 2) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400 py-4">
        No sections to reorder — add <code>##</code> headings to your article.
      </p>
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    const newOrder = arrayMove(sections, oldIndex, newIndex);
    setSections(newOrder);

    const newMdx = reconstructMdx(preamble.body, newOrder);
    setStatus("saving");

    startTransition(async () => {
      const result = await updateArticleContent(articleSlug, newMdx);
      if (result?.error) {
        setStatus("error");
        setErrorMsg(result.error);
      } else {
        setStatus("success");
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Preamble — static, non-draggable */}
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-3 opacity-60">
        <span className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mr-2">Pinned</span>
        <span className="text-sm text-zinc-700 dark:text-zinc-300">Introduction / Preamble</span>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2">
            {sections.map((section) => (
              <SortableCard key={section.id} section={section} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      {status === "saving" && <p className="text-xs text-zinc-400">Saving…</p>}
      {status === "success" && <p className="text-xs text-green-600 dark:text-green-400">Sections reordered.</p>}
      {status === "error" && <p className="text-xs text-red-500">Error: {errorMsg}</p>}
    </div>
  );
}
