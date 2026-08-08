ALTER TABLE "product" RENAME COLUMN "product_type" TO "product_type_id";--> statement-breakpoint
ALTER TABLE "product" DROP CONSTRAINT "product_product_type_product_type_id_fk";
--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "stock" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_product_type_id_product_type_id_fk" FOREIGN KEY ("product_type_id") REFERENCES "public"."product_type"("id") ON DELETE no action ON UPDATE no action;