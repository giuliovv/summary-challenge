import { NextResponse } from "next/server";

import { formatZodError, newsSearchQuerySchema } from "@/lib/api/schemas";
import { GNewsError, searchNews } from "@/lib/news/gnews";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const input = newsSearchQuerySchema.safeParse(Object.fromEntries(searchParams));

  if (!input.success) {
    return NextResponse.json({ error: formatZodError(input.error), code: "validation_error" }, { status: 400 });
  }

  try {
    const result = await searchNews({ query: input.data.q, max: input.data.max });
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
