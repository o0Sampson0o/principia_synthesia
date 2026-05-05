"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { saveAnimation, deleteAnimation } from "@/app/admin/actions";
import { useRouter } from "next/navigation";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
});

const defaultCode = `export default function MyAnimation() {
  const canvasRef = { current: null };
  const { useEffect } = window.__NEXT_REACT__ || {};
  
  useEffect?.(() => {
    const canvas = document.querySelector('[data-anim-slug]');
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    
    // Get theme colors from CSS variables
    function getColors() {
      const s = getComputedStyle(document.documentElement);
      return {
        bg: s.getPropertyValue('--color-canvas-bg') || '#fafafa',
        fg: s.getPropertyValue('--color-canvas-fg') || '#27272a',
        accent: s.getPropertyValue('--color-accent') || '#6366f1',
      };
    }
    
    let colors = getColors();
    
    // Watch for theme changes
    const observer = new MutationObserver(() => {
      colors = getColors();
      draw();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style']
    });
    
    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Add your animation drawing code here
    }
    
    draw();
    
    return () => observer.disconnect();
  }, []);
  
  return null;
}`;

export default function NewAnimationPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState(defaultCode);
  const [isDark, setIsDark] = useState(false);

  // Detect theme
  useState(() => {
    if (typeof window !== "undefined") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      setIsDark(mq.matches);
      mq.addEventListener("change", (e) => setIsDark(e.matches));
    }
  });

  async function handleSave() {
    if (!slug || !name || !code) {
      alert("Please fill in all fields");
      return;
    }

    const formData = new FormData();
    formData.append("slug", slug);
    formData.append("name", name);
    formData.append("code", code);

    await saveAnimation(formData);
    router.push("/admin/animations");
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">New Animation</h1>
        <button
          onClick={handleSave}
          className="px-4 py-2 text-sm rounded bg-zinc-900 text-white hover:opacity-90 transition-opacity"
        >
          Save
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 h-[600px] mb-4">
        {/* Code Editor */}
        <div className="border rounded overflow-hidden">
          <CodeMirror
            value={code}
            height="600px"
            theme={isDark ? undefined : "light"}
            onChange={(val) => setCode(val)}
            className="h-full"
          />
        </div>

        {/* Settings */}
        <div className="border rounded p-4 overflow-y-auto">
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Slug</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-animation"
              className="w-full border rounded px-4 py-2 text-sm"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Animation"
              className="w-full border rounded px-4 py-2 text-sm"
            />
          </div>
          <div className="p-4 rounded bg-zinc-50 dark:bg-zinc-900">
            <p className="text-xs text-zinc-400 mb-2">Usage in MDX:</p>
            <code className="text-xs text-zinc-600 dark:text-zinc-400">
              {`<DynamicAnimation slug="${slug || "..."}" />`}
            </code>
          </div>
        </div>
      </div>
    </main>
  );
}
