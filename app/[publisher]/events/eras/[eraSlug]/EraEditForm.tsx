"use client";

import { useActionState, useRef } from "react";
import type { DerivedEra } from "@/lib/timeline-utils";
import { renameEra, updateEra, deleteEra } from "../actions";

type State =
  | { errors: Partial<Record<string, string[]>> }
  | { success: true }
  | null;

type Props = {
  publisherSlug: string;
  era: DerivedEra;
  startEventId: number | null;
  endEventId: number | null;
  startDate: string;
  endDate: string;
};

export default function EraEditForm({
  publisherSlug,
  era,
  startEventId,
  endEventId,
  startDate,
  endDate,
}: Props) {
  const [renameState, renameAction, renamePending] = useActionState<State, FormData>(
    (prev, formData) => renameEra(publisherSlug, prev, formData),
    null
  );
  const [updateState, updateAction, updatePending] = useActionState<State, FormData>(
    (prev, formData) => updateEra(publisherSlug, prev, formData),
    null
  );

  const deleteFormRef = useRef<HTMLFormElement>(null);

  const renameErrors = renameState && "errors" in renameState ? renameState.errors : {};
  const updateErrors = updateState && "errors" in updateState ? updateState.errors : {};

  const handleDelete = () => {
    if (confirm(`Delete era "${era.name}"? The marker events will be removed but events within this era are preserved.`)) {
      deleteFormRef.current?.requestSubmit();
    }
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold themed-heading mb-4">Rename era</h2>
        <form action={renameAction} className="space-y-4">
          <input type="hidden" name="currentName" value={era.name} />
          <div>
            <label className="block text-sm font-medium themed-secondary mb-1" htmlFor="newName">
              New name
            </label>
            <input
              id="newName"
              name="newName"
              type="text"
              defaultValue={era.name}
              required
              className="themed-input w-full"
            />
            {renameErrors.newName?.map((e) => (
              <p key={e} className="text-red-500 text-xs mt-1">{e}</p>
            ))}
          </div>
          <button
            type="submit"
            disabled={renamePending}
            className="themed-btn-primary px-4 py-2 text-sm disabled:opacity-60"
          >
            {renamePending ? "Renaming…" : "Rename"}
          </button>
        </form>
      </section>

      {startEventId !== null && (
        <section>
          <h2 className="text-lg font-semibold themed-heading mb-4">Edit dates</h2>
          <form action={updateAction} className="space-y-4">
            <input type="hidden" name="eraName" value={era.name} />
            <input type="hidden" name="startEventId" value={startEventId} />
            {endEventId !== null && (
              <input type="hidden" name="endEventId" value={endEventId} />
            )}

            <div>
              <label className="block text-sm font-medium themed-secondary mb-1" htmlFor="startDate">
                Start date
              </label>
              <input
                id="startDate"
                name="startDate"
                type="date"
                defaultValue={startDate}
                required
                className="themed-input w-full"
              />
              {updateErrors.startDate?.map((e) => (
                <p key={e} className="text-red-500 text-xs mt-1">{e}</p>
              ))}
            </div>

            {endEventId !== null && (
              <div>
                <label className="block text-sm font-medium themed-secondary mb-1" htmlFor="endDate">
                  End date
                </label>
                <input
                  id="endDate"
                  name="endDate"
                  type="date"
                  defaultValue={endDate}
                  className="themed-input w-full"
                />
                {updateErrors.endDate?.map((e) => (
                  <p key={e} className="text-red-500 text-xs mt-1">{e}</p>
                ))}
              </div>
            )}

            {updateState && "success" in updateState && (
              <p className="text-green-600 text-sm">Dates updated.</p>
            )}

            <button
              type="submit"
              disabled={updatePending}
              className="themed-btn-primary px-4 py-2 text-sm disabled:opacity-60"
            >
              {updatePending ? "Saving…" : "Save dates"}
            </button>
          </form>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold themed-heading mb-4">Delete era</h2>
        <p className="themed-muted text-sm mb-4">
          Removes the era marker events. Events that fall within this era are not deleted.
        </p>
        <form
          ref={deleteFormRef}
          action={(formData) => deleteEra(publisherSlug, formData)}
          className="hidden"
        >
          <input type="hidden" name="eraName" value={era.name} />
          {startEventId !== null && (
            <input type="hidden" name="startEventId" value={startEventId} />
          )}
          {endEventId !== null && (
            <input type="hidden" name="endEventId" value={endEventId} />
          )}
        </form>
        <button
          type="button"
          onClick={handleDelete}
          className="themed-btn-ghost text-red-600 border border-red-500 px-4 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-950"
        >
          Delete era
        </button>
      </section>
    </div>
  );
}
