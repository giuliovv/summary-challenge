import { NextResponse } from "next/server";

import { GNewsError, searchNews } from "@/lib/news/gnews";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const maxParam = Number(searchParams.get("max") ?? 10);
  const max = Number.isFinite(maxParam) ? Math.min(Math.max(maxParam, 1), 10) : 10;

  if (!query) {
    return NextResponse.json(
      { error: "Query parameter q is required." },
      { status: 400 },
    );
  }

  if (query.length > 120) {
    return NextResponse.json(
      { error: "Query must be 120 characters or fewer." },
      { status: 400 },
    );
  }

  try {
    const result = await searchNews({ query, max });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GNewsError) {
      const status = error.code === "missing_key" ? 500 : error.status;
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status },
      );
    }

    console.error("Unexpected news search failure", error);
    return NextResponse.json(
      { error: "Unexpected news search failure.", code: "internal_error" },
      { status: 500 },
    );
  }
}
