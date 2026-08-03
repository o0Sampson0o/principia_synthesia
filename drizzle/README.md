# Migrations

## Layout

- `0000_baseline.sql` — the whole schema as of the rebaseline. **Never run this
  against an existing database**; it is already recorded as applied.
- `meta/` — drizzle-kit's snapshot chain. `generate` diffs `db/schema.ts`
  against the newest snapshot here.
- `_history/` — every migration applied before the rebaseline, kept as a
  historical record. Not part of the journal and never replayed.

## Adding a migration

```bash
npx drizzle-kit generate --name=what_it_does
```

Review the generated SQL, then apply it:

```bash
set -a; . ./.env.local; set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/00NN_what_it_does.sql
```

`.env.local` points at production, so read the SQL before running it. Prefer
`IF EXISTS` / `IF NOT EXISTS` so a partially-applied migration can be re-run.

## Why there was a rebaseline

The snapshot chain had drifted badly: `_journal.json` listed 12 of 23
migrations, snapshots from `0004` on were hand-written (`0004` pointed at
itself as its own parent, `0014` held a single table), and `drizzle-kit
generate` refused to run at all — so every migration from `0011` onward had to
be written by hand.

Worse, `drizzle-kit migrate` was actively unsafe: only two rows existed in
`drizzle.__drizzle_migrations`, so it would have replayed migrations `0002`
through `0014` against a live database.

The fix was to archive the old files, regenerate a single clean snapshot from
the current schema, and record that baseline in `drizzle.__drizzle_migrations`
with `created_at` equal to its journal `when`. The migrator compares
`created_at < folderMillis` (strictly), so the baseline is skipped while any
later migration still runs.

## Applying by hand vs `drizzle-kit migrate`

Both work now. Applying by hand with `psql` remains the norm here because it
makes the exact SQL hitting production reviewable. If you do use
`drizzle-kit migrate`, it will pick up from the baseline correctly — but every
migration it runs must also have been generated into the journal, so don't mix
hand-written `.sql` files into `drizzle/` without a matching `generate`.
