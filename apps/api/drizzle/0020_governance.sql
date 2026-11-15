CREATE TABLE "governance_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registry_reviews" (
	"kind" text NOT NULL,
	"item_id" text NOT NULL,
	"round" integer NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"reviewer_name" text NOT NULL,
	"decision" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registry_reviews_kind_item_id_round_reviewer_id_pk" PRIMARY KEY("kind","item_id","round","reviewer_id")
);
--> statement-breakpoint
ALTER TABLE "registry_items" ADD COLUMN "review_round" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "registry_reviews" ADD CONSTRAINT "registry_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_reviews" ADD CONSTRAINT "registry_reviews_kind_item_id_registry_items_kind_id_fk" FOREIGN KEY ("kind","item_id") REFERENCES "public"."registry_items"("kind","id") ON DELETE cascade ON UPDATE no action;