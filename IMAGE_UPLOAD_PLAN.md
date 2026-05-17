# Image Upload and Display — Implementation Plan

## Overview

This plan adds an end-to-end image hosting system to Principia Synthesia. Publishers (users and organizations) gain the ability to upload images from a dedicated `/<publisher>/images` page or directly from the article editor toolbar. Images are stored in **Vercel Blob** under publisher-scoped key prefixes (`images/<publisher-slug>/<uuid>.<ext>`), referenced from MDX via the standard `![alt](url)` syntax, and rendered through a new `<ArticleImage>` component that wraps `next/image` for blob URLs and falls back to `unoptimized` mode for external hosts.

No new database table is introduced — Vercel Blob's `list()` API serves as the source of truth for ownership and discovery. Ownership is enforced by parsing the blob key prefix on every read/write/delete.

The plan is sequenced in six phases. Each phase is independently testable, and phases are ordered so that no later phase depends on something not yet built.

---

## Assumptions

1. **Vercel Blob is the only storage backend** — no fallback to S3, R2, or local disk. The user requested Vercel Blob explicitly.
2. **No image metadata table** — the user explicitly requested no DB table. We rely on Blob's `list()` for listing and Blob's HEAD response (via `head()`) for individual lookups.
3. **Alt text requirement is UI-enforced only** — the upload API accepts an alt text field but does not reject empty strings (since alt text isn't stored in Blob anyway). Empty alt text is allowed at the API to keep direct API uploads simple; the upload form requires it.
4. **No image renaming, no albums, no captions** — keep scope minimal. Future work can add these on top.
5. **Image dimensions** — we do not extract dimensions server-side. `<ArticleImage>` uses `fill` mode inside a responsive container when no `width`/`height` is supplied.
6. **Per-publisher quotas are out of scope** — Vercel Blob plan limits apply globally for now.
7. **Uploads use a single multipart POST** — no resumable / chunked uploads. The 5 MB cap is well below the typical Edge / Node body size limit.
8. **`isInternal` articles are out of scope** — image uploads are not tied to any single article; they belong to the publisher.
9. **No CDN purging on delete** — Vercel Blob handles cache invalidation automatically when a blob is deleted.
10. **Existing CSP `img-src` already includes `'self'` and `data:`** — Blob URLs are served from `*.public.blob.vercel-storage.com`, which must be added to `img-src`.

---

## Architecture & Design Decisions

### Why no database table

The user explicitly asked for none. Vercel Blob's `list({ prefix: "images/<publisher>/" })` is fast (one network call), returns `{ url, pathname, size, uploadedAt }`, and never gets out of sync with reality. The DB-as-source-of-truth pattern is only valuable when you need richer per-image metadata (categories, tags, who-uploaded-it-when). For a wiki image library, the URL itself plus filename and upload date are sufficient.

### Ownership enforcement model

The blob path itself is the ACL. Every API handler:
1. Reads the session.
2. Parses `publisherSlug` from the URL or body.
3. Resolves it to a `ResolvedPublisher`.
4. Calls `canEditContent(session, ownerType, ownerId)` — the same authorization helper used everywhere else.
5. Only operates on blobs whose pathname starts with `images/<publisher-slug>/`.

Step 5 is the critical check on `DELETE` — without it, a publisher could trick the API into deleting someone else's image by supplying a different path.

### MDX integration without new syntax

Standard `![alt](https://...vercel-storage.com/...)` is what the writer types. The MDX renderer is configured (via the `components` prop on `<MDXRemote>`) to map `img` → `<ArticleImage>` so that `next/image` is used everywhere automatically. No new wikilink syntax, no new MDX component is required for the writer.

### Why a custom `<ArticleImage>` wrapper

`next/image` requires `width` / `height` (or `fill` with a sized container) and is strict about hostnames. We need a component that:
- Detects blob URLs (matches `*.public.blob.vercel-storage.com`) and uses Next's optimizer.
- Falls back to `unoptimized` for arbitrary external hosts (so existing articles that already use `![](https://example.com/foo.png)` continue to work).
- Renders unconditionally inside a responsive `<figure>` so the layout doesn't depend on dimensions the writer didn't provide.

### PDF path

The PDF pipeline runs through `unified` → `remark-rehype` → `rehype-sanitize` → `rehype-stringify`. It produces plain `<img>` tags. We do **not** want `next/image` in the PDF (Chromium doesn't talk to Next's image optimizer when rendering an arbitrary HTML page). The existing sanitize schema already allows `<img>`, so PDF support requires no logic change — only adding the Blob hostname to the protocol allowlist if a stricter `src` regex is later added.

---

## Phase 1 — Vercel Blob setup

### 1.1 Install dependency

```bash
npm install @vercel/blob
```

### 1.2 `next.config.ts` — allow Blob hostname

Add an `images.remotePatterns` block:

```ts
const nextConfig: NextConfig = {
  serverExternalPackages: [
    "mathjax-full",
    "playwright-core",
    "@sparticuz/chromium",
    "epub-gen-memory",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        pathname: "/**",
      },
    ],
  },
};
```

### 1.3 `middleware.ts` — extend CSP `img-src`

Update `buildCsp()`:

```ts
`img-src 'self' data: blob: https://*.public.blob.vercel-storage.com`,
```

### 1.4 Document `BLOB_READ_WRITE_TOKEN`

Update `CLAUDE.md` "Environment" section to include:

```
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...   # Vercel Blob read/write token (required for image uploads)
```

In Vercel, this token is injected automatically when a Blob store is linked. Locally, the developer must run `vercel env pull .env.local` after creating the store.

### 1.5 New helper module `lib/images.ts`

Exports constants and small pure helpers used by both the API routes and the UI.

```ts
// lib/images.ts
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
export type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number];

/** Maps a MIME type to an extension. Returns null if not allowed. */
export function extensionForMime(mime: string): string | null;

/** Returns the publisher slug for a blob pathname like `images/foo/abc.png`, or null. */
export function publisherFromBlobPath(pathname: string): string | null;

/** Builds the blob key for a new upload. */
export function buildBlobKey(publisherSlug: string, ext: string): string;
//   -> `images/<publisher-slug>/<uuid>.<ext>`

/** Returns true if the URL host is `*.public.blob.vercel-storage.com`. */
export function isBlobUrl(url: string): boolean;
```

Implementation notes:
- `buildBlobKey` uses `crypto.randomUUID()`.
- `publisherFromBlobPath` matches `^images/([a-z0-9-]+)/[^/]+$` — strict, no nested paths.
- `isBlobUrl` parses the URL with `new URL()` inside try/catch.

---

## Phase 2 — Upload, list, and delete API routes

All routes live under `app/api/images/` and require an authenticated session. Each route resolves the publisher slug, calls `canEditContent`, and only touches blobs under the publisher's prefix.

### 2.1 Validation schemas (`lib/validations.ts`)

Add a publisher slug validator reuse (already present) and:

```ts
export const uploadImageQuerySchema = z.object({
  publisher: publisherSlugSchema,
});

export const deleteImageBodySchema = z.object({
  path: z.string().regex(
    /^images\/[a-z0-9-]+\/[a-z0-9-]+\.(?:jpg|jpeg|png|gif|webp)$/,
    "Invalid blob path"
  ),
});

export const listImagesQuerySchema = z.object({
  publisher: publisherSlugSchema,
});
```

### 2.2 `POST /api/images/upload`

**File:** `app/api/images/upload/route.ts`

**Behavior:**
1. Parse `formData()` from the request.
2. Extract `publisher` (string) and `file` (File) fields.
3. Run `uploadImageQuerySchema.parse({ publisher })`.
4. Require session via `requireSession()`.
5. Resolve publisher; 404 if missing.
6. `canEditContent` check; 403 if forbidden.
7. Validate `file.type` against `ALLOWED_MIME_TYPES`; 415 if not allowed.
8. Validate `file.size <= MAX_IMAGE_BYTES`; 413 if too large.
9. Compute extension via `extensionForMime(file.type)`.
10. Build blob key via `buildBlobKey(publisherSlug, ext)`.
11. Call `put(key, file, { access: "public", contentType: file.type, addRandomSuffix: false })` from `@vercel/blob`.
12. Return `NextResponse.json({ url: result.url, pathname: result.pathname }, { status: 201 })`.

**Signature:**
```ts
export async function POST(req: Request): Promise<Response>;
```

No `params` since the publisher slug is in the body (so the route stays under `/api/images/`). This avoids a deeper directory tree and matches how the upload form will be wired.

### 2.3 `GET /api/images/list`

**File:** `app/api/images/list/route.ts`

**Behavior:**
1. Read `?publisher=<slug>` from the URL.
2. Run `listImagesQuerySchema.parse(...)`.
3. Require session, resolve publisher, run `canEditContent`. 403 if forbidden.
4. Call `list({ prefix: \`images/${publisherSlug}/\`, limit: 1000 })` from `@vercel/blob`.
5. Return JSON shape:
   ```ts
   {
     images: Array<{
       url: string;
       pathname: string;
       size: number;
       uploadedAt: string; // ISO
     }>
   }
   ```
6. Sort by `uploadedAt` descending before returning.

### 2.4 `DELETE /api/images/[...path]`

**File:** `app/api/images/[...path]/route.ts`

**Behavior:**
1. `const { path } = await params;` — `path` is `string[]` (catch-all). Reconstruct pathname: `path.join("/")`.
2. Run `deleteImageBodySchema.parse({ path: pathname })` (path comes from URL, not body — name kept for schema reuse).
3. `publisherFromBlobPath(pathname)` — 400 if it returns null.
4. Require session, resolve publisher (the one extracted from the path), run `canEditContent`. 403 if forbidden.
5. Call `del(pathname)` from `@vercel/blob`.
6. Return `new NextResponse(null, { status: 204 })`.

**Signature:**
```ts
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response>;
```

Note the catch-all `[...path]` so the client can `DELETE /api/images/images/<publisher>/<uuid>.png` and the prefix segment is preserved.

---

## Phase 3 — Image manager page

### 3.1 Route

**File:** `app/[publisher]/images/page.tsx`

Server component. Behavior:

1. `const { publisher: publisherSlug } = await params;` (params is a Promise — Next.js 16).
2. `resolvePublisher(publisherSlug)` → 404 if missing.
3. `requireSession()`.
4. Compute `ownerType` and `ownerId` like other publisher pages.
5. Call `canEditContent` — if false, redirect to `/${publisherSlug}`.
6. Server-side call: `list({ prefix: \`images/${publisherSlug}/\` })` from `@vercel/blob` (used directly, not via the API route — we're already on the server).
7. Pass results to a client component `<ImageManager publisherSlug={...} initialImages={...} />`.

### 3.2 Client component

**File:** `app/[publisher]/images/ImageManager.tsx` (use client)

Props:
```ts
type Props = {
  publisherSlug: string;
  initialImages: Array<{ url: string; pathname: string; size: number; uploadedAt: string }>;
};
```

UI structure:

- **Upload section** (top): file picker (accept `image/jpeg,image/png,image/gif,image/webp`), alt-text input (required client-side; disabled submit until non-empty), submit button. After upload succeeds, shows a read-only field with the Markdown snippet `![{alt}]({url})` and a "Copy" button.
- **Gallery section**: 4-column grid of thumbnails (use `<img>` for thumbnails inside the manager — `next/image` would require dimensions). Each tile has:
  - Image preview (max 200px square, `object-cover`).
  - Filename (last segment of `pathname`).
  - Upload date (formatted).
  - Size (KB).
  - "Copy URL" button.
  - "Delete" button — calls `DELETE /api/images/<pathname>` after a `confirm()` prompt. On success, removes the item from local state.
- **Empty state**: friendly message + arrow toward upload form.

State:
```ts
const [images, setImages] = useState(initialImages);
const [uploading, setUploading] = useState(false);
const [altText, setAltText] = useState("");
const [lastUploadedSnippet, setLastUploadedSnippet] = useState<string | null>(null);
```

Use themed CSS classes (`themed-input`, `themed-btn-primary`, `themed-btn-ghost`, `themed-surface`) per project convention.

### 3.3 Nav link

Add an "Images" link to the publisher's editor toolbar / sidebar wherever the existing "Articles" / "Books" / "Objects" links live. Find the file via grep for `Articles` text in `app/[publisher]/page.tsx` and update it to include `/<publisher>/images`.

---

## Phase 4 — Article editor "Insert image" button

### 4.1 New client component

**File:** `components/InsertImageButton.tsx` (use client)

Props:
```ts
type Props = {
  publisherSlug: string;
  /** ID of the <textarea> to insert into. Defaults to "content-field". */
  targetTextareaId?: string;
};
```

Behavior:
- Renders a single button labeled "Insert image" with a small icon.
- On click, opens a modal (managed locally via `useState`; no portal library).
- Modal contains:
  - A compact thumbnail grid of the publisher's existing images, fetched once on open from `GET /api/images/list?publisher=<slug>`.
  - A simple file input for quick-upload (calls `POST /api/images/upload` then refreshes the grid).
  - When the user clicks a thumbnail, the modal prompts for alt text in a text input below the grid (or uses an inline prompt). Then constructs `![{alt}]({url})` and inserts it at the cursor position of the target `<textarea>`.

Cursor-position insertion utility:

```ts
function insertAtCursor(textarea: HTMLTextAreaElement, text: string) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const next = value.slice(0, start) + text + value.slice(end);
  textarea.value = next;
  // Fire an `input` event so React/CodeMirror controlled-value mirrors update.
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  // Reposition cursor after the inserted text.
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  textarea.focus();
}
```

### 4.2 Wire it into the editor pages

Two pages need the button:

1. `app/[publisher]/articles/new/page.tsx` — above the content textarea.
2. `app/[publisher]/articles/[slug]/edit/page.tsx` — above the content textarea.

Both pages already render a `<textarea id="content">` (the edit page) and pass through `<ContentEditor>` which exposes a hidden `<input id="content-field">`. We will:

- Render `<InsertImageButton publisherSlug={publisherSlug} />` directly above the `<textarea>` or `<ContentEditor>` block.
- For the edit page, give the `<textarea>` `id="content"` (it already has it) and update the button to default to that id. For `<ContentEditor>`, since it uses CodeMirror, the simple textarea-cursor insertion will not work — instead, `<ContentEditor>` should expose an `insertText` method via `useImperativeHandle` and `<InsertImageButton>` should call it through a ref. Use the existing `ContentEditorRef` interface and extend it:

  ```ts
  export interface ContentEditorRef {
    compile: () => void;
    insertText: (text: string) => void;
  }
  ```

  Implement `insertText` by accessing the CodeMirror `EditorView` instance and dispatching a transaction. CodeMirror's `view.dispatch({ changes: { from: cursor, to: cursor, insert: text } })`.

  If `<ContentEditor>` does not currently hold the `EditorView` ref, extract it via `onCreateEditor` prop on the `CodeMirror` component (uiw-react-codemirror exposes this).

### 4.3 No new server action

This phase does not add a server action — the modal calls the existing REST endpoints from Phase 2.

---

## Phase 5 — `<ArticleImage>` MDX component

### 5.1 New component

**File:** `components/ArticleImage.tsx`

```tsx
import Image from "next/image";
import { isBlobUrl } from "@/lib/images";

type Props = {
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
  title?: string;
};

export default function ArticleImage({ src, alt, width, height, title }: Props) {
  if (!src) return null;

  const blob = isBlobUrl(src);
  const altText = alt ?? "";

  // If dimensions are known, render an intrinsic image.
  if (width && height) {
    return (
      <figure className="my-6">
        <Image
          src={src}
          alt={altText}
          width={width}
          height={height}
          unoptimized={!blob}
          className="rounded-md max-w-full h-auto shadow-sm hover:shadow-md transition-shadow"
        />
        {title ? <figcaption className="text-sm themed-secondary mt-2">{title}</figcaption> : null}
      </figure>
    );
  }

  // No dimensions — use `fill` inside a responsive container with a sensible aspect.
  return (
    <figure className="my-6">
      <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
        <Image
          src={src}
          alt={altText}
          fill
          unoptimized={!blob}
          sizes="(max-width: 768px) 100vw, 768px"
          className="rounded-md object-contain shadow-sm hover:shadow-md transition-shadow"
        />
      </div>
      {title ? <figcaption className="text-sm themed-secondary mt-2">{title}</figcaption> : null}
    </figure>
  );
}
```

Notes:
- `next/image` requires `alt`. We pass empty string when missing rather than crashing.
- `unoptimized={!blob}` — Next won't run external (non-listed) hosts through its optimizer otherwise.
- `aspectRatio: "16 / 9"` is a sensible default when dimensions are unknown. Writers who care can set `width` / `height` via HTML `<img>` tags in MDX, which already pass through the sanitizer.

### 5.2 Register it as the `img` mapping in `MDXRemote`

In two places:

**`app/[publisher]/articles/[slug]/page.tsx`** (line ~138):

```tsx
import ArticleImage from "@/components/ArticleImage";
// ...
<MDXRemote
  source={renderedBody}
  options={{ mdxOptions: { remarkPlugins: [remarkMath, remarkGfm, remarkWikilinks], rehypePlugins: [rehypeKatex] } }}
  components={{ DynamicAnimation, img: ArticleImage }}
/>
```

**`app/[publisher]/books/[bookSlug]/[chapter]/page.tsx`** (line ~121):

Same change — extend the `components` prop with `img: ArticleImage`.

### 5.3 PDF / EPUB pipeline — no changes required

`lib/pdf/render-book-html.ts` uses `rehype-stringify`, which emits plain `<img>` tags. The existing `mdxSanitizeSchema` already allows `img` with `src`, `alt`, `title`, `width`, `height`, `loading`. Playwright fetches blob URLs directly, no further work needed.

For EPUB (`lib/epub.ts`), blob URLs work over HTTPS the same way — EPUB readers download remote images. No change required.

### 5.4 `lib/mdx-sanitize.ts` — extend `src` protocol allowlist (verify)

The current schema's `protocols.src` is `["http", "https"]` — already permits Blob URLs (which are HTTPS). No change required, but verify in implementation.

---

## Phase 6 — Tests

All tests go under `tests/`. New test files:

### 6.1 `tests/api/images-upload-route.test.ts`

`// @vitest-environment node` (uses jose JWT via `requireSession`).

Mocking strategy:
- `vi.hoisted` for the `put` mock from `@vercel/blob`.
- `vi.mock("@vercel/blob", () => ({ put: mockPut, list: mockList, del: mockDel }))`.
- `vi.mock("@/lib/auth", () => ({ requireSession: mockRequireSession, getSession: mockGetSession }))`.
- `vi.mock("@/lib/publisher", () => ({ resolvePublisher: mockResolvePublisher }))`.
- `vi.mock("@/lib/roles", () => ({ canEditContent: mockCanEditContent }))`.

Test cases:

1. **Rejects unauthenticated requests** — `mockRequireSession.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });` → call `POST` → expect rethrown error.
2. **Rejects when publisher does not exist** — `mockResolvePublisher.mockResolvedValue(null)` → expect 404.
3. **Rejects when user lacks edit rights** — `mockCanEditContent.mockResolvedValue(false)` → expect 403.
4. **Rejects oversized files** — `formData.append("file", new File([new Uint8Array(6 * 1024 * 1024)], "x.png", { type: "image/png" }))` → expect 413.
5. **Rejects disallowed MIME types** — submit `text/plain` file → expect 415.
6. **Happy path** — submit a valid 1KB PNG → expect 201, JSON body with `url` and `pathname` starting with `images/<publisher>/`.

Constructing a `Request` with FormData:
```ts
const fd = new FormData();
fd.append("publisher", "alice");
fd.append("file", new File([new Uint8Array(10)], "a.png", { type: "image/png" }));
const req = new Request("http://localhost/api/images/upload", { method: "POST", body: fd });
```

### 6.2 `tests/api/images-list-route.test.ts`

Same environment and mocking pattern. Test cases:

1. Unauthenticated → throws.
2. Publisher missing → 404.
3. No edit rights → 403.
4. Happy path — `mockList.mockResolvedValue({ blobs: [...] })` → returns JSON with sorted images.
5. Empty list — returns `{ images: [] }`.

### 6.3 `tests/api/images-delete-route.test.ts`

Test cases:

1. **Path doesn't match publisher** — pass `path: ["images", "bob", "x.png"]` while resolving session for alice → 403 because `publisherFromBlobPath` yields `"bob"` and `canEditContent` is false for alice over bob's content.
2. **Invalid path shape** — `path: ["foo", "bar"]` → 400.
3. **Happy path** — valid path, valid session, `mockDel` called once with correct pathname → 204.

### 6.4 `tests/components/ArticleImage.test.tsx`

jsdom (default). Mocks:
- Mock `next/image` to render a plain `<img>` with the props it received, so we can assert on attributes:
  ```ts
  vi.mock("next/image", () => ({
    default: (props: Record<string, unknown>) => (
      // eslint-disable-next-line jsx-a11y/alt-text
      <img data-testid="next-image" data-unoptimized={String(props.unoptimized)} {...props} />
    ),
  }));
  ```

Test cases:

1. **Returns null when src is missing** — `render(<ArticleImage />)` → empty container.
2. **Blob URL with dimensions** — `<ArticleImage src="https://abc.public.blob.vercel-storage.com/x.png" alt="x" width={200} height={150} />` → asserts `data-unoptimized="false"`.
3. **External URL** — `<ArticleImage src="https://example.com/x.png" alt="x" width={200} height={150} />` → asserts `data-unoptimized="true"`.
4. **No dimensions falls back to fill container** — assert the `<figure>` contains a `relative` div with `aspect-ratio`.
5. **Title renders as figcaption** — assert `<figcaption>` appears with the title text.

### 6.5 `tests/lib/images.test.ts`

Plain unit tests for `lib/images.ts` helpers:

1. `extensionForMime("image/jpeg")` → `"jpg"`.
2. `extensionForMime("image/png")` → `"png"`.
3. `extensionForMime("application/pdf")` → `null`.
4. `publisherFromBlobPath("images/alice/uuid.png")` → `"alice"`.
5. `publisherFromBlobPath("foo/bar")` → `null`.
6. `publisherFromBlobPath("images/alice/sub/x.png")` → `null` (no nested paths).
7. `buildBlobKey("alice", "png")` → matches `^images/alice/[0-9a-f-]+\.png$`.
8. `isBlobUrl("https://abc.public.blob.vercel-storage.com/x.png")` → `true`.
9. `isBlobUrl("https://example.com/x.png")` → `false`.
10. `isBlobUrl("not-a-url")` → `false`.

---

## Implementation Order

Execute in this order. Each step should pass `npm run lint` and `npm run test:run` before moving to the next.

1. **Install `@vercel/blob`** and update `next.config.ts` `images.remotePatterns`.
2. **Update `middleware.ts` CSP** to add `https://*.public.blob.vercel-storage.com` to `img-src`.
3. **Create `lib/images.ts`** with the constants and helpers.
4. **Add Zod schemas** to `lib/validations.ts` (`uploadImageQuerySchema`, `deleteImageBodySchema`, `listImagesQuerySchema`).
5. **Write `tests/lib/images.test.ts`** and verify it passes.
6. **Implement `app/api/images/upload/route.ts`** (`POST`).
7. **Implement `app/api/images/list/route.ts`** (`GET`).
8. **Implement `app/api/images/[...path]/route.ts`** (`DELETE`).
9. **Write `tests/api/images-upload-route.test.ts`, `images-list-route.test.ts`, `images-delete-route.test.ts`** and verify all pass.
10. **Create `components/ArticleImage.tsx`** and write `tests/components/ArticleImage.test.tsx`.
11. **Wire `ArticleImage` into `MDXRemote`** on both article page and book chapter page.
12. **Build `app/[publisher]/images/page.tsx`** (server component) and `app/[publisher]/images/ImageManager.tsx` (client component).
13. **Add navigation entry** for "Images" on the publisher dashboard / sidebar.
14. **Build `components/InsertImageButton.tsx`** and the modal UI.
15. **Extend `ContentEditor` ref interface** with `insertText`, wire CodeMirror dispatch.
16. **Wire `<InsertImageButton>`** into article-new and article-edit pages, hooking up the ContentEditor ref (or plain textarea fallback).
17. **Document `BLOB_READ_WRITE_TOKEN`** in `CLAUDE.md` Environment section.
18. **Manual smoke test on local dev**: with `BLOB_READ_WRITE_TOKEN` set (via `vercel env pull`), upload an image, paste the markdown snippet, view the rendered article, delete the image, verify it's gone from `/<publisher>/images`.
19. **Commit** (no `Co-Authored-By` trailer, no `--no-verify`).

---

## Potential Pitfalls

1. **Next.js 16 `params` Promise** — every page handler must `await params`. Easy to forget on new routes.
2. **CodeMirror cursor insertion** — `<ContentEditor>` uses CodeMirror, not a plain textarea. The `insertText` method must dispatch a CodeMirror transaction, not write to a DOM textarea. Hidden `<input id="content-field">` only mirrors the editor value; writing directly to it will be overwritten on next keystroke.
3. **CSP** — adding the Blob hostname to `img-src` is required, otherwise images load on the server but get blocked in the browser. Test this in the dev server with the browser devtools console open.
4. **`next/image` `remotePatterns`** — both the CSP and `next.config.ts` need the hostname. Without `remotePatterns`, `next/image` throws at render time with "hostname not configured".
5. **`@vercel/blob` requires `BLOB_READ_WRITE_TOKEN`** — locally, this must be pulled via `vercel env pull .env.local` or the dev server will throw at upload time. Document this clearly in the Environment section.
6. **Catch-all route segment `[...path]`** — when the client calls `DELETE /api/images/images/alice/uuid.png`, the `path` array is `["images", "alice", "uuid.png"]`. Make sure to `path.join("/")` to reconstruct, and do not accept `..` segments — the regex in `deleteImageBodySchema` already enforces this.
7. **Form data parsing limit** — Next.js Route Handlers default body size is 1 MB. For 5 MB images, set:
   ```ts
   export const runtime = "nodejs";
   export const maxDuration = 30;
   ```
   on the upload route. (Vercel raises the body limit to ~4.5 MB on Hobby / 50 MB on Pro for Node runtime; the 5 MB cap may need to be reduced to 4.5 MB on Hobby. Document this trade-off.)
8. **Service worker caching** — `public/sw.js` is generated by Workbox with a `runtimeCaching` rule for image extensions. Cached blob URLs may serve stale 404s after deletion. The `CacheFirst` strategy is acceptable here (blob URLs include a content hash on Vercel side), but document that admins should clear cached images via the OfflineGuard if they delete recently.
9. **Listing performance** — `list({ prefix })` is paginated. For publishers with thousands of images, paginate. For now, the limit of 1000 is plenty; document as a known limit.
10. **No deletion of articles' inline image references** — deleting a blob breaks any `![](url)` references in articles. We do not scan / warn for this; document as known and "linkrot" is acceptable for a small wiki. A future enhancement could scan `articles.content` for the URL before deletion.
11. **`alt` is empty string when missing** — `next/image` errors out without `alt`. The `<ArticleImage>` component coerces missing alt to `""` (intentional, acceptable for decorative images).
12. **CSP `connect-src`** — uploads use the same origin (`/api/images/upload`), no change required. But future direct-to-Blob uploads via `@vercel/blob/client` would need `https://*.public.blob.vercel-storage.com` in `connect-src` — flag if scope expands.
