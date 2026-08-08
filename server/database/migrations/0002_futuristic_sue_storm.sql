ALTER TABLE "product" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_slug_unique" UNIQUE("slug");