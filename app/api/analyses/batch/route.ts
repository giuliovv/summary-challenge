import { NextResponse } from "next/server";

import { analyzeAndStoreArticle, BATCH_ANALYSIS_LIMIT } from "@/lib/analyses/service";
import { batchAnalysisPostSchema, formatZodError } from "@/lib/api/schemas";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let json: unknown;

  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON.", code: "validation_error" }, { status: 400 });
  }

  const input = batchAnalysisPostSchema.safeParse(json);

  if (!input.success) {
    return NextResponse.json({ error: formatZodError(input.error), code: "validation_error" }, { status: 400 });
  }

  const cappedArticles = input.data.articles.slice(0, BATCH_ANALYSIS_LIMIT);

  try {
    const db = getDb();
    const results = [];

    for (const article of cappedArticles) {
      results.push(await analyzeAndStoreArticle({ article, topic: input.data.topic, db }));
    }

    return NextResponse.json({
      topic: input.data.topic,
      requested: input.data.articles.length,
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
