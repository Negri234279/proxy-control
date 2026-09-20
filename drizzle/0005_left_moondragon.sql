ALTER TYPE "proxy_control"."domain_source" ADD VALUE 'file';--> statement-breakpoint
ALTER TABLE "proxy_control"."domains" ADD COLUMN "source_ref" text;