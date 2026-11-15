CREATE TABLE "registry_installs" (
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"item_id" text NOT NULL,
	"client" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registry_installs_owner_id_kind_item_id_client_pk" PRIMARY KEY("owner_id","kind","item_id","client")
);
--> statement-breakpoint
ALTER TABLE "registry_installs" ADD CONSTRAINT "registry_installs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_installs" ADD CONSTRAINT "registry_installs_kind_item_id_registry_items_kind_id_fk" FOREIGN KEY ("kind","item_id") REFERENCES "public"."registry_items"("kind","id") ON DELETE cascade ON UPDATE no action;