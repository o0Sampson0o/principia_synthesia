CREATE TABLE "pdf_caches" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_slug" text NOT NULL,
	"pdf_data" text NOT NULL,
	"content_hash" text NOT NULL,
	"generated_at" timestamp DEFAULT now()
);
