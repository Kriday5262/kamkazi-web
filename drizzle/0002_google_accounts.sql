CREATE TABLE "google_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"google_email" text DEFAULT '' NOT NULL,
	"access_token_enc" text DEFAULT '' NOT NULL,
	"refresh_token_enc" text,
	"token_expires_at" timestamp with time zone,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"selected_calendars" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_status" text DEFAULT 'pending' NOT NULL,
	"last_synced_ts" timestamp with time zone,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE INDEX "google_accounts_user_idx" ON "google_accounts" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "google_account_id" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "google_event_id" text;