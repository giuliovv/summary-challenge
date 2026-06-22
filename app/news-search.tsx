"use client";

import { FormEvent, useMemo, useState } from "react";

import type { NewsArticle, NewsSearchResult } from "@/lib/news/types";

import styles from "./page.module.css";

type ApiError = {
  error: string;
  code?: string;
};

type AnalysisResponse = {
  analysis: {
    url: string;
    summary: string;
    sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
    sentimentScore: number;
    rationale: string;
  };
  cached: boolean;
};

export function NewsSearch() {
  const [query, setQuery] = useState("artificial intelligence");
  const [lastTopic, setLastTopic] = useState<string | null>(null);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [topN, setTopN] = useState(3);
  const [analyzingUrls, setAnalyzingUrls] = useState<Set<string>>(new Set());
  const [analysesByUrl, setAnalysesByUrl] = useState<Record<string, AnalysisResponse>>(Object.create(null));

  const canAnalyze = articles.length > 0 && !loading;
  const topNOptions = useMemo(() => [3, 5, 10].filter((value) => value <= Math.max(articles.length, 3)), [articles.length]);

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

    for (const article of targets) {
      await analyzeSingleArticle(article);
    }
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
  const published = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(article.publishedAt));

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
        {analysis ? (
          <div className={styles.analysisBox}>
            <div className={styles.analysisMeta}>
              <span>{analysis.analysis.sentiment}</span>
              <span>{analysis.analysis.sentimentScore.toFixed(2)}</span>
              <span>{analysis.cached ? "Stored" : "New"}</span>
            </div>
            <p>{analysis.analysis.summary}</p>
            <small>{analysis.analysis.rationale}</small>
          </div>
        ) : null}
      </div>
    </article>
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
