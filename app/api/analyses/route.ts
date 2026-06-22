import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { analyzeArticle } from "@/lib/ai/openai";
import { getDb } from "@/lib/db/client";
import { analyses } from "@/lib/db/schema";
import type { NewsArticle } from "@/lib/news/types";

export const dynamic = "force-dynamic";

type AnalyzeRequestBody = {
  article?: Partial<NewsArticle>;
  topic?: unknown;
};

export async function POST(request: Request) {
  let body: AnalyzeRequestBody;

  try {
    body = (await request.json()) as AnalyzeRequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const article = parseArticle(body.article);

  if (!article.ok) {
    return NextResponse.json({ error: article.error }, { status: 400 });
  }

  const topic = parseTopic(body.topic);

  try {
    const db = getDb();
    const existing = await findAnalysisByUrl(db, article.value.url);

    if (existing) {
      return NextResponse.json({ analysis: existing, cached: true });
    }

    const ai = await analyzeArticle(article.value);
    const [inserted] = await db
      .insert(analyses)
      .values({
        topic,
        source: article.value.source,
        title: article.value.title,
        url: article.value.url,
        publishedAt: new Date(article.value.publishedAt),
        imageUrl: article.value.imageUrl,
        description: article.value.description,
        summary: ai.summary,
        sentiment: ai.sentiment,
        sentimentScore: ai.sentimentScore,
        rationale: ai.rationale,
      })
      .onConflictDoNothing({ target: analyses.url })
      .returning();

    if (inserted) {
      return NextResponse.json({ analysis: inserted, cached: false });
    }

    const racedExisting = await findAnalysisByUrl(db, article.value.url);

    if (racedExisting) {
      return NextResponse.json({ analysis: racedExisting, cached: true });
    }

    return NextResponse.json(
      { error: "Analysis was not inserted and no existing row was found." },
      { status: 500 },
    );
  } catch (error) {
    console.error("Analysis request failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis request failed." },
      { status: 500 },
    );
  }
}

async function findAnalysisByUrl(db: ReturnType<typeof getDb>, url: string) {
  const [existing] = await db
    .select()
    .from(analyses)
    .where(eq(analyses.url, url))
    .limit(1);

  return existing ?? null;
}

function parseArticle(article: AnalyzeRequestBody["article"]):
  | { ok: true; value: NewsArticle }
  | { ok: false; error: string } {
  if (!article || typeof article !== "object") {
    return { ok: false, error: "article is required." };
  }

  const source = requiredString(article.source, "article.source");
  const title = requiredString(article.title, "article.title");
  const url = requiredString(article.url, "article.url");
  const publishedAt = requiredString(article.publishedAt, "article.publishedAt");

  if (!source.ok) return source;
  if (!title.ok) return title;
  if (!url.ok) return url;
  if (!publishedAt.ok) return publishedAt;

  if (!isHttpUrl(url.value)) {
    return { ok: false, error: "article.url must be an http(s) URL." };
  }

  const publishedDate = new Date(publishedAt.value);
  if (Number.isNaN(publishedDate.getTime())) {
    return { ok: false, error: "article.publishedAt must be a valid date." };
  }

  return {
    ok: true,
    value: {
      source: source.value,
      title: title.value,
      url: url.value,
      publishedAt: publishedDate.toISOString(),
      imageUrl: nullableString(article.imageUrl),
      description: nullableString(article.description),
    },
  };
}

function requiredString(value: unknown, field: string):
  | { ok: true; value: string }
  | { ok: false; error: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: `${field} is required.` };
  }

  return { ok: true, value: value.trim() };
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseTopic(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
