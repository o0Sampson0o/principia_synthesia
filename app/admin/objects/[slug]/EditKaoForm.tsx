"use client";

import { useActionState, useState } from "react";
import { updateKaoObject } from "../actions";
import AnimationApiRef from "../AnimationApiRef";

interface KaoObject {
  id: number;
  slug: string;
  name: string;
  type: string;
  content: unknown;
  description: string | null;
}

interface Props {
  object: KaoObject;
}

export default function EditKaoForm({ object }: Props) {
  const [state, formAction] = useActionState(updateKaoObject, null);
  const [type, setType] = useState(object.type);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="id" value={object.id} />
      <input type="hidden" name="slug" value={object.slug} />

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Name
        </label>
        <input
          name="name"
          defaultValue={object.name}
          required
          className="themed-input"
        />
        {state?.errors?.name && (
          <p className="text-xs text-red-500 mt-1">{state.errors.name[0]}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Type
        </label>
        <select name="type" defaultValue={object.type} onChange={(e) => setType(e.target.value)} className="themed-input">
          <option value="animation">Animation</option>
          <option value="dataset">Dataset</option>
          <option value="diagram">Diagram</option>
        </select>
        {state?.errors?.type && (
          <p className="text-xs text-red-500 mt-1">{state.errors.type[0]}</p>
        )}
      </div>

      {type === "animation" && <AnimationApiRef />}

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Content (JSON)
        </label>
        <textarea
          name="content"
          rows={10}
          defaultValue={JSON.stringify(object.content, null, 2)}
          className="themed-input font-mono text-sm"
        />
        {state?.errors?.content && (
          <p className="text-xs text-red-500 mt-1">{state.errors.content[0]}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Description{" "}
          <span className="text-zinc-400 font-normal">(optional)</span>
        </label>
        <textarea
          name="description"
          rows={3}
          defaultValue={object.description ?? ""}
          className="themed-input text-sm"
        />
        {state?.errors?.description && (
          <p className="text-xs text-red-500 mt-1">{state.errors.description[0]}</p>
        )}
      </div>

      <button
        type="submit"
        className="px-4 py-2 text-sm rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity"
      >
        Save changes
      </button>
    </form>
  );
}
