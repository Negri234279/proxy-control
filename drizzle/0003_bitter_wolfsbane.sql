CREATE TYPE "proxy_control"."domain_source" AS ENUM('manual', 'docker');--> statement-breakpoint
ALTER TABLE "proxy_control"."domains" ADD COLUMN "source" "proxy_control"."domain_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "proxy_control"."domains" ADD COLUMN "docker_container_id" text;--> statement-breakpoint
ALTER TABLE "proxy_control"."domains" ADD COLUMN "orphaned_at" timestamp with time zone;