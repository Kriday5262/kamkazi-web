CREATE TABLE "calendar_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_url" text NOT NULL,
	"name" text DEFAULT 'Subscribed calendar' NOT NULL,
	"colour" text DEFAULT 'blue' NOT NULL,
	"last_fetched_ts" timestamp with time zone,
	"last_status" text DEFAULT 'pending' NOT NULL,
	"created_at_ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "ics_uid" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "subscription_id" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "start_utc" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "recurrence_of" text;--> statement-breakpoint
ALTER TABLE "calendar_subscriptions" ADD CONSTRAINT "calendar_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_subs_user_idx" ON "calendar_subscriptions" USING btree ("user_id");