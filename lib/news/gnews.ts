const apiKey = process.env.GNEWS_API_KEY;

if (!apiKey) {
  throw new Error("GNEWS_API_KEY is required");
}

export const gnewsConfig = {
  baseUrl: "https://gnews.io/api/v4",
  apiKey,
} as const;
