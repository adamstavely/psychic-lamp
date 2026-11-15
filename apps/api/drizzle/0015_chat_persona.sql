ALTER TABLE "chats" ADD COLUMN "persona" text DEFAULT 'balanced' NOT NULL;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "knowledge" text DEFAULT 'workspace' NOT NULL;