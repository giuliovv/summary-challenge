import { beforeEach, describe, expect, it, vi } from "vitest";

const analyzeArticle = vi.fn();
const getDb = vi.fn();

vi.mock("@/lib/ai/openai", () => ({
  analyzeArticle,
}));

vi.mock("@/lib/db/client", () => ({
  getDb,
}));

function createSelectChain(result: unknown[]) {
  const limit = vi.fn(async () => result);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  return { select: vi.fn(() => ({ from })), limit, where, from };
}

function createInsertChain(result: unknown[]) {
  const returning = vi.fn(async () => result);
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  return { insert: vi.fn(() => ({ values })), values, onConflictDoNothing, returning };
}

describe("POST /api/analyses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("analyzes an uncached article with mocked OpenAI output and stores it", async () => {
    const article = {
      source: "Example News",
      title: "Markets rally on chip demand",
      url: "https://example.com/chips",
      publishedAt: "2026-06-22T10:00:00.000Z",
      imageUrl: null,
      description: "Chip demand lifted market sentiment.",
    };
    const ai = {
      summary: "Chip demand pushed markets higher.",
      sentiment: "POSITIVE",
      sentimentScore: 0.62,
      rationale: "The article describes broad gains driven by demand.",
    };
    const inserted = {
      id: "c_test",
      topic: "semiconductors",
      ...article,
      publishedAt: new Date(article.publishedAt),
      ...ai,
      createdAt: new Date("2026-06-22T10:01:00.000Z"),
    };
    const selectChain = createSelectChain([]);
    const insertChain = createInsertChain([inserted]);

    analyzeArticle.mockResolvedValue(ai);
    getDb.mockReturnValue({
      select: selectChain.select,
      insert: insertChain.insert,
    });

    const { POST } = await import("../route");
    const response = await POST(
      new Request("http://localhost/api/analyses", {
        method: "POST",
        body: JSON.stringify({ article, topic: "semiconductors" }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(analyzeArticle).toHaveBeenCalledTimes(1);
    expect(analyzeArticle).toHaveBeenCalledWith(article);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "semiconductors",
        url: article.url,
        summary: ai.summary,
        sentiment: ai.sentiment,
        sentimentScore: ai.sentimentScore,
      }),
    );
    expect(json).toEqual({ analysis: expect.objectContaining({ id: "c_test" }), cached: false });
  });
});
