ALTER TABLE "email_verifications" ADD COLUMN "code_hash" text;--> statement-breakpoint
ALTER TABLE "email_verifications" ADD COLUMN "code_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_verifications" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;