import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import {
  check,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const sentimentEnum = pgEnum("sentiment", [
  "POSITIVE",
  "NEUTRAL",
  "NEGATIVE",
]);

export const analyses = pgTable(
  "analyses",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    topic: text("topic"),
    source: text("source").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull().unique(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    imageUrl: text("image_url"),
    description: text("description"),
    summary: text("summary").notNull(),
    sentiment: sentimentEnum("sentiment").notNull(),
    sentimentScore: real("sentiment_score").notNull(),
    rationale: text("rationale").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "analyses_sentiment_score_range",
      sql`${table.sentimentScore} >= -1 AND ${table.sentimentScore} <= 1`,
    ),
  ],
);

export type Analysis = typeof analyses.$inferSelect;
export type NewAnalysis = typeof analyses.$inferInsert;
