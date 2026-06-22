import { NextResponse } from "next/server";

import { analyzeAndStoreArticle } from "@/lib/analyses/service";
import { parseNewsArticle, parseTopic } from "@/lib/news/validation";
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
