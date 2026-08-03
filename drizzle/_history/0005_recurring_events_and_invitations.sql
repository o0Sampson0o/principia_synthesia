ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "recurrence_rule" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "recurrence_until" timestamp;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_invitations" (
  "id" serial PRIMARY KEY NOT NULL,
  "org_id" integer NOT NULL,
  "email" text NOT NULL,
  "role" text NOT NULL,
  "token_hash" text NOT NULL,
  "invited_by" integer NOT NULL,
  "expires_at" timestamp NOT NULL,
  "accepted_at" timestamp,
  "created_at" timestamp DEFAULT now()
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "org_invitations" ADD CONSTRAINT "org_invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "org_invitations" ADD CONSTRAINT "org_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "org_invitations" ADD CONSTRAINT "org_invitations_org_id_email_unique" UNIQUE ("org_id", "email");
EXCEPTION WHEN duplicate_object THEN null;
END $$;
