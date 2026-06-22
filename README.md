# News Summary Challenge

A small Next.js app for topic-first news analysis: search recent articles, choose what matters, summarize with OpenAI, store results, and review topic-level sentiment.

## Architecture

- **Next.js App Router**: UI plus REST handlers in one codebase for easy live coding.
- **Server-side API proxy**: GNews and OpenAI keys stay on the server.
- **Neon Postgres + Drizzle**: Vercel Marketplace provisions Neon; Drizzle keeps schema/migrations typed and SQL-shaped.
- **Driver split**: production/serverless uses `@neondatabase/serverless` + `drizzle-orm/neon-http`; local dev uses `pg` + `drizzle-orm/node-postgres` against `DATABASE_URL`.
- **Core folders**:
  - `lib/news`: GNews client, normalized article type, Zod validation.
  - `lib/ai`: OpenAI SDK wrapper using `gpt-4.1-nano`.
  - `lib/db`: Drizzle singleton and schema.
  - `lib/analyses`: idempotent analyze/store service shared by single and batch routes.

## REST endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/news?q=&max=` | Search GNews. `max` is clamped to `1..10`; GNews free tier is 100 req/day. |
| `POST` | `/api/analyses` | Analyze one article and store it. Returns cached row if URL already exists. |
| `GET` | `/api/analyses?sentiment=&topic=&limit=` | Newest stored analyses first. Optional exact `sentiment` and `topic`; `limit` max 100. |
| `POST` | `/api/analyses/batch` | Analyze top articles for a topic sequentially. Hard cap: 5 OpenAI calls. |
| `GET` | `/api/topics` | Topic aggregates: count, average score, and sentiment distribution. |

All routes validate input with **Zod** and return consistent JSON errors.

## Product rationale

The app is **topic-first** because users usually care about a question or theme, not a random article. Search establishes the topic, selected articles become evidence, and the dashboard shows how that topic trends across saved analyses.

## Idempotency and caching

`analyses.url` is unique. Before calling OpenAI, `/api/analyses` checks whether the URL is already stored. If yes, it returns the stored row and skips OpenAI. Inserts use `onConflictDoNothing` so racing requests do not duplicate rows; the loser re-reads the stored result.

## AI choice

Each article uses one structured OpenAI call with `response_format: { type: "json_object" }` and a tight system prompt. Output is parsed into `{ summary, sentiment, score, rationale }`, with score constrained to `-1..1`.

## Why Drizzle

Drizzle keeps the schema in TypeScript, makes migrations explicit, and still feels close to SQL. That is useful for a live coding follow-up: no heavy ORM magic, but enough type safety to move fast.

## Batch cap

Batch analysis is sequential and capped at **5** articles. This keeps OpenAI spend predictable, reduces rate-limit risk, and keeps the UX responsive. GNews search is separately capped at 10 results per request.

## Deploy to Vercel with Neon

1. Create/import the project in Vercel.
2. Install **Neon Postgres** from the Vercel Marketplace for this project. The integration creates the Neon project/database and injects connection env vars automatically.
3. Add `GNEWS_API_KEY` and `OPENAI_API_KEY` in Vercel project settings.
4. Pull env vars locally when needed:

```bash
vercel env pull .env
```

5. Run migrations against the Neon **direct/unpooled** connection string. Drizzle Kit uses node-postgres internally; set `DATABASE_URL` to the direct Neon URL while running migrations:

```bash
DATABASE_URL="postgresql://...direct-neon-url...?sslmode=require" npm run db:migrate
```

At runtime the app reads `DATABASE_URL`; in Vercel/serverless it uses Neon HTTP, locally it falls back to `pg`.

## Run locally

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

Required env vars: `GNEWS_API_KEY`, `OPENAI_API_KEY`, `DATABASE_URL`.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
npm test
```
