CREATE TABLE "access_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"resource_type" text NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" integer NOT NULL,
	"resource_key" text NOT NULL,
	"grantee_type" text NOT NULL,
	"grantee_id" integer NOT NULL,
	"granted_at" timestamp DEFAULT now(),
	"granted_by" integer,
	CONSTRAINT "access_grants_resource_type_owner_type_owner_id_resource_key_grantee_type_grantee_id_unique" UNIQUE("resource_type","owner_type","owner_id","resource_key","grantee_type","grantee_id")
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "article_categories" (
	"article_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	CONSTRAINT "article_categories_article_id_category_id_unique" UNIQUE("article_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "article_citations" (
	"id" serial PRIMARY KEY NOT NULL,
	"citing_article_id" integer NOT NULL,
	"cited_article_id" integer NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "article_citations_citing_article_id_cited_article_id_unique" UNIQUE("citing_article_id","cited_article_id")
);
--> statement-breakpoint
CREATE TABLE "article_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"content_hash" text NOT NULL,
	"short_hash" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"content" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"published_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "article_snapshots_article_id_content_hash_unique" UNIQUE("article_id","content_hash")
);
--> statement-breakpoint
CREATE TABLE "article_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"viewed_at" timestamp DEFAULT now() NOT NULL,
	"referrer" text,
	"referrer_source" text,
	"session_id" text
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"draft_content" text,
	"draft_saved_at" timestamp,
	"summary" text,
	"owner_type" text NOT NULL,
	"owner_id" integer NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"parent_book_id" integer,
	"metadata" jsonb DEFAULT '{"status":"published","tags":[],"description":"","canvas":null}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"last_verified_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"forked_from_id" integer
);
--> statement-breakpoint
CREATE TABLE "book_categories" (
	"book_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	CONSTRAINT "book_categories_book_id_category_id_unique" UNIQUE("book_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "book_snapshot_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_id" integer NOT NULL,
	"article_id" integer NOT NULL,
	"article_slug" text NOT NULL,
	"article_title" text NOT NULL,
	"article_content" text,
	"position" integer NOT NULL,
	"part_title" text,
	"chapter_title" text
);
--> statement-breakpoint
CREATE TABLE "book_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_id" integer NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"owner_type" text NOT NULL,
	"owner_id" integer NOT NULL,
	"metadata" jsonb DEFAULT '{"status":"published","tags":[],"description":""}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	CONSTRAINT "books_owner_type_owner_id_slug_unique" UNIQUE("owner_type","owner_id","slug")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	"created_by_user_id" integer,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "category_bookmarks" (
	"user_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "category_bookmarks_user_id_category_id_unique" UNIQUE("user_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer,
	"book_id" integer,
	"author_id" integer,
	"guest_name" text,
	"guest_token_hash" text,
	"ip_hash" text,
	"status" text DEFAULT 'approved' NOT NULL,
	"parent_id" integer,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "comments_subject_check" CHECK ((article_id IS NULL) <> (book_id IS NULL)),
	CONSTRAINT "comments_guest_name_check" CHECK (author_id IS NOT NULL OR guest_name IS NOT NULL),
	CONSTRAINT "comments_status_values_check" CHECK (status IN ('pending', 'approved', 'spam'))
);
--> statement-breakpoint
CREATE TABLE "curriculum_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_id" integer NOT NULL,
	"article_id" integer,
	"position" integer NOT NULL,
	"part_title" text,
	"divider_level" text,
	CONSTRAINT "curriculum_entries_book_id_article_id_unique" UNIQUE("book_id","article_id")
);
--> statement-breakpoint
CREATE TABLE "event_articles" (
	"event_id" integer NOT NULL,
	"article_id" integer NOT NULL,
	CONSTRAINT "event_articles_event_id_article_id_unique" UNIQUE("event_id","article_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"event_date" timestamp NOT NULL,
	"category" text,
	"is_era_start" boolean DEFAULT false NOT NULL,
	"is_era_end" boolean DEFAULT false NOT NULL,
	"era_name" text,
	"recurrence_rule" text,
	"recurrence_until" timestamp,
	"owner_type" text NOT NULL,
	"owner_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "events_owner_type_owner_id_slug_unique" UNIQUE("owner_type","owner_id","slug")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objects" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"content" jsonb NOT NULL,
	"description" text,
	"owner_type" text NOT NULL,
	"owner_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "objects_owner_type_owner_id_slug_unique" UNIQUE("owner_type","owner_id","slug")
);
--> statement-breakpoint
CREATE TABLE "org_invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" integer NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "org_invitations_org_id_email_unique" UNIQUE("org_id","email")
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
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"creator_id" integer,
	"publisher_slug" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organizations_publisher_slug_unique" UNIQUE("publisher_slug")
);
--> statement-breakpoint
CREATE TABLE "pdf_caches" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_id" integer NOT NULL,
	"pdf_data" text NOT NULL,
	"content_hash" text NOT NULL,
	"generated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "publishers" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"kind" text NOT NULL,
	"user_id" integer,
	"org_id" integer,
	"allow_unmoderated_guests" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "publishers_slug_unique" UNIQUE("slug"),
	CONSTRAINT "publishers_kind_user_id_unique" UNIQUE("kind","user_id"),
	CONSTRAINT "publishers_kind_org_id_unique" UNIQUE("kind","org_id")
);
--> statement-breakpoint
CREATE TABLE "resource_visibility" (
	"id" serial PRIMARY KEY NOT NULL,
	"resource_type" text NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" integer NOT NULL,
	"resource_key" text NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "resource_visibility_resource_type_owner_type_owner_id_resource_key_unique" UNIQUE("resource_type","owner_type","owner_id","resource_key")
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"content" text,
	"edit_note" text,
	"edited_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_themes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"light_tokens" jsonb NOT NULL,
	"dark_tokens" jsonb NOT NULL,
	"color_scheme_preference" text DEFAULT 'system' NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_themes_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_root_admin" boolean DEFAULT false NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"publisher_slug" text DEFAULT '' NOT NULL,
	"email_verified_at" timestamp,
	"verification_token_hash" text,
	"verification_token_expires_at" timestamp,
	"onboarding_completed_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_publisher_slug_unique" UNIQUE("publisher_slug")
);
--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_categories" ADD CONSTRAINT "article_categories_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_categories" ADD CONSTRAINT "article_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_citations" ADD CONSTRAINT "article_citations_citing_article_id_articles_id_fk" FOREIGN KEY ("citing_article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_citations" ADD CONSTRAINT "article_citations_cited_article_id_articles_id_fk" FOREIGN KEY ("cited_article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_snapshots" ADD CONSTRAINT "article_snapshots_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_views" ADD CONSTRAINT "article_views_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_parent_book_id_books_id_fk" FOREIGN KEY ("parent_book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_forked_from_id_articles_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_categories" ADD CONSTRAINT "book_categories_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_categories" ADD CONSTRAINT "book_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_snapshot_entries" ADD CONSTRAINT "book_snapshot_entries_snapshot_id_book_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."book_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_snapshot_entries" ADD CONSTRAINT "book_snapshot_entries_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_snapshots" ADD CONSTRAINT "book_snapshots_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_bookmarks" ADD CONSTRAINT "category_bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_bookmarks" ADD CONSTRAINT "category_bookmarks_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_entries" ADD CONSTRAINT "curriculum_entries_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_entries" ADD CONSTRAINT "curriculum_entries_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_articles" ADD CONSTRAINT "event_articles_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_articles" ADD CONSTRAINT "event_articles_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_invitations" ADD CONSTRAINT "org_invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_invitations" ADD CONSTRAINT "org_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_caches" ADD CONSTRAINT "pdf_caches_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishers" ADD CONSTRAINT "publishers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishers" ADD CONSTRAINT "publishers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_themes" ADD CONSTRAINT "user_themes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_tokens_user_idx" ON "api_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "article_citations_citing_idx" ON "article_citations" USING btree ("citing_article_id");--> statement-breakpoint
CREATE INDEX "article_citations_cited_idx" ON "article_citations" USING btree ("cited_article_id");--> statement-breakpoint
CREATE INDEX "article_snapshots_article_idx" ON "article_snapshots" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "article_snapshots_short_hash_idx" ON "article_snapshots" USING btree ("article_id","short_hash");--> statement-breakpoint
CREATE INDEX "article_views_article_viewed_idx" ON "article_views" USING btree ("article_id","viewed_at");--> statement-breakpoint
CREATE INDEX "article_views_article_session_idx" ON "article_views" USING btree ("article_id","session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "articles_owner_slug_standalone_idx" ON "articles" USING btree ("owner_type","owner_id","slug") WHERE "articles"."parent_book_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "articles_owner_book_slug_idx" ON "articles" USING btree ("owner_type","owner_id","parent_book_id","slug") WHERE "articles"."parent_book_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "articles_owner_idx" ON "articles" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "articles_forked_from_idx" ON "articles" USING btree ("forked_from_id");--> statement-breakpoint
CREATE INDEX "books_owner_idx" ON "books" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "comments_article_idx" ON "comments" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "comments_book_idx" ON "comments" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "comments_author_idx" ON "comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "comments_status_idx" ON "comments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "events_owner_idx" ON "events" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "events_event_date_idx" ON "events" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "events_category_idx" ON "events" USING btree ("category");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "objects_owner_idx" ON "objects" USING btree ("owner_type","owner_id");