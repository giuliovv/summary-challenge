import { and, desc, eq, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";

import { analyzeAndStoreArticle } from "@/lib/analyses/service";
import { getDb } from "@/lib/db/client";
import { analyses } from "@/lib/db/schema";
import { parseNewsArticle, parseTopic } from "@/lib/news/validation";
import type { NewsArticle } from "@/lib/news/types";

export const dynamic = "force-dynamic";

type Sentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

type AnalyzeRequestBody = {
  article?: Partial<NewsArticle>;
  topic?: unknown;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sentiment = parseSentiment(searchParams.get("sentiment"));
  const topic = parseTopic(searchParams.get("topic"));
  const limitParam = Number(searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;
  const filters: SQL[] = [];

  if (sentiment) {
    filters.push(eq(analyses.sentiment, sentiment));
  }

  if (topic) {
    filters.push(eq(analyses.topic, topic));
  }

  try {
    const rows = await getDb()
      .select()
      .from(analyses)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(analyses.createdAt))
      .limit(limit);

    return NextResponse.json({ analyses: rows });
  } catch (error) {
    console.error("Analyses list request failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analyses list request failed." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: AnalyzeRequestBody;

  try {
    body = (await request.json()) as AnalyzeRequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const article = parseNewsArticle(body.article);

  if (!article.ok) {
    return NextResponse.json({ error: article.error }, { status: 400 });
  }

  try {
    const result = await analyzeAndStoreArticle({
      article: article.value,
      topic: parseTopic(body.topic),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Analysis request failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis request failed." },
      { status: 500 },
    );
  }
}

function parseSentiment(value: string | null): Sentiment | null {
  if (value === "POSITIVE" || value === "NEUTRAL" || value === "NEGATIVE") {
    return value;
  }

  return null;
}
