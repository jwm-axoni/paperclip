CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"signal_id" uuid,
	"client_name" text,
	"opportunity_type" text NOT NULL,
	"urgency" text DEFAULT 'this_week' NOT NULL,
	"brief" text NOT NULL,
	"suggested_actions" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" text,
	"assigned_agent_id" uuid,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source" text NOT NULL,
	"signal_type" text NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"url" text,
	"vertical" text,
	"geography" text,
	"severity" text DEFAULT 'normal' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"processed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_assigned_agent_id_agents_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunities_company_status_idx" ON "opportunities" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "opportunities_company_client_idx" ON "opportunities" USING btree ("company_id","client_name");--> statement-breakpoint
CREATE INDEX "opportunities_company_urgency_idx" ON "opportunities" USING btree ("company_id","urgency");--> statement-breakpoint
CREATE INDEX "opportunities_company_created_at_idx" ON "opportunities" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "opportunities_company_type_idx" ON "opportunities" USING btree ("company_id","opportunity_type");--> statement-breakpoint
CREATE INDEX "signals_company_processed_idx" ON "signals" USING btree ("company_id","processed");--> statement-breakpoint
CREATE INDEX "signals_company_created_at_idx" ON "signals" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "signals_company_source_idx" ON "signals" USING btree ("company_id","source");--> statement-breakpoint
CREATE INDEX "signals_company_vertical_idx" ON "signals" USING btree ("company_id","vertical");--> statement-breakpoint
CREATE INDEX "signals_company_severity_idx" ON "signals" USING btree ("company_id","severity");--> statement-breakpoint
CREATE UNIQUE INDEX "signals_url_dedup" ON "signals" USING btree ("company_id","url");