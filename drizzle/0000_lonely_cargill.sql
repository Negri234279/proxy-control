CREATE SCHEMA "proxy_control";
--> statement-breakpoint
CREATE TYPE "proxy_control"."cf_record_type" AS ENUM('A', 'CNAME');--> statement-breakpoint
CREATE TYPE "proxy_control"."forward_scheme" AS ENUM('http', 'https');--> statement-breakpoint
CREATE TYPE "proxy_control"."reconcile_state" AS ENUM('synced', 'drift', 'missing', 'error');--> statement-breakpoint
CREATE TYPE "proxy_control"."ssl_mode" AS ENUM('new', 'wildcard');--> statement-breakpoint
CREATE TYPE "proxy_control"."visibility" AS ENUM('public', 'private', 'unclassified');--> statement-breakpoint
CREATE TABLE "proxy_control"."domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hostname" text NOT NULL,
	"visibility" "proxy_control"."visibility" DEFAULT 'unclassified' NOT NULL,
	"forward_scheme" "proxy_control"."forward_scheme" DEFAULT 'http' NOT NULL,
	"forward_host" text,
	"forward_port" integer,
	"npm_options" jsonb DEFAULT '{"blockExploits":true,"websockets":true,"cacheAssets":true,"http2":true,"hsts":true,"forceSsl":true}'::jsonb NOT NULL,
	"custom_locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ssl_mode" "proxy_control"."ssl_mode",
	"certificate_id" integer,
	"cf_record_type" "proxy_control"."cf_record_type" DEFAULT 'A' NOT NULL,
	"cf_content" text,
	"cf_proxied" boolean DEFAULT true NOT NULL,
	"npm_proxy_id" integer,
	"cloudflare_record_id" text,
	"mikrotik_dns_id" text,
	"reconcile_state" "proxy_control"."reconcile_state" DEFAULT 'missing' NOT NULL,
	"last_reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domains_hostname_unique" UNIQUE("hostname")
);
