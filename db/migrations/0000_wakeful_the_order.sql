CREATE TYPE "public"."circle_status" AS ENUM('forming', 'active', 'completed', 'broken');--> statement-breakpoint
CREATE TYPE "public"."contribution_status" AS ENUM('pending', 'confirmed', 'failed', 'late', 'missed');--> statement-breakpoint
CREATE TYPE "public"."frequency" AS ENUM('daily', 'weekly', 'biweekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('active', 'defaulted', 'left');--> statement-breakpoint
CREATE TYPE "public"."reputation_kind" AS ENUM('paid_on_time', 'paid_late', 'missed');--> statement-breakpoint
CREATE TYPE "public"."round_status" AS ENUM('upcoming', 'open', 'settling', 'complete');--> statement-breakpoint
CREATE TYPE "public"."token" AS ENUM('USDT_POLYGON', 'NIM');--> statement-breakpoint
CREATE TABLE "circles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"token" "token" DEFAULT 'USDT_POLYGON' NOT NULL,
	"contribution_amount" bigint NOT NULL,
	"frequency" "frequency" NOT NULL,
	"size" integer NOT NULL,
	"status" "circle_status" DEFAULT 'forming' NOT NULL,
	"creator_address" text NOT NULL,
	"invite_code" text NOT NULL,
	"starts_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"amount" bigint NOT NULL,
	"tx_hash" text,
	"block_number" bigint,
	"status" "contribution_status" DEFAULT 'pending' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"address" text NOT NULL,
	"payout_position" integer,
	"status" "member_status" DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reputation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"circle_id" uuid,
	"round_id" uuid,
	"kind" "reputation_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"recipient_address" text NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" "round_status" DEFAULT 'upcoming' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"address" text PRIMARY KEY NOT NULL,
	"nim_address" text,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_creator_address_users_address_fk" FOREIGN KEY ("creator_address") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_address_users_address_fk" FOREIGN KEY ("address") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "circles_invite_code_idx" ON "circles" USING btree ("invite_code");--> statement-breakpoint
CREATE UNIQUE INDEX "contributions_round_from_idx" ON "contributions" USING btree ("round_id","from_address");--> statement-breakpoint
CREATE UNIQUE INDEX "contributions_tx_hash_idx" ON "contributions" USING btree ("tx_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "members_circle_address_idx" ON "members" USING btree ("circle_id","address");--> statement-breakpoint
CREATE INDEX "members_address_idx" ON "members" USING btree ("address");--> statement-breakpoint
CREATE INDEX "reputation_address_idx" ON "reputation_events" USING btree ("address");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_circle_index_idx" ON "rounds" USING btree ("circle_id","index");