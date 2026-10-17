import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { kindForType } from "@/lib/uploads";
import { uploadFile, UploadError } from "@/lib/upload-client";
import { titleFromFilename, transformPaste } from "@/lib/smart-paste";
import { toastError } from "@/lib/toast";

/**
 * Paste and drop for the article editor:
 *  - files (a screenshot on the clipboard, images or PDFs dragged in) upload
 *    straight to storage and land where the caret / drop point was — an image
 *    as `![alt](url)`, a PDF as a `<Pdf />` block on its own line;
 *  - text goes through `transformPaste` (links, arXiv/DOI, LaTeX).
 *
 * While a file uploads, a placeholder `![Uploading name…](uploading:<id>)`
 * marks its spot; it is found by id on completion, so typing elsewhere in the
 * meantime does not disturb it.
 */

const escapeAttr = (s: string) => s.replace(/"/g, "'");

function snippetFor(kind: "image" | "file", url: string, name: string): string {
  const title = titleFromFilename(name);
  return kind === "image" ? `![${title}](${url})` : `<Pdf src="${url}" title="${escapeAttr(title)}" />`;
}

let seq = 0;

function insertUploads(view: EditorView, files: File[], pos: number, publisherSlug: string) {
  const usable = files.filter((f) => kindForType(f.type));
  if (usable.length < files.length) {
    toastError("Only images and PDFs can be added this way.", "Not uploaded");
  }
  if (usable.length === 0) return;

  const placeholders = usable.map((f) => {
    const id = `${Date.now().toString(36)}${(seq++).toString(36)}`;
    const block = kindForType(f.type) === "file";
    return { file: f, id, text: `![Uploading ${f.name.replace(/[[\]]/g, "")}…](uploading:${id})`, block };
  });

  // PDFs are blocks: give them their own line.
  const line = view.state.doc.lineAt(pos);
  const needsBreak = placeholders.some((p) => p.block) && line.text.trim() !== "";
  const insert =
    (needsBreak && pos !== line.from ? "\n\n" : "") +
    placeholders.map((p) => p.text).join(placeholders.some((p) => p.block) ? "\n\n" : " ") +
    (needsBreak ? "\n\n" : "");
  view.dispatch({ changes: { from: pos, insert }, selection: { anchor: pos + insert.length } });
  view.focus();

  for (const p of placeholders) {
    uploadFile(p.file, publisherSlug)
      .then((up) => replacePlaceholder(view, p.id, snippetFor(up.kind, up.url, up.name)))
      .catch((err) => {
        replacePlaceholder(view, p.id, "");
        toastError(err instanceof UploadError ? err.message : `${p.file.name} could not be uploaded.`, "Not uploaded");
      });
  }
}

function replacePlaceholder(view: EditorView, id: string, replacement: string) {
  const doc = view.state.doc.toString();
  const marker = `](uploading:${id})`;
  const end = doc.indexOf(marker);
  if (end === -1) return; // the author deleted it while it uploaded
  const start = doc.lastIndexOf("![Uploading ", end);
  if (start === -1) return;
  view.dispatch({ changes: { from: start, to: end + marker.length, insert: replacement } });
}

export function pasteAndDrop(publisherSlug: string): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length > 0) {
        event.preventDefault();
        insertUploads(view, files, view.state.selection.main.from, publisherSlug);
        return true;
      }
      const text = event.clipboardData?.getData("text/plain") ?? "";
      const sel = view.state.selection.main;
      const out = transformPaste(text, view.state.sliceDoc(sel.from, sel.to));
      if (out === null) return false;
      event.preventDefault();
      view.dispatch(view.state.replaceSelection(out));
      return true;
    },
    drop(event, view) {
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length === 0) return false;
      event.preventDefault();
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
      insertUploads(view, files, pos, publisherSlug);
      return true;
    },
  });
}

/** Open the file picker and upload what is chosen at the caret (the "/" menu's upload command). */
export function pickAndUpload(view: EditorView, publisherSlug: string) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = "image/jpeg,image/png,image/gif,image/webp,application/pdf";
  input.onchange = () => {
    const files = [...(input.files ?? [])];
    if (files.length) insertUploads(view, files, view.state.selection.main.head, publisherSlug);
  };
  input.click();
}
