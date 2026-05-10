# Principia Synthesia

A personal textbook of everything — built one article at a time.

Principia Synthesia is a personal knowledge base / wiki application built with Next.js, TypeScript, and PostgreSQL. It supports MDX articles with math (KaTeX), interactive physics animations, curriculum/book organization, and category tagging.

## Features

- **Article Management**: Create, edit, and organize articles written in MDX
- **Live Preview**: Split-pane editor with real-time MDX preview
- **Math Support**: Full LaTeX/KaTeX rendering for mathematical notation
- **Wikilinks**: Use `[[article-slug]]` or `[[article-slug|Display Text]]` syntax for internal links
- **Curriculum/Books**: Organize articles into ordered books with section headings
- **Categories**: Tag articles with categories, browse by category
- **Physics Animations**: Interactive Canvas-based simulations (pendulum, double pendulum, N-body orbits) that can be embedded directly in articles
- **Revision History**: Automatic revision tracking with ability to view and restore previous versions
- **Search**: Search across article titles, content, and summaries
- **Authentication**: JWT-based admin authentication with bcrypt password hashing
- **Theming**: Per-user CSS variable theme system (15 tokens × light/dark) with a live editor and preset palettes

## Architecture Overview

Key design decisions for developers extending the system:

- **Animation iframe sandboxing**: Animation code is stored as a JavaScript string in the DB. The `GET /api/animations/[slug]` route wraps it in a self-contained HTML page with a `<canvas>` and a `window.theme` object. This iframe has no access to the parent page's DOM or CSS — the current color tokens are encoded into the `?theme=` query parameter by the client before the iframe loads, then injected as `window.theme` in the page script.

- **Implicit book model**: There is no `books` database table. A "book" is implicitly defined by all `curriculumEntries` rows that share the same `bookSlug`. Creating the first entry for a slug creates the book; deleting all entries for a slug deletes it. The `bookTitle` is denormalized onto every entry.

- **Category auto-creation**: Categories do not need to be pre-created. When an article is saved with a comma-separated list of category slugs, `setArticleCategories()` inserts any slugs that don't exist yet (using the slug as the initial name), then atomically replaces all category links for that article.

- **Theme CSS variable injection**: The root layout reads the logged-in user's saved theme from the `userThemes` table and injects a `<style>` block of CSS custom properties (`--background`, `--primary-btn`, etc.) into `<head>` on every request. Tailwind utility classes prefixed with `themed-` (e.g. `themed-btn-primary`, `themed-input`) consume these variables. When no user is logged in, the built-in zinc-based defaults are used.

- **Wikilink syntax**: The custom `remarkWikilinks` plugin processes `[[slug]]`, `[[slug|Label]]`, `[[book:slug]]`, and `[[anim:slug]]` syntax in MDX content, transforming them into standard `<a>` tags pointing at the correct routes before the MDX is rendered server-side.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Styling**: Tailwind CSS 4
- **Editor**: CodeMirror with MDX support
- **Math**: KaTeX via remark-math and rehype-katex
- **Auth**: jose (JWT) + bcryptjs
- **Validation**: Zod

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/o0Sampson0o/principia_synthesia.git
   cd principia-synthesia
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env.local` file in the root directory:
   ```
   DATABASE_URL=postgresql://user:password@localhost:5432/principia_synthesia
   AUTH_SECRET=your-secret-key-here
   ```

4. Run database migrations:
   ```bash
   npx drizzle-kit migrate
   ```

5. Seed the database with an admin user:
   ```bash
   npm run seed
   ```
   This creates an admin user with email `admin@example.com` and password `<redacted>`.

6. Start the development server:
   ```bash
   npm run dev
   ```

7. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
principia-synthesia/
├── app/                          # Next.js App Router pages
│   ├── [slug]/                   # Public article view
│   ├── admin/                    # Admin section (protected by middleware)
│   │   ├── actions.ts            # All server-side mutations
│   │   ├── animations/           # Animation list / create / edit
│   │   ├── articles/[slug]/edit/ # Article edit form, revision restore, delete
│   │   ├── articles/new/         # New article form
│   │   └── curriculum/           # Book management UI
│   ├── animations/               # Public animations list and detail pages
│   ├── api/
│   │   ├── animations/[slug]/    # GET: serve animation HTML; DELETE: remove
│   │   ├── auth/logout/          # POST: clear session cookie
│   │   └── themes/[slug]/        # GET: serve per-user theme CSS
│   ├── category/                 # Category browse pages
│   ├── curriculum/               # Book table of contents and per-book article views
│   ├── login/                    # Login page and action
│   ├── search/                   # Full-text search
│   ├── settings/theme/           # Theme editor UI and save action
│   └── sitemap.ts                # Next.js sitemap generator
├── components/                   # Shared React components
│   ├── animations/               # Legacy animation stubs (all animations now via DB)
│   ├── AnimationCard.tsx         # Animation list card
│   ├── AnimationPreview.tsx      # Standalone animation preview (client)
│   ├── ContentEditor.tsx         # Split-pane MDX editor with live preview
│   ├── DynamicAnimation.tsx      # MDX-embeddable animation iframe wrapper
│   ├── Nav.tsx                   # Site navigation bar
│   ├── Preview.tsx               # MDX preview renderer (fast + full MDX modes)
│   └── Pagination.tsx            # Pagination component
├── db/                           # Database layer
│   ├── index.ts                  # Drizzle client (postgres driver)
│   ├── schema.ts                 # All table definitions + ThemeTokens type
│   └── seed.ts                   # Seed admin user script
├── lib/                          # Shared utilities
│   ├── auth.ts                   # bcrypt + JWT helpers, session cookie read/write
│   ├── remark-wikilinks.ts       # Custom remark plugin for [[wikilink]] syntax
│   ├── theme.ts                  # Token defaults, presets, buildThemeStyle()
│   ├── useAnimationSrc.ts        # buildAnimationSrc() + useAnimationSrc() hook
│   └── validations.ts            # Zod schemas for all server action inputs
├── middleware.ts                 # JWT auth gate for /admin/**
└── tests/                        # Vitest test suite (91 tests across 7 files)
```

## Usage

### Creating Articles

1. Sign in as admin
2. Navigate to "New Article" from the navigation
3. Fill in title, slug, summary, and content (MDX format)
4. Add categories using the category input
5. Use the live preview to see your changes
6. Save the article

### Using Wikilinks

In your MDX content, use double brackets to link to other articles:

```markdown
Check out my article on [[quantum-mechanics]] for more details.

Or with custom display text: [[quantum-mechanics|Quantum Mechanics 101]]
```

Link to curriculum books:

```markdown
See the full curriculum: [[book:physics|Physics Textbook]]
```

### Embedding Animations

Animations are created in the admin panel at `/admin/animations` and stored in
the database. Each animation has a unique slug. Embed one in an article with:

```markdown
<DynamicAnimation slug="your-animation-slug" />
```

The component renders a sandboxed `<iframe>` pointing at
`/api/animations/[slug]`. The current page's color tokens are forwarded to the
iframe so the animation can access them via `window.theme.background`,
`window.theme.foreground`, etc. See `docs/animations.md` for the full authoring
guide including all available `window.theme` tokens.

### Organizing Curriculum

1. Go to Admin → Curriculum
2. Create a new book (provide slug and title)
3. Add articles to the book with position numbers
4. Optionally add part titles for section headings
5. View the book at `/curriculum/book-slug`
6. Navigate articles with prev/next links when viewing from a curriculum context

### Managing Categories

- Add categories when creating/editing articles
- Browse all categories at `/category`
- View articles in a category at `/category/category-slug`

## Database Schema

- **users**: Admin users with email and bcrypt password hash
- **articles**: Main content with slug, title, content (MDX), summary
- **categories**: Flat category taxonomy (parentId column available for nesting)
- **article_categories**: Many-to-many join between articles and categories
- **revisions**: Article revision history; a new row is saved before every update and restore
- **curriculum_entries**: Ordered entries linking articles to books (books have no dedicated table — they are implied by a shared `bookSlug`)
- **saved_animations**: Canvas animation code stored as JS strings, served via the API route
- **user_themes**: Per-user light/dark token sets stored as JSONB

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run seed` - Seed database with admin user
- `npx drizzle-kit generate` - Generate database migrations
- `npx drizzle-kit migrate` - Run database migrations
- `npx drizzle-kit studio` - Open Drizzle Studio

## Testing

The project uses **Vitest** with 91 tests across 7 files.

```bash
npm test          # run in watch mode (development)
npm run test:run  # run once and exit (CI)
```

Test files live in `tests/`:

| File | What it covers |
|---|---|
| `tests/lib/auth.test.ts` | bcrypt hashing, JWT sign/verify, `getSession()` |
| `tests/lib/remark-wikilinks.test.ts` | All `[[wikilink]]` syntax variants |
| `tests/lib/theme.test.ts` | `buildThemeStyle()`, `defaultThemeStyle()` |
| `tests/lib/useAnimationSrc.test.ts` | `buildAnimationSrc()`, `useAnimationSrc` hook |
| `tests/api/animations-route.test.ts` | `GET /api/animations/[slug]` HTML generation |
| `tests/middleware.test.ts` | Admin route JWT auth gate |
| `tests/actions/admin-actions.test.ts` | Server actions: create/update/delete article, animations |

**Environment notes**: Tests that use `jose` JWT signing must declare
`// @vitest-environment node` to avoid a jsdom cross-realm `Uint8Array`
issue. Mock variables used inside `vi.mock()` factories must be initialised
with `vi.hoisted()`.

## License

MIT
