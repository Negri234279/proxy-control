CREATE TYPE "proxy_control"."edge_rule_kind" AS ENUM('waf', 'ratelimit');--> statement-breakpoint
CREATE TABLE "proxy_control"."edge_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"kind" "proxy_control"."edge_rule_kind" NOT NULL,
	"description" text NOT NULL,
	"expression" text NOT NULL,
	"action" text DEFAULT 'block' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ruleset_id" text,
	"rule_id" text,
	"orphaned_at" timestamp with time zone,
	"reconcile_state" "proxy_control"."reconcile_state" DEFAULT 'missing' NOT NULL,
	"last_reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proxy_control"."edge_rules" ADD CONSTRAINT "edge_rules_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "proxy_control"."domains"("id") ON DELETE cascade ON UPDATE no action;