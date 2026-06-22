"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import type { NewsArticle, NewsSearchResult } from "@/lib/news/types";

import styles from "./page.module.css";

type Sentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

type ApiError = {
  error: string;
  code?: string;
};

type AnalysisRow = {
  id: string;
  topic: string | null;
  source: string;
  title: string;
  url: string;
  publishedAt: string;
  imageUrl: string | null;
  description: string | null;
  summary: string;
  sentiment: Sentiment;
  sentimentScore: number;
  rationale: string;
  createdAt: string;
};

type AnalysisResponse = {
  analysis: AnalysisRow;
  cached: boolean;
};

type BatchAnalysisResponse = {
  topic: string;
  requested: number;
  analyzed: number;
  limit: number;
  results: AnalysisResponse[];
};

type TopicAggregate = {
  topic: string;
  count: number;
  avgSentimentScore: number;
  sentiments: Record<Sentiment, number>;
};

export function NewsSearch() {
  const [query, setQuery] = useState("artificial intelligence");
  const [lastTopic, setLastTopic] = useState<string | null>(null);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [storedLoading, setStoredLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [topN, setTopN] = useState(3);
  const [analyzingUrls, setAnalyzingUrls] = useState<Set<string>>(new Set());
  const [analysesByUrl, setAnalysesByUrl] = useState<Record<string, AnalysisResponse>>(Object.create(null));
  const [storedAnalyses, setStoredAnalyses] = useState<AnalysisRow[]>([]);
  const [topics, setTopics] = useState<TopicAggregate[]>([]);
  const [sentimentFilter, setSentimentFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");

  const canAnalyze = articles.length > 0 && !loading;
  const topNOptions = useMemo(
    () => [3, 5, 10].filter((value) => value <= Math.max(articles.length, 3)),
    [articles.length],
  );

  useEffect(() => {
    let active = true;

    async function loadInitialViews() {
      setStoredLoading(true);

      try {
        const [analyses, topicRows] = await Promise.all([
          fetchStoredAnalyses("", ""),
          fetchTopicAggregates(),
        ]);

        if (!active) return;
        setStoredAnalyses(analyses);
        setTopics(topicRows);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load stored analyses.");
      } finally {
        if (active) {
          setStoredLoading(false);
        }
      }
    }

    void loadInitialViews();

    return () => {
      active = false;
    };
  }, []);

  async function refreshStoredViews(filters = { sentiment: sentimentFilter, topic: topicFilter }) {
    setStoredLoading(true);

    try {
      const [analyses, topicRows] = await Promise.all([
        fetchStoredAnalyses(filters.sentiment, filters.topic),
        fetchTopicAggregates(),
      ]);
      setStoredAnalyses(analyses);
      setTopics(topicRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stored analyses.");
    } finally {
      setStoredLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();

    if (!trimmed) {
      setError("Enter a topic or keyword to search.");
      setArticles([]);
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/news?q=${encodeURIComponent(trimmed)}&max=10`, {
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json()) as NewsSearchResult | ApiError;

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "News search failed.");
      }

      const result = payload as NewsSearchResult;

      setArticles(result.articles);
      setLastTopic(result.query);

      if (result.articles.length === 0) {
        setNotice("No recent articles found. Try a broader topic.");
      }
    } catch (err) {
      setArticles([]);
      setError(err instanceof Error ? err.message : "News search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function analyzeSingleArticle(article: NewsArticle) {
    setAnalyzingUrls((current) => new Set(current).add(article.url));
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/analyses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ article, topic: (lastTopic ?? query.trim()) || null }),
      });
      const payload = (await response.json()) as AnalysisResponse | ApiError;

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "Analysis failed.");
      }

      const result = payload as AnalysisResponse;
      setAnalysesByUrl((current) => ({ ...current, [article.url]: result }));
      setNotice(result.cached ? "Loaded stored analysis for this article." : "Analysis saved.");
      await refreshStoredViews();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setAnalyzingUrls((current) => {
        const next = new Set(current);
        next.delete(article.url);
        return next;
      });
    }
  }

  async function analyzeTopArticles() {
    const count = Math.min(topN, articles.length);
    const targets = articles.slice(0, count);
    const targetUrls = targets.map((article) => article.url);

    setAnalyzingUrls((current) => new Set([...current, ...targetUrls]));
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/analyses/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          topic: lastTopic ?? query.trim(),
          articles: targets,
        }),
      });
      const payload = (await response.json()) as BatchAnalysisResponse | ApiError;

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "Batch analysis failed.");
      }

      const result = payload as BatchAnalysisResponse;
      setAnalysesByUrl((current) => {
        const next = { ...current };
        for (const item of result.results) {
          next[item.analysis.url] = item;
        }
        return next;
      });
      setNotice(`Analyzed ${result.analyzed} articles for “${result.topic}” (cap ${result.limit}).`);
      await refreshStoredViews();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch analysis failed.");
    } finally {
      setAnalyzingUrls((current) => {
        const next = new Set(current);
        for (const url of targetUrls) {
          next.delete(url);
        }
        return next;
      });
    }
  }

  async function applyFeedFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await refreshStoredViews({ sentiment: sentimentFilter, topic: topicFilter });
  }

  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <p className={styles.kicker}>AI news analyst</p>
        <h1>Search recent news, then choose what should be analyzed.</h1>
        <p className={styles.subcopy}>
          Results are fetched through a server-side GNews proxy, so the API key never reaches the browser. GNews free tier allows 100 requests per day.
        </p>
      </section>

      <section className={styles.panel}>
        <form className={styles.searchForm} onSubmit={handleSubmit}>
          <label htmlFor="query">News topic</label>
          <div className={styles.searchRow}>
            <input
              id="query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. renewable energy, OpenAI, Formula 1"
              maxLength={120}
            />
            <button type="submit" disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </form>

        {error ? <p className={styles.error}>{error}</p> : null}
        {notice ? <p className={styles.notice}>{notice}</p> : null}

        <div className={styles.bulkBar}>
          <span>{articles.length ? `${articles.length} articles ready` : "No articles loaded"}</span>
          <div className={styles.bulkControls}>
            <select value={topN} onChange={(event) => setTopN(Number(event.target.value))} disabled={!canAnalyze}>
              {topNOptions.map((value) => (
                <option key={value} value={value}>
                  Top {value}
                </option>
              ))}
            </select>
            <button type="button" disabled={!canAnalyze || analyzingUrls.size > 0} onClick={analyzeTopArticles}>
              Analyze top N for this topic
            </button>
          </div>
        </div>
      </section>

      <section className={styles.results} aria-live="polite">
        {loading ? <ResultsSkeleton /> : null}
        {!loading && !error && articles.length === 0 ? <EmptyState /> : null}
        {!loading &&
          articles.map((article) => (
            <ArticleCard
              key={article.url}
              article={article}
              analysis={analysesByUrl[article.url]}
              analyzing={analyzingUrls.has(article.url)}
              onAnalyze={analyzeSingleArticle}
            />
          ))}
      </section>

      <section className={styles.viewsGrid}>
        <TopicDashboard topics={topics} loading={storedLoading} />
        <AnalysisFeed
          analyses={storedAnalyses}
          loading={storedLoading}
          sentimentFilter={sentimentFilter}
          topicFilter={topicFilter}
          onSentimentChange={setSentimentFilter}
          onTopicChange={setTopicFilter}
          onApplyFilters={applyFeedFilters}
        />
      </section>
    </main>
  );
}

function ArticleCard({
  article,
  analysis,
  analyzing,
  onAnalyze,
}: {
  article: NewsArticle;
  analysis?: AnalysisResponse;
  analyzing: boolean;
  onAnalyze: (article: NewsArticle) => void;
}) {
  const published = formatDate(article.publishedAt);

  return (
    <article className={styles.card}>
      <div className={styles.imageWrap}>
        {article.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={article.imageUrl} alt="" loading="lazy" />
        ) : (
          <div className={styles.imageFallback}>No image</div>
        )}
      </div>
      <div className={styles.cardBody}>
        <div className={styles.meta}>
          <span>{article.source}</span>
          <span>{published}</span>
        </div>
        <h2>{article.title}</h2>
        {article.description ? <p>{article.description}</p> : null}
        <div className={styles.cardActions}>
          <a href={article.url} target="_blank" rel="noreferrer">
            Read original
          </a>
          <button type="button" disabled={analyzing} onClick={() => onAnalyze(article)}>
            {analyzing ? "Analyzing..." : analysis ? "Recheck" : "Analyze"}
          </button>
        </div>
        {analysis ? <InlineAnalysis analysis={analysis.analysis} cached={analysis.cached} /> : null}
      </div>
    </article>
  );
}

function TopicDashboard({ topics, loading }: { topics: TopicAggregate[]; loading: boolean }) {
  return (
    <section className={styles.viewPanel}>
      <div className={styles.viewHeader}>
        <p className={styles.kicker}>Topic dashboard</p>
        <h2>Stored sentiment by topic</h2>
      </div>
      {loading ? <p className={styles.muted}>Loading topics...</p> : null}
      {!loading && topics.length === 0 ? <p className={styles.muted}>No analyzed topics yet.</p> : null}
      <div className={styles.topicList}>
        {topics.map((topic) => (
          <TopicRow key={topic.topic} topic={topic} />
        ))}
      </div>
    </section>
  );
}

function TopicRow({ topic }: { topic: TopicAggregate }) {
  const total = Math.max(topic.count, 1);
  const positive = (topic.sentiments.POSITIVE / total) * 100;
  const neutral = (topic.sentiments.NEUTRAL / total) * 100;
  const negative = (topic.sentiments.NEGATIVE / total) * 100;

  return (
    <article className={styles.topicRow}>
      <div className={styles.topicTitleRow}>
        <h3>{topic.topic}</h3>
        <span>{topic.count} articles</span>
      </div>
      <div className={styles.scoreLine}>Average score {topic.avgSentimentScore.toFixed(2)}</div>
      <div className={styles.sentimentBar} aria-label={`Sentiment distribution for ${topic.topic}`}>
        <span className={styles.barPositive} style={{ width: `${positive}%` }} />
        <span className={styles.barNeutral} style={{ width: `${neutral}%` }} />
        <span className={styles.barNegative} style={{ width: `${negative}%` }} />
      </div>
      <div className={styles.legend}>
        <span>Positive {topic.sentiments.POSITIVE}</span>
        <span>Neutral {topic.sentiments.NEUTRAL}</span>
        <span>Negative {topic.sentiments.NEGATIVE}</span>
      </div>
    </article>
  );
}

function AnalysisFeed({
  analyses,
  loading,
  sentimentFilter,
  topicFilter,
  onSentimentChange,
  onTopicChange,
  onApplyFilters,
}: {
  analyses: AnalysisRow[];
  loading: boolean;
  sentimentFilter: string;
  topicFilter: string;
  onSentimentChange: (value: string) => void;
  onTopicChange: (value: string) => void;
  onApplyFilters: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className={styles.viewPanel}>
      <div className={styles.viewHeader}>
        <p className={styles.kicker}>Analysis feed</p>
        <h2>Newest analyzed articles</h2>
      </div>
      <form className={styles.feedFilters} onSubmit={onApplyFilters}>
        <select value={sentimentFilter} onChange={(event) => onSentimentChange(event.target.value)}>
          <option value="">All sentiments</option>
          <option value="POSITIVE">Positive</option>
          <option value="NEUTRAL">Neutral</option>
          <option value="NEGATIVE">Negative</option>
        </select>
        <input
          value={topicFilter}
          onChange={(event) => onTopicChange(event.target.value)}
          placeholder="Filter exact topic"
        />
        <button type="submit">Apply</button>
      </form>
      {loading ? <p className={styles.muted}>Loading analyses...</p> : null}
      {!loading && analyses.length === 0 ? <p className={styles.muted}>No stored analyses match this view.</p> : null}
      <div className={styles.feedList}>
        {analyses.map((analysis) => (
          <article key={analysis.id} className={styles.feedItem}>
            <div className={styles.feedTopline}>
              <span>{analysis.source}</span>
              <span>{analysis.topic ?? "No topic"}</span>
            </div>
            <h3>{analysis.title}</h3>
            <SentimentBadge sentiment={analysis.sentiment} score={analysis.sentimentScore} />
            <p>{analysis.summary}</p>
            <div className={styles.whyBox}>
              <strong>Why this sentiment:</strong> {analysis.rationale}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function InlineAnalysis({ analysis, cached }: { analysis: AnalysisRow; cached: boolean }) {
  return (
    <div className={styles.analysisBox}>
      <div className={styles.analysisMeta}>
        <SentimentBadge sentiment={analysis.sentiment} score={analysis.sentimentScore} />
        <span>{cached ? "Stored" : "New"}</span>
      </div>
      <p>{analysis.summary}</p>
      <small>Why this sentiment: {analysis.rationale}</small>
    </div>
  );
}

function SentimentBadge({ sentiment, score }: { sentiment: Sentiment; score: number }) {
  return (
    <span className={`${styles.sentimentBadge} ${styles[`badge${sentiment}`]}`}>
      {sentiment} {score.toFixed(2)}
    </span>
  );
}

function EmptyState() {
  return (
    <div className={styles.empty}>
      <h2>Start with a topic.</h2>
      <p>Search for recent articles, then pick one article or analyze the top results for that topic.</p>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className={styles.empty}>
      <h2>Searching recent articles...</h2>
      <p>Fetching from GNews through the server proxy.</p>
    </div>
  );
}

async function fetchStoredAnalyses(sentiment: string, topic: string) {
  const params = new URLSearchParams();
  if (sentiment) params.set("sentiment", sentiment);
  if (topic.trim()) params.set("topic", topic.trim());

  const response = await fetch(`/api/analyses?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const payload = (await response.json()) as { analyses: AnalysisRow[] } | ApiError;

  if (!response.ok) {
    throw new Error("error" in payload ? payload.error : "Failed to load analyses.");
  }

  return (payload as { analyses: AnalysisRow[] }).analyses;
}

async function fetchTopicAggregates() {
  const response = await fetch("/api/topics", {
    headers: { Accept: "application/json" },
  });
  const payload = (await response.json()) as { topics: TopicAggregate[] } | ApiError;

  if (!response.ok) {
    throw new Error("error" in payload ? payload.error : "Failed to load topics.");
  }

  return (payload as { topics: TopicAggregate[] }).topics;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
