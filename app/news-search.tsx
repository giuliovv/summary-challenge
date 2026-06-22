"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { NewsArticle, NewsSearchResult } from "@/lib/news/types";

type Screen = "search" | "dashboard" | "feed";
type Sentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";
type SearchState = "idle" | "loading" | "results" | "empty" | "error";

type ApiError = { error: string; code?: string };

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

type AnalysisResponse = { analysis: AnalysisRow; cached: boolean };
type BatchAnalysisResponse = {
  topic: string; requested: number; analyzed: number; limit: number;
  results: AnalysisResponse[];
};
type TopicAggregate = {
  topic: string; count: number; avgSentimentScore: number;
  sentiments: Record<Sentiment, number>;
};

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#f4f2ec",
  text: "#1c1b19",
  dim: "#37342f",
  muted: "#9a948a",
  muted2: "#57534b",
  muted3: "#6b655c",
  border: "#e2ddd1",
  border2: "#e7e3d9",
  borderInput: "#d8d2c6",
  white: "#fff",
  positive: "#5b9070",
  negative: "#bd6b50",
  posText: "#2f6a47",
  negText: "#9a3f2c",
} as const;

const F = {
  serif: "var(--font-newsreader), serif",
  sans: "var(--font-archivo), sans-serif",
  mono: "var(--font-ibm-plex-mono), monospace",
} as const;

const shimmer = {
  background: "linear-gradient(90deg,#e9e5db 25%,#f4f2ec 37%,#e9e5db 63%)",
  backgroundSize: "400% 100%",
  animation: "tnr-shimmer 1.4s ease infinite",
} as const;

// ─── Shared atoms ─────────────────────────────────────────────────────────────
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 12px", borderRadius: 999, cursor: "pointer",
      border: `1px solid ${active ? C.text : C.borderInput}`,
      background: active ? C.text : "transparent",
      color: active ? C.bg : C.muted3,
      fontFamily: F.mono, fontSize: 11, letterSpacing: ".03em",
    }}>{children}</button>
  );
}

function SentimentBadge({ sentiment, score }: { sentiment: Sentiment; score: number }) {
  const map = {
    POSITIVE: { bg: "#e8f2eb", color: C.posText, border: "#c6dece" },
    NEUTRAL:  { bg: "#f0ede6", color: C.muted3,  border: "#ddd8cc" },
    NEGATIVE: { bg: "#f2e8e5", color: C.negText,  border: "#dcc4be" },
  };
  const c = map[sentiment];
  const label = sentiment.charAt(0) + sentiment.slice(1).toLowerCase();
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 999,
      border: `1px solid ${c.border}`, background: c.bg, color: c.color,
      fontFamily: F.mono, fontSize: 11, fontWeight: 500, letterSpacing: ".03em",
      whiteSpace: "nowrap",
    }}>
      {label} <span style={{ opacity: 0.7 }}>{score >= 0 ? "+" : ""}{score.toFixed(2)}</span>
    </span>
  );
}

function DistributionBar({ pos, neu, neg }: { pos: number; neu: number; neg: number }) {
  const total = Math.max(pos + neu + neg, 1);
  return (
    <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", background: "#e9e5db" }}>
      {pos > 0 && <div style={{ width: `${(pos / total) * 100}%`, background: C.positive }} />}
      {neu > 0 && <div style={{ width: `${(neu / total) * 100}%`, background: "#b3ac9f" }} />}
      {neg > 0 && <div style={{ width: `${(neg / total) * 100}%`, background: C.negative }} />}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div style={{ display: "flex", gap: 20, padding: "22px 0", borderBottom: `1px solid ${C.border2}`, alignItems: "flex-start" }}>
      <div style={{ width: 104, height: 78, flex: "none", borderRadius: 7, ...shimmer }} />
      <div style={{ flex: 1 }}>
        <div style={{ width: 120, height: 11, borderRadius: 4, marginBottom: 14, ...shimmer }} />
        <div style={{ width: "80%", height: 18, borderRadius: 5, marginBottom: 12, ...shimmer }} />
        <div style={{ width: "55%", height: 13, borderRadius: 4, ...shimmer }} />
      </div>
    </div>
  );
}

// ─── Search tab ───────────────────────────────────────────────────────────────
function ArticleRow({
  article, analysis, analyzing, onAnalyze,
}: {
  article: NewsArticle;
  analysis?: AnalysisResponse;
  analyzing: boolean;
  onAnalyze: (a: NewsArticle) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 20, padding: "22px 0", borderBottom: `1px solid ${C.border2}`, alignItems: "flex-start" }}>
      <div style={{ width: 104, height: 78, flex: "none", borderRadius: 7, overflow: "hidden" }}>
        {article.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={article.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "repeating-linear-gradient(135deg,#e9e5db,#e9e5db 7px,#e2ddd2 7px,#e2ddd2 14px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: F.mono, fontSize: 9, color: "#aaa294", letterSpacing: ".1em" }}>IMAGE</span>
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".04em", marginBottom: 7 }}>
          {article.source} · {formatDate(article.publishedAt)}
        </div>
        <div style={{ fontFamily: F.serif, fontWeight: 500, fontSize: 20, lineHeight: 1.25, letterSpacing: "-.01em", marginBottom: 6 }}>
          {article.title}
        </div>
        {article.description && (
          <div style={{ fontSize: 14, lineHeight: 1.5, color: C.muted3, maxWidth: "62ch" }}>{article.description}</div>
        )}
        {analysis && (
          <div style={{ marginTop: 12 }}>
            <SentimentBadge sentiment={analysis.analysis.sentiment} score={analysis.analysis.sentimentScore} />
            <div style={{ marginTop: 8, fontFamily: F.serif, fontStyle: "italic", fontSize: 14, color: C.dim, lineHeight: 1.5 }}>
              {analysis.analysis.rationale}
            </div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
        <button onClick={() => onAnalyze(article)} disabled={analyzing} style={{
          padding: "9px 16px", border: `1px solid ${C.text}`, borderRadius: 8, background: "transparent",
          color: C.text, fontFamily: F.sans, fontSize: 13, fontWeight: 600,
          cursor: analyzing ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", gap: 7, opacity: analyzing ? 0.6 : 1,
        }}>
          {analyzing ? "…" : (analysis ? "Recheck" : "Analyze")} <span style={{ fontFamily: F.mono }}>→</span>
        </button>
        <a href={article.url} target="_blank" rel="noreferrer" style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, letterSpacing: ".05em" }}>
          Read ↗
        </a>
      </div>
    </div>
  );
}

function SearchTab({
  query, onQuery, onSubmit, onRetry, searchState, articles,
  topN, setTopN, topNOptions, analyzingUrls, analysesByUrl,
  onAnalyzeSingle, onAnalyzeTop, canAnalyze, lastTopic, onGoToDashboard,
}: {
  query: string;
  onQuery: (v: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onRetry: () => void;
  searchState: SearchState;
  articles: NewsArticle[];
  topN: number;
  setTopN: (v: number) => void;
  topNOptions: number[];
  analyzingUrls: Set<string>;
  analysesByUrl: Record<string, AnalysisResponse>;
  onAnalyzeSingle: (a: NewsArticle) => void;
  onAnalyzeTop: () => void;
  canAnalyze: boolean;
  lastTopic: string | null;
  onGoToDashboard: () => void;
}) {
  const suggestions = ["Nvidia", "U.S. housing market", "Fed rate path", "AI regulation", "Semiconductors"];

  return (
    <div>
      <div style={{ maxWidth: 760 }}>
        <div style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: ".16em", color: C.muted, textTransform: "uppercase", marginBottom: 16 }}>
          Search a topic
        </div>
        <h1 style={{ fontFamily: F.serif, fontWeight: 500, fontSize: 40, lineHeight: 1.1, letterSpacing: "-.015em", margin: "0 0 26px" }}>
          What's the mood around a topic?
        </h1>
        <form onSubmit={onSubmit} style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${C.borderInput}`, background: C.white, borderRadius: 12, padding: "6px 6px 6px 18px" }}>
          <span style={{ fontFamily: F.mono, color: "#b3ac9f", fontSize: 17 }}>⌕</span>
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search a topic — Nvidia, housing market, Fed rate path…"
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: F.sans, fontSize: 16, color: C.text, padding: "11px 0" }}
          />
          <button type="submit" disabled={searchState === "loading"} style={{ padding: "11px 20px", border: "none", borderRadius: 8, background: C.text, color: C.bg, fontFamily: F.sans, fontSize: 13.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
            {searchState === "loading" ? "Searching…" : "Analyze topic"}
          </button>
        </form>
      </div>

      {/* Batch bar */}
      {searchState === "results" && articles.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <span style={{ fontFamily: F.mono, fontSize: 11, color: "#b3ac9f", letterSpacing: ".03em" }}>Analyze top</span>
          <select value={topN} onChange={(e) => setTopN(Number(e.target.value))} disabled={!canAnalyze} style={{ border: `1px solid ${C.borderInput}`, borderRadius: 6, background: C.white, color: C.text, fontFamily: F.mono, fontSize: 12, padding: "4px 8px", cursor: "pointer" }}>
            {topNOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <button type="button" onClick={onAnalyzeTop} disabled={!canAnalyze || analyzingUrls.size > 0} style={{ padding: "9px 16px", border: "none", borderRadius: 8, background: C.text, color: C.bg, fontFamily: F.sans, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, opacity: (!canAnalyze || analyzingUrls.size > 0) ? 0.5 : 1 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: C.positive, display: "inline-block" }} />
            for this topic
          </button>
        </div>
      )}

      {/* Results */}
      {searchState === "results" && (
        <div style={{ marginTop: 40 }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, paddingBottom: 18, borderBottom: `1.5px solid ${C.text}` }}>
            <div>
              <div style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: ".14em", color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>Results</div>
              <div style={{ fontSize: 15, color: C.muted2 }}>
                Showing <strong style={{ color: C.text }}>{articles.length}</strong> articles for{" "}
                <span style={{ fontFamily: F.serif, fontStyle: "italic", fontSize: 17, color: C.text }}>"{lastTopic}"</span>
              </div>
            </div>
            {lastTopic && (
              <button onClick={onGoToDashboard} style={{ padding: "12px 20px", border: "none", borderRadius: 9, background: C.text, color: C.bg, fontFamily: F.sans, fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 9, whiteSpace: "nowrap" }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: C.positive, display: "inline-block" }} />
                View dashboard
              </button>
            )}
          </div>
          {articles.map((article) => (
            <ArticleRow
              key={article.url}
              article={article}
              analysis={analysesByUrl[article.url]}
              analyzing={analyzingUrls.has(article.url)}
              onAnalyze={onAnalyzeSingle}
            />
          ))}
        </div>
      )}

      {/* Loading */}
      {searchState === "loading" && (
        <div style={{ marginTop: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 18, borderBottom: `1.5px solid ${C.border}` }}>
            <span style={{ width: 14, height: 14, border: `2px solid ${C.borderInput}`, borderTopColor: C.text, borderRadius: 999, display: "inline-block", animation: "tnr-spin .7s linear infinite" }} />
            <span style={{ fontFamily: F.mono, fontSize: 12, color: C.muted3, letterSpacing: ".05em" }}>Fetching coverage and scoring sentiment…</span>
          </div>
          {[1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}
        </div>
      )}

      {/* Empty */}
      {searchState === "empty" && (
        <div style={{ marginTop: 64, textAlign: "center", padding: "48px 0" }}>
          <div style={{ fontFamily: F.mono, fontSize: 30, color: "#cfc8ba", marginBottom: 18 }}>◎</div>
          <div style={{ fontFamily: F.serif, fontSize: 24, fontWeight: 500, marginBottom: 10 }}>No coverage found for "{query}"</div>
          <div style={{ fontSize: 14.5, color: C.muted3, maxWidth: "42ch", margin: "0 auto 26px", lineHeight: 1.55 }}>
            Try a broader phrase or one of these:
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            {suggestions.map((s) => (
              <button key={s} onClick={() => onQuery(s)} style={{ padding: "8px 15px", border: `1px solid ${C.borderInput}`, borderRadius: 999, background: C.white, color: C.text, fontFamily: F.sans, fontSize: 13, cursor: "pointer" }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {searchState === "error" && (
        <div style={{ marginTop: 64, textAlign: "center", padding: "48px 0" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, borderRadius: 999, background: "#f1e6e1", color: C.negText, fontFamily: F.mono, fontSize: 22, marginBottom: 18 }}>!</div>
          <div style={{ fontFamily: F.serif, fontSize: 24, fontWeight: 500, marginBottom: 10 }}>Couldn't reach the news index</div>
          <div style={{ fontSize: 14.5, color: C.muted3, maxWidth: "44ch", margin: "0 auto 26px", lineHeight: 1.55 }}>
            The request timed out. Your sentiment data is safe — this only affects new searches.
          </div>
          <button onClick={onRetry} style={{ padding: "11px 22px", border: "none", borderRadius: 9, background: C.text, color: C.bg, fontFamily: F.sans, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      )}

      {/* Idle */}
      {searchState === "idle" && (
        <div style={{ marginTop: 64, textAlign: "center", padding: "48px 0" }}>
          <div style={{ fontFamily: F.mono, fontSize: 30, color: "#cfc8ba", marginBottom: 18 }}>◎</div>
          <div style={{ fontFamily: F.serif, fontSize: 22, fontWeight: 500, color: C.muted }}>Enter a topic above to get started</div>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard tab ────────────────────────────────────────────────────────────
function DashArticleRow({ article, idx }: { article: AnalysisRow; idx: number }) {
  return (
    <div style={{ display: "flex", gap: 18, padding: "18px 0", borderBottom: `1px solid ${C.border2}`, alignItems: "center" }}>
      <span style={{ fontFamily: F.mono, fontSize: 12, color: "#c0b9ab", width: 22, flex: "none" }}>
        {String(idx).padStart(2, "0")}
      </span>
      <div style={{ width: 58, height: 44, flex: "none", borderRadius: 6, background: "repeating-linear-gradient(135deg,#e9e5db,#e9e5db 6px,#e2ddd2 6px,#e2ddd2 12px)", boxShadow: "inset 0 0 0 1px rgba(28,27,25,.05)" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: F.mono, fontSize: 10.5, color: C.muted, letterSpacing: ".04em", marginBottom: 4 }}>
          {article.source} · {formatDate(article.publishedAt)}
        </div>
        <div style={{ fontFamily: F.serif, fontWeight: 500, fontSize: 18, lineHeight: 1.25, letterSpacing: "-.01em" }}>
          {article.title}
        </div>
      </div>
      <div style={{ flex: "none" }}>
        <SentimentBadge sentiment={article.sentiment} score={article.sentimentScore} />
      </div>
    </div>
  );
}

function DashboardTab({
  topicKey, aggregate, articles, loading, onSearchClick,
}: {
  topicKey: string | null;
  aggregate: TopicAggregate | undefined;
  articles: AnalysisRow[];
  loading: boolean;
  onSearchClick: () => void;
}) {
  const pos = aggregate?.sentiments.POSITIVE ?? articles.filter((a) => a.sentiment === "POSITIVE").length;
  const neu = aggregate?.sentiments.NEUTRAL  ?? articles.filter((a) => a.sentiment === "NEUTRAL").length;
  const neg = aggregate?.sentiments.NEGATIVE ?? articles.filter((a) => a.sentiment === "NEGATIVE").length;
  const total = aggregate?.count ?? articles.length;
  const avg = aggregate?.avgSentimentScore ?? (articles.length > 0 ? articles.reduce((s, a) => s + a.sentimentScore, 0) / articles.length : 0);
  const sources = new Set(articles.map((a) => a.source)).size;
  const avgText = (avg >= 0 ? "+" : "") + avg.toFixed(2);
  const markerPct = (((avg + 1) / 2) * 100).toFixed(1) + "%";
  const avgColor = avg > 0.15 ? C.posText : (avg < -0.15 ? C.negText : C.muted2);
  const moodLabel = pos === neg ? "Evenly split" : (pos > neg ? "Leans positive" : "Leans negative");

  if (!topicKey) {
    return (
      <div style={{ textAlign: "center", padding: "96px 0" }}>
        <div style={{ fontFamily: F.mono, fontSize: 30, color: "#cfc8ba", marginBottom: 18 }}>◎</div>
        <div style={{ fontFamily: F.serif, fontSize: 24, fontWeight: 500, marginBottom: 16, color: C.muted }}>No topic analyzed yet</div>
        <button onClick={onSearchClick} style={{ padding: "11px 22px", border: "none", borderRadius: 9, background: C.text, color: C.bg, fontFamily: F.sans, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
          Search a topic →
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: ".16em", color: C.muted, textTransform: "uppercase", marginBottom: 12 }}>Topic dashboard</div>
          <h1 style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 52, lineHeight: 1, letterSpacing: "-.02em", margin: "0 0 12px" }}>{topicKey}</h1>
          <div style={{ fontFamily: F.mono, fontSize: 12, color: C.muted, letterSpacing: ".03em" }}>
            {total} article{total !== 1 ? "s" : ""} · {sources} source{sources !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ marginTop: 26, background: C.white, border: `1px solid ${C.border2}`, borderRadius: 16, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ padding: "28px 30px", borderRight: "1px solid #eee8dc" }}>
                <div style={{ width: 110, height: 10, borderRadius: 4, marginBottom: 20, ...shimmer }} />
                <div style={{ width: 84, height: 40, borderRadius: 7, ...shimmer }} />
              </div>
            ))}
          </div>
        </div>
      ) : total > 0 ? (
        <>
          <div style={{ marginTop: 26, background: C.white, border: `1px solid ${C.border2}`, borderRadius: 16, boxShadow: "0 1px 2px rgba(28,27,25,.03), 0 14px 40px -28px rgba(28,27,25,.22)", overflow: "hidden" }}>
            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
              <div style={{ padding: "28px 30px", borderRight: "1px solid #eee8dc" }}>
                <div style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: ".14em", color: C.muted, textTransform: "uppercase", marginBottom: 16 }}>Average sentiment</div>
                <div style={{ fontFamily: F.mono, fontSize: 48, fontWeight: 500, lineHeight: 1, letterSpacing: "-.02em", color: avgColor }}>{avgText}</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 10 }}>on a –1.0 to +1.0 scale</div>
              </div>
              <div style={{ padding: "28px 30px", borderRight: "1px solid #eee8dc" }}>
                <div style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: ".14em", color: C.muted, textTransform: "uppercase", marginBottom: 16 }}>Articles analyzed</div>
                <div style={{ fontFamily: F.mono, fontSize: 48, fontWeight: 500, lineHeight: 1, letterSpacing: "-.02em" }}>{total}</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 10 }}>across {sources} distinct source{sources !== 1 ? "s" : ""}</div>
              </div>
              <div style={{ padding: "28px 30px" }}>
                <div style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: ".14em", color: C.muted, textTransform: "uppercase", marginBottom: 16 }}>Net reading</div>
                <div style={{ fontFamily: F.serif, fontWeight: 500, fontSize: 32, lineHeight: 1.05, letterSpacing: "-.01em" }}>{moodLabel}</div>
                <div style={{ fontFamily: F.mono, fontSize: 12, color: C.muted, marginTop: 12 }}>{pos} pos · {neu} neu · {neg} neg</div>
              </div>
            </div>

            {/* Sentiment scale */}
            <div style={{ padding: "26px 30px", borderTop: "1px solid #eee8dc" }}>
              <div style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: ".14em", color: C.muted, textTransform: "uppercase", marginBottom: 18 }}>Sentiment scale</div>
              <div style={{ position: "relative", height: 10, borderRadius: 999, background: `linear-gradient(90deg,${C.negative} 0%,#d3cbbc 50%,${C.positive} 100%)` }}>
                <div style={{ position: "absolute", top: "50%", left: "50%", width: 1, height: 18, background: "rgba(28,27,25,.18)", transform: "translate(-50%,-50%)" }} />
                <div style={{ position: "absolute", top: -34, left: markerPct, transform: "translateX(-50%)", fontFamily: F.mono, fontSize: 12, fontWeight: 500, color: C.text, background: C.white, padding: "1px 6px", border: `1px solid ${C.border}`, borderRadius: 5, whiteSpace: "nowrap" }}>
                  {avgText}
                </div>
                <div style={{ position: "absolute", top: -7, left: markerPct, transform: "translateX(-50%)" }}>
                  <div style={{ width: 3, height: 24, borderRadius: 999, background: C.text }} />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontFamily: F.mono, fontSize: 11, color: C.muted }}>
                <span>−1.0 · negative</span><span>0.0 · neutral</span><span>+1.0 · positive</span>
              </div>
            </div>

            {/* Distribution */}
            <div style={{ padding: "26px 30px", borderTop: "1px solid #eee8dc" }}>
              <div style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: ".14em", color: C.muted, textTransform: "uppercase", marginBottom: 18 }}>Sentiment distribution</div>
              <DistributionBar pos={pos} neu={neu} neg={neg} />
              <div style={{ display: "flex", gap: 20, marginTop: 12, fontFamily: F.mono, fontSize: 11, color: C.muted }}>
                {[
                  { label: "Positive", count: pos, color: C.positive },
                  { label: "Neutral",  count: neu, color: "#b3ac9f" },
                  { label: "Negative", count: neg, color: C.negative },
                ].map((item) => (
                  <span key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: item.color }} />
                    {item.label} {item.count}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Article list */}
          {articles.length > 0 && (
            <div style={{ marginTop: 44 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, paddingBottom: 16, borderBottom: `1.5px solid ${C.text}` }}>
                <span style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: ".14em", color: C.muted, textTransform: "uppercase" }}>Analyzed articles</span>
                <span style={{ fontFamily: F.mono, fontSize: 11, color: "#c0b9ab" }}>{articles.length}</span>
              </div>
              {articles.map((article, idx) => <DashArticleRow key={article.id} article={article} idx={idx + 1} />)}
            </div>
          )}
        </>
      ) : (
        <div style={{ marginTop: 48, textAlign: "center" }}>
          <div style={{ fontFamily: F.serif, fontSize: 20, color: C.muted, marginBottom: 16 }}>No analyzed articles for "{topicKey}" yet.</div>
          <button onClick={onSearchClick} style={{ padding: "11px 22px", border: "none", borderRadius: 9, background: C.text, color: C.bg, fontFamily: F.sans, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
            Search and analyze →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Feed tab ─────────────────────────────────────────────────────────────────
function FeedTab({
  analyses, allTopics, loading, sentimentFilter, topicFilter,
  onSentimentFilter, onTopicFilter,
}: {
  analyses: AnalysisRow[];
  allTopics: string[];
  loading: boolean;
  sentimentFilter: string;
  topicFilter: string;
  onSentimentFilter: (v: string) => void;
  onTopicFilter: (v: string) => void;
}) {
  return (
    <div>
      <div style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: ".16em", color: C.muted, textTransform: "uppercase", marginBottom: 12 }}>Feed</div>
      <h1 style={{ fontFamily: F.serif, fontWeight: 500, fontSize: 38, lineHeight: 1.05, letterSpacing: "-.015em", margin: "0 0 6px" }}>All analyzed articles</h1>
      <div style={{ fontSize: 14.5, color: C.muted3 }}>Newest first, with the rationale behind every score surfaced inline.</div>

      <div style={{ display: "flex", alignItems: "center", gap: 26, flexWrap: "wrap", marginTop: 28, padding: "16px 0", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: ".12em", color: "#b3ac9f", textTransform: "uppercase" }}>Sentiment</span>
          <div style={{ display: "flex", gap: 7 }}>
            {["all", "positive", "neutral", "negative"].map((s) => (
              <Pill key={s} active={sentimentFilter === s} onClick={() => onSentimentFilter(s)}>
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </Pill>
            ))}
          </div>
        </div>
        {allTopics.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: ".12em", color: "#b3ac9f", textTransform: "uppercase" }}>Topic</span>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {allTopics.map((t) => (
                <Pill key={t} active={topicFilter === t} onClick={() => onTopicFilter(t)}>
                  {t === "all" ? "All topics" : t}
                </Pill>
              ))}
            </div>
          </div>
        )}
        <span style={{ marginLeft: "auto", fontFamily: F.mono, fontSize: 12, color: C.muted }}>{analyses.length} articles</span>
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "32px 0", fontFamily: F.mono, fontSize: 12, color: C.muted, letterSpacing: ".05em" }}>
          <span style={{ width: 12, height: 12, border: `2px solid ${C.border}`, borderTopColor: C.text, borderRadius: 999, display: "inline-block", animation: "tnr-spin .7s linear infinite" }} />
          Loading…
        </div>
      )}

      {!loading && analyses.length === 0 && (
        <div style={{ textAlign: "center", padding: "64px 0" }}>
          <div style={{ fontFamily: F.mono, fontSize: 28, color: "#cfc8ba", marginBottom: 14 }}>◎</div>
          <div style={{ fontFamily: F.serif, fontSize: 22, fontWeight: 500, marginBottom: 18 }}>No articles match these filters</div>
          <button onClick={() => { onSentimentFilter("all"); onTopicFilter("all"); }} style={{ padding: "9px 18px", border: `1px solid ${C.text}`, borderRadius: 8, background: "transparent", color: C.text, fontFamily: F.sans, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Clear filters
          </button>
        </div>
      )}

      {analyses.map((article) => (
        <article key={article.id} style={{ padding: "26px 0", borderBottom: `1px solid ${C.border2}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {article.topic && (
                <span style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: ".07em", textTransform: "uppercase", color: C.muted3, background: "#eee8dc", border: `1px solid ${C.border}`, padding: "3px 8px", borderRadius: 5 }}>
                  {article.topic}
                </span>
              )}
              <span style={{ fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".04em" }}>
                {article.source} · {formatDate(article.publishedAt)}
              </span>
            </div>
            <SentimentBadge sentiment={article.sentiment} score={article.sentimentScore} />
          </div>
          <h2 style={{ fontFamily: F.serif, fontWeight: 500, fontSize: 23, lineHeight: 1.22, letterSpacing: "-.012em", margin: "0 0 9px" }}>{article.title}</h2>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: C.muted2, margin: 0, maxWidth: "76ch" }}>{article.summary}</p>
          <div style={{ marginTop: 16, background: "#efece4", border: "1px solid #e7e2d6", borderRadius: 10, padding: "13px 16px", maxWidth: "76ch" }}>
            <div style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: ".14em", textTransform: "uppercase", color: "#a39c8e", marginBottom: 6 }}>Why this sentiment</div>
            <div style={{ fontFamily: F.serif, fontStyle: "italic", fontSize: 15, lineHeight: 1.5, color: C.dim }}>{article.rationale}</div>
          </div>
        </article>
      ))}
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────
export function NewsSearch() {
  const [screen, setScreen] = useState<Screen>("search");
  const [query, setQuery] = useState("artificial intelligence");
  const [lastTopic, setLastTopic] = useState<string | null>(null);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [topN, setTopN] = useState(3);
  const [analyzingUrls, setAnalyzingUrls] = useState<Set<string>>(new Set());
  const [analysesByUrl, setAnalysesByUrl] = useState<Record<string, AnalysisResponse>>(Object.create(null));
  const [storedAnalyses, setStoredAnalyses] = useState<AnalysisRow[]>([]);
  const [storedLoading, setStoredLoading] = useState(false);
  const [topics, setTopics] = useState<TopicAggregate[]>([]);
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");

  const canAnalyze = articles.length > 0 && searchState !== "loading";
  const topNOptions = useMemo(() => [3, 5, 10].filter((v) => v <= Math.max(articles.length, 3)), [articles.length]);

  useEffect(() => {
    let active = true;
    setStoredLoading(true);
    Promise.all([fetchStoredAnalyses(), fetchTopicAggregates()])
      .then(([analyses, topicRows]) => {
        if (!active) return;
        setStoredAnalyses(analyses);
        setTopics(topicRows);
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Failed to load data."); })
      .finally(() => { if (active) setStoredLoading(false); });
    return () => { active = false; };
  }, []);

  async function refreshStoredViews() {
    setStoredLoading(true);
    try {
      const [analyses, topicRows] = await Promise.all([fetchStoredAnalyses(), fetchTopicAggregates()]);
      setStoredAnalyses(analyses);
      setTopics(topicRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setStoredLoading(false);
    }
  }

  async function runSearch(q: string) {
    setSearchState("loading");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/news?q=${encodeURIComponent(q)}&max=10`, { headers: { Accept: "application/json" } });
      const payload = (await response.json()) as NewsSearchResult | ApiError;
      if (!response.ok) throw new Error("error" in payload ? payload.error : "News search failed.");
      const result = payload as NewsSearchResult;
      setArticles(result.articles);
      setLastTopic(result.query);
      setSearchState(result.articles.length === 0 ? "empty" : "results");
    } catch (err) {
      setArticles([]);
      setSearchState("error");
      setError(err instanceof Error ? err.message : "News search failed.");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) { setError("Enter a topic to search."); return; }
    void runSearch(trimmed);
  }

  function handleRetry() {
    if (query.trim()) void runSearch(query.trim());
  }

  async function analyzeSingleArticle(article: NewsArticle) {
    setAnalyzingUrls((cur) => new Set(cur).add(article.url));
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ article, topic: (lastTopic ?? query.trim()) || null }),
      });
      const payload = (await response.json()) as AnalysisResponse | ApiError;
      if (!response.ok) throw new Error("error" in payload ? payload.error : "Analysis failed.");
      const result = payload as AnalysisResponse;
      setAnalysesByUrl((cur) => ({ ...cur, [article.url]: result }));
      setNotice(result.cached ? "Loaded stored analysis." : "Analysis saved.");
      await refreshStoredViews();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setAnalyzingUrls((cur) => { const next = new Set(cur); next.delete(article.url); return next; });
    }
  }

  async function analyzeTopArticles() {
    const count = Math.min(topN, articles.length);
    const targets = articles.slice(0, count);
    const urls = targets.map((a) => a.url);
    setAnalyzingUrls((cur) => new Set([...cur, ...urls]));
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/analyses/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ topic: lastTopic ?? query.trim(), articles: targets }),
      });
      const payload = (await response.json()) as BatchAnalysisResponse | ApiError;
      if (!response.ok) throw new Error("error" in payload ? payload.error : "Batch analysis failed.");
      const result = payload as BatchAnalysisResponse;
      setAnalysesByUrl((cur) => {
        const next = { ...cur };
        for (const item of result.results) next[item.analysis.url] = item;
        return next;
      });
      setNotice(`Analyzed ${result.analyzed} articles for "${result.topic}".`);
      await refreshStoredViews();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch analysis failed.");
    } finally {
      setAnalyzingUrls((cur) => { const next = new Set(cur); for (const u of urls) next.delete(u); return next; });
    }
  }

  // Derived state
  const dashTopicKey = lastTopic ?? (topics.length > 0 ? topics[0].topic : null);
  const dashAggregate = dashTopicKey ? topics.find((t) => t.topic === dashTopicKey) : undefined;
  const dashArticles = storedAnalyses.filter((a) => !dashTopicKey || a.topic === dashTopicKey);

  const feedTopics = useMemo(() => {
    const keys = Array.from(new Set(storedAnalyses.map((a) => a.topic ?? "unknown")));
    return ["all", ...keys];
  }, [storedAnalyses]);

  const filteredFeed = storedAnalyses.filter((a) =>
    (sentimentFilter === "all" || a.sentiment === sentimentFilter.toUpperCase()) &&
    (topicFilter === "all" || a.topic === topicFilter),
  );

  const today = new Date().toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      {/* ─── Header ─── */}
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(244,242,236,.86)", backdropFilter: "blur(10px)", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 32px", height: 62, display: "flex", alignItems: "center", gap: 36 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 23, letterSpacing: "-.01em" }}>TENOR</span>
            <span style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: ".14em", color: C.muted, textTransform: "uppercase" }}>news mood index</span>
          </div>
          <nav style={{ display: "flex", gap: 26, alignItems: "center", height: "100%" }}>
            {(["search", "dashboard", "feed"] as Screen[]).map((key) => {
              const active = screen === key;
              return (
                <button key={key} onClick={() => setScreen(key)} style={{
                  height: 62, padding: 0, border: "none", background: "transparent", cursor: "pointer",
                  fontFamily: F.sans, fontSize: 13.5, letterSpacing: ".01em",
                  color: active ? C.text : "#8a857b",
                  fontWeight: active ? 700 : 500,
                  borderBottom: `2px solid ${active ? C.text : "transparent"}`,
                }}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </button>
              );
            })}
          </nav>
          <div style={{ marginLeft: "auto", fontFamily: F.mono, fontSize: 11, color: C.muted, letterSpacing: ".04em" }}>
            {today} · {storedAnalyses.length} ANALYZED
          </div>
        </div>
      </header>

      {/* ─── Main ─── */}
      <main style={{ maxWidth: 1160, margin: "0 auto", padding: "44px 32px 96px" }}>
        {error && screen !== "search" && (
          <div style={{ marginBottom: 20, padding: "11px 16px", borderRadius: 10, background: "#f2e8e5", color: C.negText, fontFamily: F.sans, fontSize: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 999, background: "#f1e6e1", fontFamily: F.mono, fontSize: 13 }}>!</span>
            {error}
          </div>
        )}
        {notice && (
          <div style={{ marginBottom: 20, padding: "11px 16px", borderRadius: 10, background: "#e8f2eb", color: C.posText, fontFamily: F.mono, fontSize: 12, letterSpacing: ".02em" }}>
            {notice}
          </div>
        )}

        {screen === "search" && (
          <SearchTab
            query={query} onQuery={setQuery} onSubmit={handleSubmit} onRetry={handleRetry}
            searchState={searchState} articles={articles}
            topN={topN} setTopN={setTopN} topNOptions={topNOptions}
            analyzingUrls={analyzingUrls} analysesByUrl={analysesByUrl}
            onAnalyzeSingle={analyzeSingleArticle} onAnalyzeTop={analyzeTopArticles}
            canAnalyze={canAnalyze} lastTopic={lastTopic}
            onGoToDashboard={() => setScreen("dashboard")}
          />
        )}
        {screen === "dashboard" && (
          <DashboardTab
            topicKey={dashTopicKey}
            aggregate={dashAggregate}
            articles={dashArticles}
            loading={storedLoading}
            onSearchClick={() => setScreen("search")}
          />
        )}
        {screen === "feed" && (
          <FeedTab
            analyses={filteredFeed}
            allTopics={feedTopics}
            loading={storedLoading}
            sentimentFilter={sentimentFilter}
            topicFilter={topicFilter}
            onSentimentFilter={setSentimentFilter}
            onTopicFilter={setTopicFilter}
          />
        )}
      </main>
    </div>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────
async function fetchStoredAnalyses() {
  const response = await fetch("/api/analyses", { headers: { Accept: "application/json" } });
  const payload = (await response.json()) as { analyses: AnalysisRow[] } | ApiError;
  if (!response.ok) throw new Error("error" in payload ? payload.error : "Failed to load analyses.");
  return (payload as { analyses: AnalysisRow[] }).analyses;
}

async function fetchTopicAggregates() {
  const response = await fetch("/api/topics", { headers: { Accept: "application/json" } });
  const payload = (await response.json()) as { topics: TopicAggregate[] } | ApiError;
  if (!response.ok) throw new Error("error" in payload ? payload.error : "Failed to load topics.");
  return (payload as { topics: TopicAggregate[] }).topics;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
