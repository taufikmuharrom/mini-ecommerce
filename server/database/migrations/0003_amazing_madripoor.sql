ALTER TABLE "product_type" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "product_type" ADD CONSTRAINT "product_type_slug_unique" UNIQUE("slug");