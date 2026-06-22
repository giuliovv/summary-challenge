import type { NewsArticle } from "./types";

export function parseNewsArticle(article: Partial<NewsArticle> | undefined):
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

export function parseTopic(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
