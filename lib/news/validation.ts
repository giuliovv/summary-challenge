import { newsArticleSchema, topicSchema } from "@/lib/api/schemas";
import type { NewsArticle } from "./types";

export function parseNewsArticle(article: Partial<NewsArticle> | undefined):
  | { ok: true; value: NewsArticle }
  | { ok: false; error: string } {
  const result = newsArticleSchema.safeParse(article);

  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "Invalid article." };
  }

  return { ok: true, value: result.data };
}

export function parseTopic(value: unknown) {
  const result = topicSchema.safeParse(value);
  return result.success ? result.data : null;
}
