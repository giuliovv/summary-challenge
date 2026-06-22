import type { NewsArticle, NewsSearchResult } from "./types";

export const GNEWS_FREE_TIER_DAILY_LIMIT = 100;

const GNEWS_BASE_URL = "https://gnews.io/api/v4";

type GNewsArticle = {
  title?: string;
  description?: string | null;
  content?: string | null;
  url?: string;
  image?: string | null;
  publishedAt?: string;
  source?: {
    name?: string | null;
    url?: string | null;
  } | null;
};

type GNewsSearchResponse = {
  totalArticles?: number;
  articles?: GNewsArticle[];
  errors?: unknown;
};

export class GNewsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: "missing_key" | "bad_request" | "rate_limited" | "upstream_error",
  ) {
    super(message);
    this.name = "GNewsError";
  }
}

export type SearchNewsInput = {
  query: string;
  max?: number;
  lang?: string;
  country?: string;
};

export async function searchNews({
  query,
  max = 10,
  lang = "en",
  country = "us",
}: SearchNewsInput): Promise<NewsSearchResult> {
  const apiKey = process.env.GNEWS_API_KEY;

  if (!apiKey) {
    throw new GNewsError("GNEWS_API_KEY is not configured.", 500, "missing_key");
  }

  const params = new URLSearchParams({
    q: query,
    lang,
    country,
    max: String(max),
    apikey: apiKey,
  });

  const response = await fetch(`${GNEWS_BASE_URL}/search?${params.toString()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const payload = (await safeJson(response)) as GNewsSearchResponse | null;

  if (!response.ok) {
    throw buildGNewsError(response.status, payload);
  }

  const articles = (payload?.articles ?? [])
    .map(normalizeArticle)
    .filter((article): article is NewsArticle => article !== null);

  return {
    query,
    totalArticles: payload?.totalArticles ?? articles.length,
    articles,
    provider: "gnews",
    freeTierDailyLimit: GNEWS_FREE_TIER_DAILY_LIMIT,
  };
}

function normalizeArticle(article: GNewsArticle): NewsArticle | null {
  if (!article.title || !article.url || !article.publishedAt) {
    return null;
  }

  return {
    source: article.source?.name?.trim() || "Unknown source",
    title: article.title,
    url: article.url,
    publishedAt: article.publishedAt,
    imageUrl: article.image ?? null,
    description: article.description ?? null,
  };
}

async function safeJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function buildGNewsError(status: number, payload: GNewsSearchResponse | null): GNewsError {
  const detail = formatGNewsErrors(payload?.errors);

  if (status === 429) {
    return new GNewsError(
      detail || "GNews rate limit reached. Free tier allows 100 requests per day.",
      status,
      "rate_limited",
    );
  }

  if (status === 400 || status === 401 || status === 403) {
    const code = status === 403 ? "rate_limited" : "bad_request";
    return new GNewsError(
      detail || "GNews rejected the request. Check the query or API key.",
      status,
      code,
    );
  }

  return new GNewsError(
    detail || "GNews is temporarily unavailable.",
    status,
    "upstream_error",
  );
}

function formatGNewsErrors(errors: unknown): string | null {
  if (!errors) return null;

  if (Array.isArray(errors)) {
    return errors.map(String).join(" ");
  }

  if (typeof errors === "string") {
    return errors;
  }

  if (typeof errors === "object") {
    return Object.entries(errors)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
      .join(" ");
  }

  return String(errors);
}
