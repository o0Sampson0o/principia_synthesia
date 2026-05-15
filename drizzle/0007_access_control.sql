CREATE TABLE "organizations" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "org_memberships" (
  "id" serial PRIMARY KEY NOT NULL,
  "org_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "role" text NOT NULL,
  "joined_at" timestamp DEFAULT now(),
  CONSTRAINT "org_memberships_org_id_user_id_unique" UNIQUE("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "resource_visibility" (
  "id" serial PRIMARY KEY NOT NULL,
  "resource_type" text NOT NULL,
  "resource_key" text NOT NULL,
  "is_private" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "resource_visibility_resource_type_resource_key_unique" UNIQUE("resource_type","resource_key")
);
--> statement-breakpoint
CREATE TABLE "access_grants" (
  "id" serial PRIMARY KEY NOT NULL,
  "resource_type" text NOT NULL,
  "resource_key" text NOT NULL,
  "grantee_type" text NOT NULL,
  "grantee_id" integer NOT NULL,
  "granted_at" timestamp DEFAULT now(),
  "granted_by" integer,
  CONSTRAINT "access_grants_resource_type_resource_key_grantee_type_grantee_id_unique" UNIQUE("resource_type","resource_key","grantee_type","grantee_id")
);
--> statement-breakpoint
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "resource_visibility_lookup_idx" ON "resource_visibility" ("resource_type","resource_key");
--> statement-breakpoint
CREATE INDEX "access_grants_resource_lookup_idx" ON "access_grants" ("resource_type","resource_key");
--> statement-breakpoint
CREATE INDEX "access_grants_grantee_lookup_idx" ON "access_grants" ("grantee_type","grantee_id");
--> statement-breakpoint
CREATE INDEX "org_memberships_user_idx" ON "org_memberships" ("user_id");
