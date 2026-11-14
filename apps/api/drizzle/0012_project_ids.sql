ALTER TABLE "artifacts" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "project_id" text;--> statement-breakpoint
-- Link what was filed by name to the project with that name, where the owner has exactly one; an ambiguous name
-- (two projects called the same) is left unlinked rather than guessed.
UPDATE "artifacts" a SET "project_id" = p."id" FROM "projects" p
  WHERE p."owner_id" = a."owner_id" AND p."name" = a."project"
  AND (SELECT count(*) FROM "projects" d WHERE d."owner_id" = a."owner_id" AND d."name" = a."project") = 1;--> statement-breakpoint
UPDATE "chats" c SET "project_id" = p."id" FROM "projects" p
  WHERE p."owner_id" = c."owner_id" AND p."name" = c."project"
  AND (SELECT count(*) FROM "projects" d WHERE d."owner_id" = c."owner_id" AND d."name" = c."project") = 1;--> statement-breakpoint
UPDATE "artifacts" SET "project" = NULL WHERE "project_id" IS NULL;--> statement-breakpoint
UPDATE "chats" SET "project" = NULL WHERE "project_id" IS NULL;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_owner_id_project_id_projects_owner_id_id_fk" FOREIGN KEY ("owner_id","project_id") REFERENCES "public"."projects"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_owner_id_project_id_projects_owner_id_id_fk" FOREIGN KEY ("owner_id","project_id") REFERENCES "public"."projects"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_owner_project" ON "artifacts" USING btree ("owner_id","project_id");