CREATE TABLE "email_verifications" (
	"user_id" text PRIMARY KEY,
	"email" text NOT NULL,
	"verified_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
