# Comments Plan — Article & Book-Level Commenting, Open to Everyone

Goal: let **any visitor** comment on articles (and book chapters) and on books as a
whole, without requiring a GitHub account or any account at all — while keeping
spam manageable. This turns article/book pages into proper blog-style pages.

## Research summary (2026-07)

Options evaluated for "no-account-required" commenting:

| Option | Anonymous? | Runs where | Verdict |
|---|---|---|---|
| Giscus / Utterances | ❌ GitHub login required | GitHub Discussions/Issues | Rejected by requirement |
| **Remark42** (Go, BoltDB) | ✅ anonymous + optional social login, built-in spam tools | Needs its own long-running server (Docker) | Best off-the-shelf, but we deploy on Vercel — would need a separate VPS/Fly host, iframe embed, data outside our Postgres |
| **Comentario 3** (Go + Postgres) | ✅ anonymous, Akismet/Perspective hooks | Separate server + Postgres | Same hosting problem as Remark42 |
| Isso (Python + SQLite) | ✅ anonymous | Separate server | Minimal features, same hosting problem |
| Cusdis | ✅ no sign-in | Hosted or self-host | Early-stage, no spam filter (manual moderation only) |
| Coral Talk / Discourse / Talkyard | ✅ | Heavy servers (MongoDB/JVM/Rails) | Overkill |
| **Build in-app** | ✅ we control it | Our existing Next.js + Neon Postgres | **Recommended** |

**Recommendation: build in-app.** Decisive factors:

1. **We already have 80% of it.** Commit `d804205` shipped a comments scaffold that
   was never wired into any page: `article_comments` table (threaded,
   soft-delete, migration `0014`), server actions
   (`app/[publisher]/articles/[slug]/comments/actions.ts` — create/edit/delete with
   ownership + `canView` checks), and `components/CommentThread.tsx` +
   `CommentForm.tsx`. It currently requires a session; the work is *generalizing*
   it, not building from scratch.
2. Every external option that supports anonymous comments needs a long-running
   server — a second deployment target, iframe embeds, and comment data outside
   our database. In-app keeps comments in Neon, styled by our design system,
   moderated by our existing roles (`canEditContent`), SSR-rendered (SEO-visible).
3. Anonymous spam control is a solved layering problem (see below) and the repo
   already has `lib/rate-limit.ts`.

**Anti-spam layering** (industry consensus, cheapest-first):
honeypot field → Cloudflare Turnstile (free, invisible, no user account needed)
→ per-IP rate limiting → guest comments enter a **moderation queue** by default
→ (later, optional) Akismet/AI classification.

---

## Phase 1 — Schema: guests + book subjects

Migration `0021_comments_guests_and_books.sql`. No production users yet, so plain
`ALTER`s are fine (**ask before running against Neon** per project convention).

Rename/extend `article_comments` → `comments`:

- `article_id` → make **nullable**
- add `book_id integer REFERENCES books(id) ON DELETE CASCADE`, nullable
- add `CHECK ((article_id IS NULL) <> (book_id IS NULL))` — exactly one subject.
  (Chapters **are** articles via `curriculum_entries`, so chapter comments reuse
  `article_id`; only whole-book discussion needs `book_id`.)
- `author_id` → make **nullable** (null = guest)
- add `guest_name text` — display name typed by the guest (required when
  `author_id IS NULL`, via CHECK)
- add `guest_token text` — random cookie token minted on first guest comment;
  lets a guest edit/delete their own comment during the session
- add `ip_hash text` — SHA-256(ip + server salt), for rate limiting & mod tools;
  never store the raw IP
- add `status text NOT NULL DEFAULT 'approved'` with CHECK in
  (`pending`, `approved`, `spam`) — logged-in users post as `approved`,
  guests as `pending` (or `approved` if the publisher opts in, Phase 4)
- indexes: `(book_id)`, `(status)`

Drizzle: update `db/schema.ts` (`articleComments` → `comments`), fix imports
(`components/CommentThread.tsx`, seeders).

## Phase 2 — Server actions: guest path + spam layers

Rework `comments/actions.ts` (move to `app/[publisher]/comments/actions.ts` since
it now serves articles, chapters, and books):

- `createComment`: `getSession()` instead of `requireSession()`.
  - **Logged-in**: as today → `status: approved`.
  - **Guest**: require `guestName` (2–50 chars, zod in `lib/validations.ts`) +
    Turnstile token; verify server-side against
    `https://challenges.cloudflare.com/turnstile/v0/siteverify`
    (env: `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`; skip verification when
    unset so dev/tests work). Check honeypot field (`website` input, must be
    empty). Rate-limit `comment:<ipHash>` — 3/min and 20/day via
    `lib/rate-limit.ts`. Insert `status: pending`, set `ps_guest` httpOnly
    cookie with the minted `guest_token`.
  - Subject resolution: accept `{ articleSlug }` **or** `{ bookSlug }`;
    keep the existing `canView` gate (public content only, in practice).
- `editComment` / `deleteComment`: allow when session user is author **or**
  `guest_token` cookie matches **or** `canEditContent` (editor). Guests can only
  edit within 15 minutes (avoid stale-cookie abuse).
- New `moderateComment(commentId, status)`: editor-only; approve / mark-spam.
- Body limits: max 5,000 chars; render as plain text with linebreaks (no
  markdown initially — markdown in guest content is an XSS/abuse surface; can
  add later through the existing sanitize pipeline).

## Phase 3 — UI wiring

- **`CommentThread`** (exists, orphaned): generalize props to
  `subject: { articleId } | { bookId }`; render `status: pending` comments only
  to their own guest (via cookie) and to editors, with a "awaiting moderation"
  badge; deleted → "Comment removed" placeholder (already designed).
- **`CommentForm`** (exists): when no session, show a compact
  "Comment as guest" variant — name field, body, invisible Turnstile widget
  (`@marsidev/react-turnstile` or the plain script tag), honeypot input
  (`.sr-only`, `tabindex=-1`, `autocomplete=off`).
- Mount points:
  - `app/[publisher]/articles/[slug]/page.tsx` — below citations/footer.
  - `app/[publisher]/books/[bookSlug]/[chapter]/page.tsx` — per-chapter thread
    (same `articleId` mechanism).
  - `app/[publisher]/books/[bookSlug]/page.tsx` (book landing) and/or books
    index — book-level thread via `bookId`.
- Collapse threads by default under a "Discussion (N)" heading so long comment
  lists don't fight the reading experience; server-render the list (SEO).
- Design pass per redesign workflow (fresh `frontend-design` brief, then wire).

## Phase 4 — Moderation & notifications

- **Moderation queue**: `app/[publisher]/comments/page.tsx` (editor-only) —
  pending list with approve / spam / delete; bulk actions; filter by subject.
- **Publisher setting** `allowUnmoderatedGuests boolean` (on `publishers`):
  when true, guests post straight to `approved` (still Turnstile + rate-limited).
- **Notifications**: reuse the existing `notifications` table — notify the
  publisher's editors on new pending comments, and comment authors (logged-in
  only) on replies.

## Phase 5 — Tests & hardening

- `tests/actions/comments.test.ts`: guest create (honeypot trip, Turnstile
  bypass in test env, rate-limit exceeded, pending status), logged-in create,
  edit/delete authorization matrix (author / guest-cookie / editor / stranger),
  book vs article subject checks, moderation transitions.
- `tests/lib/` for any new helpers (ip-hash, turnstile verify wrapper).
- Verify no `pending`/`spam` leakage in any public query (grep all selects).
- Seeder: extend with sample guest + threaded comments in both subjects.

## Explicitly out of scope (for now)

- Markdown/rich text in comments, reactions/votes, email-subscription for
  guests, Akismet integration, real-time updates. All are additive later.

## Env additions

```
TURNSTILE_SITE_KEY=      # public
TURNSTILE_SECRET_KEY=    # server
COMMENT_IP_SALT=         # random string for ip_hash
```
