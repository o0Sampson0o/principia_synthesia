"use client";
import { useRef, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import Preview from "./Preview";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
});

export default function ContentEditor({ initial }: { initial: string }) {
  const contentValue = useRef<string>(initial);
  const [content, setContent] = useState(initial);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    mq.addEventListener("change", (e) => setIsDark(e.matches));
    return () => mq.removeEventListener("change", () => {});
  }, []);

  return (
    <>
      <input type="hidden" name="content" id="content-field" />
      <div className="grid grid-cols-2 gap-4 h-[600px]">
        <CodeMirror
          value={initial}
          height="600px"
          theme={isDark ? vscodeDark : "light"}
          extensions={[
            markdown({
              base: markdownLanguage,
              codeLanguages: languages,
              addKeymap: true,
            }),
          ]}
          onChange={(val) => {
            contentValue.current = val;
            setContent(val);
          }}
          className="border rounded overflow-hidden"
        />
        <div className="border rounded p-4 overflow-y-auto max-w-none">
          <Preview source={content} />
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          const field = document.getElementById(
            "content-field",
          ) as HTMLInputElement;
          if (field) {
            field.value = contentValue.current;
            (field.closest("form") as HTMLFormElement).requestSubmit();
          }
        }}
        className="bg-black text-white px-6 py-2 rounded hover:bg-gray-800"
      >
        Save
      </button>
    </>
  );
}
