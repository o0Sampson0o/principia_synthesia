ALTER TABLE "saved_animations" ADD COLUMN IF NOT EXISTS "source" text;
--> statement-breakpoint
ALTER TABLE "saved_animations" ADD COLUMN IF NOT EXISTS "plugin_meta" jsonb;
