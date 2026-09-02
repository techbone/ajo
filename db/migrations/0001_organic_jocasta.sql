CREATE TABLE "auth_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
