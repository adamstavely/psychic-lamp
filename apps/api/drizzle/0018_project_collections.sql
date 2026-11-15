CREATE TABLE "project_collections" (
	"owner_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"collection_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_collections_owner_id_project_id_collection_id_pk" PRIMARY KEY("owner_id","project_id","collection_id")
);
--> statement-breakpoint
ALTER TABLE "project_collections" ADD CONSTRAINT "project_collections_owner_id_project_id_projects_owner_id_id_fk" FOREIGN KEY ("owner_id","project_id") REFERENCES "public"."projects"("owner_id","id") ON DELETE cascade ON UPDATE no action;