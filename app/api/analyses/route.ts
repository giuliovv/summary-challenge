import { and, desc, eq, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";

import { analyzeAndStoreArticle } from "@/lib/analyses/service";
import { analysesQuerySchema, analysisPostSchema, formatZodError } from "@/lib/api/schemas";
import { getDb } from "@/lib/db/client";
import { analyses } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const input = analysesQuerySchema.safeParse(Object.fromEntries(searchParams));

  if (!input.success) {
    return NextResponse.json({ error: formatZodError(input.error), code: "validation_error" }, { status: 400 });
  }

  const filters: SQL[] = [];

  if (input.data.sentiment) {
    filters.push(eq(analyses.sentiment, input.data.sentiment));
  }

  if (input.data.topic) {
    filters.push(eq(analyses.topic, input.data.topic));
  }

  try {
    const rows = await getDb()
      .select()
      .from(analyses)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(analyses.createdAt))
      .limit(input.data.limit);

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
  let json: unknown;

  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON.", code: "validation_error" }, { status: 400 });
  }

  const input = analysisPostSchema.safeParse(json);

  if (!input.success) {
    return NextResponse.json({ error: formatZodError(input.error), code: "validation_error" }, { status: 400 });
  }

  try {
    const result = await analyzeAndStoreArticle({
      article: input.data.article,
      topic: input.data.topic,
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
