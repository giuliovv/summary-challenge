export type NewsArticle = {
  source: string;
  title: string;
  url: string;
  publishedAt: string;
  imageUrl: string | null;
  description: string | null;
};

export type NewsSearchResult = {
  query: string;
  totalArticles: number;
  articles: NewsArticle[];
  provider: "gnews";
  freeTierDailyLimit: number;
};
