import { z } from "zod";

export const sentimentSchema = z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]);

export const topicSchema = z
  .string()
  .trim()
  .min(1, "topic is required")
  .max(120, "topic must be 120 characters or fewer");

const nullableTextSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === "string" && value.trim() ? value.trim() : null));

export const newsArticleSchema = z
  .object({
    source: z.string().trim().min(1, "article.source is required"),
    title: z.string().trim().min(1, "article.title is required"),
    url: z.string().trim().url("article.url must be an http(s) URL"),
    publishedAt: z
      .string()
      .trim()
      .min(1, "article.publishedAt is required")
      .refine((value) => !Number.isNaN(new Date(value).getTime()), "article.publishedAt must be a valid date")
      .transform((value) => new Date(value).toISOString()),
    imageUrl: nullableTextSchema,
    description: nullableTextSchema,
  })
  .refine((article) => article.url.startsWith("http://") || article.url.startsWith("https://"), {
    message: "article.url must be an http(s) URL",
    path: ["url"],
  });

export const newsSearchQuerySchema = z.object({
  q: z.string().trim().min(1, "q is required").max(120, "q must be 120 characters or fewer"),
  max: z.coerce.number().int().min(1).max(10).default(10),
});

export const analysisPostSchema = z.object({
  article: newsArticleSchema,
  topic: topicSchema.nullish().transform((value) => value ?? null),
});

export const batchAnalysisPostSchema = z.object({
  topic: topicSchema,
  articles: z.array(newsArticleSchema).min(1, "articles must include at least one article").max(20, "articles payload is capped at 20"),
});

export const analysesQuerySchema = z.object({
  sentiment: sentimentSchema.optional(),
  topic: topicSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const topicsQuerySchema = z.object({}).strict();

export function formatZodError(error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
}
