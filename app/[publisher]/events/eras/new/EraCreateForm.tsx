"use client";

import { useActionState } from "react";
import { createEra } from "../actions";

type State =
  | { errors: Partial<Record<string, string[]>> }
  | { success: true }
  | null;

export default function EraCreateForm({ publisherSlug }: { publisherSlug: string }) {
  const [state, action, pending] = useActionState<State, FormData>(
    (prev, formData) => createEra(publisherSlug, prev, formData),
    null
  );

  const errors = state && "errors" in state ? state.errors : {};

  return (
    <form action={action} className="space-y-6">
      <div>
        <label className="block text-sm font-medium themed-secondary mb-1" htmlFor="name">
          Era name <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="themed-input w-full"
          placeholder="e.g. Cold War Era"
        />
        {errors.name?.map((e) => (
          <p key={e} className="text-red-500 text-xs mt-1">{e}</p>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium themed-secondary mb-1" htmlFor="startDate">
          Start date <span className="text-red-500">*</span>
        </label>
        <input
          id="startDate"
          name="startDate"
          type="date"
          required
          className="themed-input w-full"
        />
        {errors.startDate?.map((e) => (
          <p key={e} className="text-red-500 text-xs mt-1">{e}</p>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium themed-secondary mb-1" htmlFor="endDate">
          End date <span className="themed-muted text-xs">(optional)</span>
        </label>
        <input
          id="endDate"
          name="endDate"
          type="date"
          className="themed-input w-full"
        />
        {errors.endDate?.map((e) => (
          <p key={e} className="text-red-500 text-xs mt-1">{e}</p>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium themed-secondary mb-1" htmlFor="description">
          Description <span className="themed-muted text-xs">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          className="themed-input w-full"
        />
        {errors.description?.map((e) => (
          <p key={e} className="text-red-500 text-xs mt-1">{e}</p>
        ))}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="themed-btn-accent rounded px-6 py-2 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create era"}
      </button>
    </form>
  );
}
