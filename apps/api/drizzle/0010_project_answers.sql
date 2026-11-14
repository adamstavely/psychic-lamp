CREATE TABLE "project_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"question" text NOT NULL,
	"answer" jsonb NOT NULL,
	"sources_read" integer NOT NULL,
	"claims" jsonb,
	"checkpoint" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_answers" ADD CONSTRAINT "project_answers_owner_id_project_id_projects_owner_id_id_fk" FOREIGN KEY ("owner_id","project_id") REFERENCES "public"."projects"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_answers_project_at" ON "project_answers" USING btree ("owner_id","project_id","at");