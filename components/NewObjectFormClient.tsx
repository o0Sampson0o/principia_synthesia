"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const DiagramEditor = dynamic(() => import("./DiagramEditor"), { ssr: false });

type KaoType = "animation" | "dataset" | "diagram";

export default function NewObjectFormClient() {
  const [type, setType] = useState<KaoType>("animation");

  return (
    <>
      <div>
        <label htmlFor="type" className="block text-sm font-medium themed-secondary mb-1">
          Type
        </label>
        <select
          id="type"
          name="type"
          className="themed-input"
          required
          value={type}
          onChange={(e) => setType(e.target.value as KaoType)}
        >
          <option value="animation">Animation (anim-)</option>
          <option value="dataset">Dataset (object-)</option>
          <option value="diagram">Diagram (object-)</option>
        </select>
      </div>

      <div>
        <label htmlFor="slug" className="block text-sm font-medium themed-secondary mb-1">
          Slug
        </label>
        <input
          id="slug"
          name="slug"
          type="text"
          required
          placeholder={type === "animation" ? "anim-my-animation" : "object-my-object"}
          className="themed-input"
        />
        <p className="text-xs themed-muted mt-1">
          Animations: &ldquo;anim-&rdquo; prefix. Others: &ldquo;object-&rdquo; prefix.
        </p>
      </div>

      <div>
        <label htmlFor="name" className="block text-sm font-medium themed-secondary mb-1">
          Name
        </label>
        <input id="name" name="name" type="text" required maxLength={200} className="themed-input" />
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
          className="themed-input w-full resize-y"
        />
      </div>

      {type === "diagram" ? (
        <DiagramEditor initialFormat="mermaid" initialSource="" nameInputId="name" />
      ) : (
        <div>
          <label htmlFor="content" className="block text-sm font-medium themed-secondary mb-1">
            Content (JSON or JS code for animations)
          </label>
          <textarea
            id="content"
            name="content"
            rows={15}
            required
            className="themed-input w-full font-mono text-sm resize-y"
            placeholder={
              type === "animation"
                ? '{"code": "// animation code here"}'
                : '{"headers": ["Col A", "Col B"], "rows": [["val1", "val2"]]}'
            }
          />
        </div>
      )}
    </>
  );
}
