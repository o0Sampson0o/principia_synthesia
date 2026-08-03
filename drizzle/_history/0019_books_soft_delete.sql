-- Soft delete for books, mirroring articles. Deleting a book stamps this
-- column; the row (and everything hanging off it via FK cascades) stays intact
-- until the bin's 30-day expiry, when the prune cron issues the real DELETE.
ALTER TABLE "books" ADD COLUMN "deleted_at" timestamp;
