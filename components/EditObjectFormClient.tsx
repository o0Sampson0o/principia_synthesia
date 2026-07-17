"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

const DiagramEditor = dynamic(() => import("./DiagramEditor"), { ssr: false });

interface Props {
  id: number;
  slug: string;
  name: string;
  type: string;
  description: string;
  content: unknown;
  isDiagram: boolean;
  diagramFormat: "mermaid" | "graphviz";
  diagramSource: string;
  rawContentJson: string;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  publisherSlug: string;
  objSlug: string;
}

export default function EditObjectFormClient({
  id,
  slug,
  name,
  type,
  description,
  isDiagram,
  diagramFormat,
  diagramSource,
  rawContentJson,
  updateAction,
  deleteAction,
  publisherSlug,
  objSlug,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteFormRef = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-6">
      <form action={updateAction} className="space-y-4">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="type" value={type} />

        <div>
          <label htmlFor="name" className="block text-sm font-medium themed-secondary mb-1">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={200}
            defaultValue={name}
            className="themed-input"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium themed-secondary mb-1">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            maxLength={1000}
            defaultValue={description}
            className="themed-input w-full resize-y"
          />
        </div>

        {isDiagram ? (
          <DiagramEditor
            initialFormat={diagramFormat}
            initialSource={diagramSource}
            nameInputId="name"
          />
        ) : (
          <div>
            <label htmlFor="content" className="block text-sm font-medium themed-secondary mb-1">
              Content (JSON or JS code)
            </label>
            <textarea
              id="content"
              name="content"
              rows={15}
              required
              defaultValue={rawContentJson}
              className="themed-input w-full font-mono text-sm resize-y"
            />
          </div>
        )}

        <div className="flex items-center gap-4">
          <button type="submit" className="themed-btn-accent rounded-lg">
            Save changes
          </button>
          <Link
            href={`/${publisherSlug}/objects/${objSlug}`}
            className="text-sm themed-link"
          >
            Cancel
          </Link>
        </div>
      </form>

      <hr className="themed-border" />

      <div>
        <h2 className="text-lg font-semibold themed-heading mb-2">Danger zone</h2>
        {confirmDelete ? (
          <form ref={deleteFormRef} action={deleteAction} className="flex items-center gap-3">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="slug" value={slug} />
            <p className="text-sm text-red-600 dark:text-red-400">
              Delete this object permanently?
            </p>
            <button type="submit" className="text-sm font-medium text-red-600 dark:text-red-400 underline">
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-sm themed-link"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-sm text-red-600 dark:text-red-400 underline"
          >
            Delete object
          </button>
        )}
      </div>
    </div>
  );
}
