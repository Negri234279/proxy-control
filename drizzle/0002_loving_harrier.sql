CREATE TYPE "proxy_control"."dns_provider_scope" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TABLE "proxy_control"."dns_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"scope" "proxy_control"."dns_provider_scope" NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proxy_control"."domains" ADD COLUMN "dns_provider_id" uuid;--> statement-breakpoint
ALTER TABLE "proxy_control"."domains" ADD COLUMN "cf_zone_id" text;--> statement-breakpoint
ALTER TABLE "proxy_control"."domains" ADD COLUMN "cf_zone_name" text;--> statement-breakpoint
ALTER TABLE "proxy_control"."domains" ADD CONSTRAINT "domains_dns_provider_id_dns_providers_id_fk" FOREIGN KEY ("dns_provider_id") REFERENCES "proxy_control"."dns_providers"("id") ON DELETE set null ON UPDATE no action;