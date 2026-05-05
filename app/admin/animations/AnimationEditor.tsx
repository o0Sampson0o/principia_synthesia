"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { saveAnimation } from "@/app/admin/actions";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { javascript } from "@codemirror/lang-javascript";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });

const DEFAULT_CODE = `function DoublePendulum() {
  const canvas = document.getElementById('canvas');
  if (!canvas) return;

  canvas.width = 800;
  canvas.height = 700;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const scale = height * 0.22;
  const pivotX = width / 2;
  const pivotY = height * 0.2;

  const mass1 = 1, mass2 = 1;
  const length1 = 1.2, length2 = 1.0;
  const gravity = 9.81;
  const dt = 0.016;

  let a1 = Math.PI / 2 + 0.1;
  let a2 = Math.PI / 2;
  let a1v = 0, a2v = 0;
  const trail = [];

  function step() {
    const m1 = mass1, m2 = mass2, l1 = length1, l2 = length2, g = gravity;
    const num1 = -g * (2 * m1 + m2) * Math.sin(a1);
    const num2 = -m2 * g * Math.sin(a1 - 2 * a2);
    const num3 = -2 * Math.sin(a1 - a2) * m2 * (a2v ** 2 * l2 + a1v ** 2 * l1 * Math.cos(a1 - a2));
    const den = l1 * (2 * m1 + m2 - m2 * Math.cos(2 * a1 - 2 * a2));
    const a1a = (num1 + num2 + num3) / den;

    const num4 = 2 * Math.sin(a1 - a2);
    const num5 = a1v ** 2 * l1 * (m1 + m2) + g * (m1 + m2) * Math.cos(a1) + a2v ** 2 * l2 * m2 * Math.cos(a1 - a2);
    const den2 = l2 * (2 * m1 + m2 - m2 * Math.cos(2 * a1 - 2 * a2));
    const a2a = (num4 * num5) / den2;

    a1v += a1a * dt;
    a2v += a2a * dt;
    a1 += a1v * dt;
    a2 += a2v * dt;
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    step();

    const x1 = pivotX + scale * length1 * Math.sin(a1);
    const y1 = pivotY + scale * length1 * Math.cos(a1);
    const x2 = x1 + scale * length2 * Math.sin(a2);
    const y2 = y1 + scale * length2 * Math.cos(a2);

    trail.push([x2, y2]);
    if (trail.length > 300) trail.shift();

    if (trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(trail[0][0], trail[0][1]);
      for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i][0], trail[i][1]);
      ctx.strokeStyle = 'rgba(99,102,241,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = '#a1a1aa';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#71717a';
    ctx.fill();

    ctx.beginPath(); ctx.arc(x1, y1, 14, 0, Math.PI * 2); ctx.fillStyle = '#3f3f46'; ctx.fill();
    ctx.beginPath(); ctx.arc(x2, y2, 12, 0, Math.PI * 2); ctx.fillStyle = '#3f3f46'; ctx.fill();

    requestAnimationFrame(draw);
  }

  draw();
}`;

interface Props {
  initial?: { slug: string; name: string; code: string }
}

export default function AnimationEditor({ initial }: Props) {
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? DEFAULT_CODE);
  const [isDark, setIsDark] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    mq.addEventListener("change", (e) => setIsDark(e.matches));
    return () => mq.removeEventListener("change", () => {});
  }, []);

  async function handleSave() {
    if (!slug || !name || !code) { alert("Please fill in all fields"); return; }
    setSaving(true);
    const formData = new FormData();
    formData.append("slug", slug);
    formData.append("name", name);
    formData.append("code", code);
    await saveAnimation(formData);
    setPreviewKey((k) => k + 1);
    setSaving(false);
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">{isEdit ? `Edit: ${initial.name}` : "New Animation"}</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm rounded bg-zinc-900 text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 h-[600px] mb-4">
        <div className="border rounded overflow-hidden">
          <CodeMirror
            value={code}
            height="600px"
            theme={isDark ? vscodeDark : "light"}
            extensions={[javascript()]}
            onChange={(val) => setCode(val)}
            className="h-full"
          />
        </div>

        <div className="border rounded p-4 overflow-y-auto space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Slug</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={isEdit}
              placeholder="my-animation"
              className="w-full border rounded px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Animation"
              className="w-full border rounded px-4 py-2 text-sm"
            />
          </div>
          {slug && (
            <div>
              <p className="text-xs text-zinc-400 mb-2">Preview {previewKey === 0 ? "(save to load)" : ""}</p>
              {previewKey > 0 && (
                <iframe
                  key={previewKey}
                  src={`/api/animations/${slug}?v=${previewKey}`}
                  className="w-full border rounded"
                  style={{ height: "400px" }}
                  title={`Animation: ${slug}`}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
