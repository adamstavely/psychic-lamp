CREATE TABLE "checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"chat_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"method" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_reviews" (
	"owner_id" uuid NOT NULL,
	"chat_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"review" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_reviews_owner_id_chat_id_claim_id_pk" PRIMARY KEY("owner_id","chat_id","claim_id")
);
--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_owner_id_chat_id_chats_owner_id_id_fk" FOREIGN KEY ("owner_id","chat_id") REFERENCES "public"."chats"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_reviews" ADD CONSTRAINT "claim_reviews_owner_id_chat_id_chats_owner_id_id_fk" FOREIGN KEY ("owner_id","chat_id") REFERENCES "public"."chats"("owner_id","id") ON DELETE cascade ON UPDATE no action;