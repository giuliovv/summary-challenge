import { and, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { formatZodError, topicsQuerySchema } from "@/lib/api/schemas";
import { getDb } from "@/lib/db/client";
import { analyses } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type Sentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const input = topicsQuerySchema.safeParse(Object.fromEntries(searchParams));

  if (!input.success) {
    return NextResponse.json({ error: formatZodError(input.error), code: "validation_error" }, { status: 400 });
  }

  try {
    const db = getDb();
    const whereTopicExists = and(isNotNull(analyses.topic));

    const aggregates = await db
      .select({
        topic: analyses.topic,
        count: sql<number>`count(*)::int`,
        avgSentimentScore: sql<number>`avg(${analyses.sentimentScore})::float`,
      })
      .from(analyses)
      .where(whereTopicExists)
      .groupBy(analyses.topic)
      .orderBy(sql`count(*) desc`);

    const breakdownRows = await db
      .select({
        topic: analyses.topic,
        sentiment: analyses.sentiment,
        count: sql<number>`count(*)::int`,
      })
      .from(analyses)
      .where(whereTopicExists)
      .groupBy(analyses.topic, analyses.sentiment);

    const breakdownByTopic = new Map<string, Record<Sentiment, number>>();

    for (const row of breakdownRows) {
      if (!row.topic) continue;

      const breakdown =
        breakdownByTopic.get(row.topic) ??
        ({ POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 } satisfies Record<Sentiment, number>);
      breakdown[row.sentiment] = row.count;
      breakdownByTopic.set(row.topic, breakdown);
    }

    return NextResponse.json({
      topics: aggregates.map((row) => ({
        topic: row.topic,
        count: row.count,
        avgSentimentScore: row.avgSentimentScore,
        sentiments: row.topic
          ? breakdownByTopic.get(row.topic) ?? { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 }
          : { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 },
      })),
    });
  } catch (error) {
    console.error("Topics request failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Topics request failed." },
      { status: 500 },
    );
  }
}
