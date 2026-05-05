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
   JWT_SECRET=your-secret-key-here
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
│   ├── [slug]/                   # Dynamic article pages
│   ├── admin/                    # Admin section (protected)
│   │   ├── articles/             # Article CRUD
│   │   └── curriculum/          # Curriculum management
│   ├── api/auth/logout/         # Logout endpoint
│   ├── category/                 # Category pages
│   ├── curriculum/               # Book/curriculum views
│   └── search/                  # Search functionality
├── components/                   # React components
│   ├── animations/              # Physics simulation components
│   ├── ContentEditor.tsx         # MDX editor with preview
│   └── Nav.tsx                  # Navigation bar
├── db/                          # Database layer
│   ├── schema.ts                # Drizzle ORM schema
│   └── seed.ts                  # Database seed script
├── lib/                         # Utilities
│   ├── auth.ts                  # Authentication utilities
│   └── remark-wikilinks.ts      # Wikilinks remark plugin
└── public/                      # Static assets
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

Physics animations can be embedded directly in articles using MDX:

```markdown
# Pendulum Motion

Here's a simple pendulum:

<PendulumSim length={2} gravity={9.81} initialAngle={45} />

And here's a chaotic double pendulum:

<DoublePendulumSim />
```

Available animations:
- `<PendulumSim />` - Single pendulum simulation
- `<DoublePendulumSim />` - Chaotic double pendulum
- `<OrbitSim />` - N-body gravitational simulation

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

- **users**: Admin users with email and password hash
- **articles**: Main content with slug, title, content (MDX), summary
- **categories**: Hierarchical categories (with parentId support)
- **article_categories**: Many-to-many relationship between articles and categories
- **revisions**: Article revision history
- **curriculum_entries**: Ordered entries linking articles to books

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run seed` - Seed database with admin user
- `npx drizzle-kit generate` - Generate database migrations
- `npx drizzle-kit migrate` - Run database migrations
- `npx drizzle-kit studio` - Open Drizzle Studio

## License

MIT
