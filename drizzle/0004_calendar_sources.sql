-- Stage 5.6 — calendar_sources registry: per-calendar display name + colour.
CREATE TABLE "calendar_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_type" text NOT NULL,
	"account_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"colour" text DEFAULT 'blue' NOT NULL,
	"custom_name" boolean DEFAULT false NOT NULL,
	"created_at_ts" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_sources" ADD CONSTRAINT "calendar_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint
CREATE INDEX "calendar_sources_user_idx" ON "calendar_sources" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_sources_key_idx" ON "calendar_sources" USING btree ("user_id","source_type","account_id","calendar_id");