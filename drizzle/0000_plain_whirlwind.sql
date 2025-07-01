CREATE TYPE "public"."face_swap_status" AS ENUM('processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."credit_recharge_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."credit_transaction_type" AS ENUM('recharge', 'consumption', 'refund', 'bonus', 'subscription', 'expiration');--> statement-breakpoint
CREATE TABLE "face_swap_history" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"origin_image_url" text NOT NULL,
	"face_image_url" text NOT NULL,
	"result_image_url" text,
	"status" text DEFAULT 'processing' NOT NULL,
	"error_message" text,
	"processing_time" integer,
	"credits_consumed" integer DEFAULT 1 NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"credit_consumed" integer,
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"type" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"url" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "polar_customer" (
	"created_at" timestamp NOT NULL,
	"customer_id" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"updated_at" timestamp NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "polar_customer_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "polar_subscription" (
	"created_at" timestamp NOT NULL,
	"customer_id" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"status" text NOT NULL,
	"subscription_id" text NOT NULL,
	"updated_at" timestamp NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "polar_subscription_subscription_id_unique" UNIQUE("subscription_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_customer" (
	"created_at" timestamp NOT NULL,
	"customer_id" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"updated_at" timestamp NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "stripe_customer_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_subscription" (
	"created_at" timestamp NOT NULL,
	"customer_id" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"status" text NOT NULL,
	"subscription_id" text NOT NULL,
	"updated_at" timestamp NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "stripe_subscription_subscription_id_unique" UNIQUE("subscription_id")
);
--> statement-breakpoint
CREATE TABLE "credit_consumption_config" (
	"action_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"credits_required" integer NOT NULL,
	"description" text,
	"id" text PRIMARY KEY NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_package" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"credits" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"description" text,
	"id" text PRIMARY KEY NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"is_popular" integer DEFAULT 0,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"sort_order" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_recharge" (
	"amount" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"payment_intent_id" text,
	"payment_method" text,
	"price" integer NOT NULL,
	"status" "credit_recharge_status" NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transaction" (
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"description" text,
	"id" text PRIMARY KEY NOT NULL,
	"metadata" text,
	"related_recharge_id" text,
	"related_upload_id" text,
	"type" "credit_transaction_type" NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_credit_balance" (
	"balance" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"total_consumed" integer DEFAULT 0 NOT NULL,
	"total_recharged" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"access_token" text,
	"access_token_expires_at" timestamp,
	"account_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"id_token" text,
	"password" text,
	"provider_id" text NOT NULL,
	"refresh_token" text,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"updated_at" timestamp NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"created_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"ip_address" text,
	"token" text NOT NULL,
	"updated_at" timestamp NOT NULL,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"backup_codes" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"age" integer,
	"created_at" timestamp NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"first_name" text,
	"id" text PRIMARY KEY NOT NULL,
	"image" text,
	"last_name" text,
	"name" text NOT NULL,
	"two_factor_enabled" boolean,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"created_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"updated_at" timestamp,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "face_swap_history" ADD CONSTRAINT "face_swap_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polar_customer" ADD CONSTRAINT "polar_customer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polar_subscription" ADD CONSTRAINT "polar_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_customer" ADD CONSTRAINT "stripe_customer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_subscription" ADD CONSTRAINT "stripe_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_recharge" ADD CONSTRAINT "credit_recharge_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_related_upload_id_uploads_id_fk" FOREIGN KEY ("related_upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credit_balance" ADD CONSTRAINT "user_credit_balance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;