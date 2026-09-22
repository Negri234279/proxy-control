ALTER TABLE "proxy_control"."domains" ADD COLUMN "dns_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "proxy_control"."domains" ADD COLUMN "dns_target" text;