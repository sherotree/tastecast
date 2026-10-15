# TasteCast

TasteCast turns a sentence — a vibe, an occasion, a film you will not shut up about — into a cross-domain cast from [Qloo](https://qloo.devpost.com/). Film, artists, books, places, and the rest come back as Qloo entities, with the affinity score and tags that tied them to what you named.

A planner decides which lookups to run. It does not write the recommendations. If `OPENAI_API_KEY` is set, a model can draft the plan. If it is not, a rule-based planner runs the same Qloo calls, so the demo still works.

Submitter: Sherotree.

## Why Qloo is the point

Keyword search can find “jazz” or “animation.” It cannot tell you that people who love a Studio Ghibli film also turn up next to a particular Brooklyn restaurant, a novel, or a pianist. That link is in Qloo’s taste graph.

TasteCast uses three hackathon endpoints, and only the hackathon host:

| Step | Call | What it is for |
| --- | --- | --- |
| Resolve a name | `GET /search` | Entity id. There is no `/v2/insights/search`. |
| Resolve a word like “jazz” | `GET /v2/tags` | Tag id. Insights will ignore a freeform tag string. |
| Ask for the cast | `GET /v2/insights` | Entities for one `filter.type`, signaled by those ids. |

Auth is the `X-Api-Key` header. The key stays on the server. Legacy `/recommendations` and `/recs` are not used.

The hackathon API currently rejects `filter.type=urn:entity:video_game` with a 400. Ask for games and the board will say so instead of inventing any.

## Try it

- `/` — what this is, and **Start casting**
- `/demo` — judge path: run the Ghibli weekend, or ping Qloo
- `/cast` — the desk
- `/api/health` — whether the key and planner are configured
- `/api/health?live=1` — one real movie search, summarized, not dumped

After a board lands, the chips “Swap the movie”, “More places”, and “Keep music darker” each trigger another Insights call.

## Local run

```bash
npm install
cp .env.example .env.local
# put your hackathon key in QLOO_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build
npm start
```

## Environment

| Variable | Required | Role |
| --- | --- | --- |
| `QLOO_API_KEY` | Yes, for live casts | Sent only from Route Handlers as `X-Api-Key`. |
| `OPENAI_API_KEY` | No | Lets the planner read looser sentences. Recommendations still come from Qloo. |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o-mini`. |
| `OPENAI_BASE_URL` | No | OpenAI-compatible chat completions URL. |

The base URL is fixed in code to `https://hackathon.api.qloo.com`. Hackathon keys fail on staging and production, so there is no setting to point this app at those hosts.

Do not commit `.env.local`. `.env.example` ships with empty values.

## Architecture

```
browser  →  POST /api/cast
              planner (OpenAI JSON plan, or rules)
              GET /search            entity ids
              GET /v2/tags           tag ids
              GET /v2/insights       one call per domain
           ←  cards, affinity, shared tags, call log
```

`/api/cast` streams newline-delimited JSON: status lines, then a result. The client shows “searching → tags → insights” while the calls are in flight.

Insight parameters are whitelisted per entity type. `filter.location.query` is sent only for places; it is documented with `filter.location.radius` and the hackathon API applies it. Invalid parameters are otherwise dropped, because Qloo ignores them silently.

Qloo responses are cached in process memory for about ten minutes. They are not written into the repo.

## Deploy on Vercel

This repo is not deployed from here.

1. Import the GitHub repo in Vercel. Framework preset: Next.js. Install command: `npm install`.
2. Set `QLOO_API_KEY` in Project Settings → Environment Variables. Add `OPENAI_API_KEY` only if you want the model planner.
3. Deploy. The key must not be a `NEXT_PUBLIC_` variable.

`maxDuration` on the cast route is 60 seconds so a multi-domain board can finish.

## License

MIT. See [LICENSE](LICENSE).
