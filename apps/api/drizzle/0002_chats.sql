CREATE TABLE "chats" (
	"owner_id" uuid NOT NULL,
	"id" text NOT NULL,
	"title" text NOT NULL,
	"project" text,
	"sensitivity" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"calibrated" boolean DEFAULT false NOT NULL,
	"intent" jsonb,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chats_owner_id_id_pk" PRIMARY KEY("owner_id","id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"chat_id" text NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"body" jsonb NOT NULL,
	"vote" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_chat_seq" UNIQUE("owner_id","chat_id","seq")
);
--> statement-breakpoint
CREATE TABLE "user_seeds" (
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_seeds_user_id_name_pk" PRIMARY KEY("user_id","name")
);
--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_owner_id_chat_id_chats_owner_id_id_fk" FOREIGN KEY ("owner_id","chat_id") REFERENCES "public"."chats"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_seeds" ADD CONSTRAINT "user_seeds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chats_owner_updated" ON "chats" USING btree ("owner_id","updated_at");