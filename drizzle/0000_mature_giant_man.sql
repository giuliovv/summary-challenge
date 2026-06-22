CREATE TYPE "public"."sentiment" AS ENUM('POSITIVE', 'NEUTRAL', 'NEGATIVE');--> statement-breakpoint
CREATE TABLE "analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"topic" text,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"image_url" text,
	"description" text,
	"summary" text NOT NULL,
	"sentiment" "sentiment" NOT NULL,
	"sentiment_score" real NOT NULL,
	"rationale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analyses_url_unique" UNIQUE("url"),
	CONSTRAINT "analyses_sentiment_score_range" CHECK ("analyses"."sentiment_score" >= -1 AND "analyses"."sentiment_score" <= 1)
);
