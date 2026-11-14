CREATE TABLE "project_shares" (
	"owner_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"detail" text,
	"level" text NOT NULL,
	CONSTRAINT "project_shares_owner_id_project_id_recipient_id_pk" PRIMARY KEY("owner_id","project_id","recipient_id")
);
--> statement-breakpoint
ALTER TABLE "project_shares" ADD CONSTRAINT "project_shares_owner_id_project_id_projects_owner_id_id_fk" FOREIGN KEY ("owner_id","project_id") REFERENCES "public"."projects"("owner_id","id") ON DELETE cascade ON UPDATE no action;