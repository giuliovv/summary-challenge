import { eq } from "drizzle-orm";

import { analyzeArticle } from "@/lib/ai/openai";
import { getDb } from "@/lib/db/client";
import { analyses, type Analysis } from "@/lib/db/schema";
import type { NewsArticle } from "@/lib/news/types";

export const BATCH_ANALYSIS_LIMIT = 5;

type Database = ReturnType<typeof getDb>;

export type StoredAnalysisResult = {
  analysis: Analysis;
  cached: boolean;
};

export async function analyzeAndStoreArticle({
  article,
  topic,
  db = getDb(),
}: {
  article: NewsArticle;
  topic: string | null;
  db?: Database;
}): Promise<StoredAnalysisResult> {
  const existing = await findAnalysisByUrl(db, article.url);

  if (existing) {
    return { analysis: existing, cached: true };
  }

  const ai = await analyzeArticle(article);
  const [inserted] = await db
    .insert(analyses)
    .values({
      topic,
      source: article.source,
      title: article.title,
      url: article.url,
      publishedAt: new Date(article.publishedAt),
      imageUrl: article.imageUrl,
      description: article.description,
      summary: ai.summary,
      sentiment: ai.sentiment,
      sentimentScore: ai.sentimentScore,
      rationale: ai.rationale,
    })
    .onConflictDoNothing({ target: analyses.url })
    .returning();

  if (inserted) {
    return { analysis: inserted, cached: false };
  }

  const racedExisting = await findAnalysisByUrl(db, article.url);

  if (racedExisting) {
    return { analysis: racedExisting, cached: true };
  }

  throw new Error("Analysis was not inserted and no existing row was found.");
}

async function findAnalysisByUrl(db: Database, url: string) {
  const [existing] = await db
    .select()
    .from(analyses)
    .where(eq(analyses.url, url))
    .limit(1);

  return existing ?? null;
}
