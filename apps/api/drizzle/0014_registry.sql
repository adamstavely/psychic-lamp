CREATE TABLE "registry_items" (
	"kind" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"version" text NOT NULL,
	"sensitivity" text NOT NULL,
	"summary" text NOT NULL,
	"owner_team" text,
	"owner_id" uuid,
	"owner_name" text NOT NULL,
	"status" text NOT NULL,
	"details" jsonb NOT NULL,
	"search_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registry_items_kind_id_pk" PRIMARY KEY("kind","id"),
	CONSTRAINT "registry_items_kind_slug" UNIQUE("kind","slug")
);
--> statement-breakpoint
ALTER TABLE "registry_items" ADD CONSTRAINT "registry_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registry_items_owner" ON "registry_items" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "registry_items_status" ON "registry_items" USING btree ("status");