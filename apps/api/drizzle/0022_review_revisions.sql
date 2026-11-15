CREATE TABLE "registry_revisions" (
	"kind" text NOT NULL,
	"item_id" text NOT NULL,
	"revision" integer NOT NULL,
	"version" text NOT NULL,
	"name" text NOT NULL,
	"summary" text NOT NULL,
	"sensitivity" text NOT NULL,
	"details" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registry_revisions_kind_item_id_revision_pk" PRIMARY KEY("kind","item_id","revision")
);
--> statement-breakpoint
ALTER TABLE "registry_items" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "registry_reviews" ADD COLUMN "revision" integer;--> statement-breakpoint
ALTER TABLE "registry_reviews" ADD COLUMN "version" text;--> statement-breakpoint
ALTER TABLE "registry_revisions" ADD CONSTRAINT "registry_revisions_kind_item_id_registry_items_kind_id_fk" FOREIGN KEY ("kind","item_id") REFERENCES "public"."registry_items"("kind","id") ON DELETE cascade ON UPDATE no action;