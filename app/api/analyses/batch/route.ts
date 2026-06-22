import { NextResponse } from "next/server";

import { analyzeAndStoreArticle, BATCH_ANALYSIS_LIMIT } from "@/lib/analyses/service";
import { getDb } from "@/lib/db/client";
import type { NewsArticle } from "@/lib/news/types";
import { parseNewsArticle, parseTopic } from "@/lib/news/validation";

export const dynamic = "force-dynamic";

type BatchAnalyzeRequestBody = {
  topic?: unknown;
  articles?: Partial<NewsArticle>[];
};

export async function POST(request: Request) {
  let body: BatchAnalyzeRequestBody;

  try {
    body = (await request.json()) as BatchAnalyzeRequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const topic = parseTopic(body.topic);

  if (!topic) {
    return NextResponse.json({ error: "topic is required for batch analysis." }, { status: 400 });
  }

  if (!Array.isArray(body.articles)) {
    return NextResponse.json({ error: "articles must be an array." }, { status: 400 });
  }

  const cappedArticles = body.articles.slice(0, BATCH_ANALYSIS_LIMIT);
  const parsedArticles: NewsArticle[] = [];

  for (const [index, article] of cappedArticles.entries()) {
    const parsed = parseNewsArticle(article);

    if (!parsed.ok) {
      return NextResponse.json(
        { error: `articles[${index}]: ${parsed.error}` },
        { status: 400 },
      );
    }

    parsedArticles.push(parsed.value);
  }

  try {
    const db = getDb();
    const results = [];

    for (const article of parsedArticles) {
      results.push(await analyzeAndStoreArticle({ article, topic, db }));
    }

    return NextResponse.json({
      topic,
      requested: body.articles.length,
      analyzed: results.length,
      limit: BATCH_ANALYSIS_LIMIT,
      results,
    });
  } catch (error) {
    console.error("Batch analysis request failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Batch analysis request failed." },
      { status: 500 },
    );
  }
}
