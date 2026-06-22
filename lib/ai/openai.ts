import OpenAI from "openai";

import type { NewsArticle } from "@/lib/news/types";
import type { NewAnalysis } from "@/lib/db/schema";

export const OPENAI_ANALYSIS_MODEL = "gpt-4.1-nano";

export type ArticleAnalysis = Pick<
  NewAnalysis,
  "summary" | "sentiment" | "sentimentScore" | "rationale"
>;

type RawAnalysis = {
  summary?: unknown;
  sentiment?: unknown;
  score?: unknown;
  rationale?: unknown;
};

let openaiClient: OpenAI | null = null;

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  openaiClient ??= new OpenAI({ apiKey });
  return openaiClient;
}

export async function analyzeArticle(article: NewsArticle): Promise<ArticleAnalysis> {
  const completion = await getOpenAI().chat.completions.create({
    model: OPENAI_ANALYSIS_MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a strict news analysis API. Return only valid JSON with keys summary, sentiment, score, rationale. Summary must be concise and factual. Sentiment must be POSITIVE, NEUTRAL, or NEGATIVE. Score must be a number from -1 to 1, where -1 is very negative, 0 is neutral, and 1 is very positive. Rationale must be one short sentence. Do not include markdown or extra keys.",
      },
      {
        role: "user",
        content: JSON.stringify({
          source: article.source,
          title: article.title,
          url: article.url,
          publishedAt: article.publishedAt,
          description: article.description,
        }),
      },
    ],
  });

  const content = completion.choices[0]?.message.content;

  if (!content) {
    throw new Error("OpenAI returned an empty analysis response.");
  }

  return parseAnalysis(content);
}

function parseAnalysis(content: string): ArticleAnalysis {
  let parsed: RawAnalysis;

  try {
    parsed = JSON.parse(content) as RawAnalysis;
  } catch {
    throw new Error("OpenAI returned invalid JSON.");
  }

  const summary = requireString(parsed.summary, "summary");
  const sentiment = requireSentiment(parsed.sentiment);
  const sentimentScore = requireScore(parsed.score);
  const rationale = requireString(parsed.rationale, "rationale");

  return {
    summary,
    sentiment,
    sentimentScore,
    rationale,
  };
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`OpenAI response is missing ${field}.`);
  }

  return value.trim();
}

function requireSentiment(value: unknown): ArticleAnalysis["sentiment"] {
  if (value === "POSITIVE" || value === "NEUTRAL" || value === "NEGATIVE") {
    return value;
  }

  throw new Error("OpenAI response has invalid sentiment.");
}

function requireScore(value: unknown) {
  const score = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(score) || score < -1 || score > 1) {
    throw new Error("OpenAI response has invalid sentiment score.");
  }

  return score;
}
