ALTER TABLE "messages" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_request" UNIQUE("owner_id","chat_id","request_id");