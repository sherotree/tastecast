import { isDomain, type Domain, type Memory, type Plan, type TagScope } from "@/lib/types";
import { planWithRules, sanitizeMemory } from "@/lib/agent/rules";

const SYSTEM = `You plan Qloo API calls for TasteCast. You do not recommend films, artists, places, or any other titles. Output one JSON object only.

Schema:
{
  "action": "clarify" | "cast",
  "question": string | null,
  "mode": "fresh" | "refine" | "expand",
  "entityQueries": string[],
  "domains": ("movie"|"tv_show"|"artist"|"book"|"podcast"|"place"|"destination"|"brand"|"person"|"video_game")[],
  "location": string | null,
  "tagQueries": [{"query": string, "hint": "artist"|"place"|"media"}],
  "dining": boolean,
  "excludeDomains": string[],
  "note": string
}

Rules:
- entityQueries are names the user actually wrote, copied closely, for GET /search.
- tagQueries are short keywords such as jazz or dark, for GET /v2/tags. Never invent a tag URN.
- domains are the Insight filter types to request. A weekend with film, music, and dining is movie, artist, place.
- A single title and no domain request is movie, artist, book, destination.
- If they want places or dining and no city is known, omit place and set question to ask for a city. Still cast the other domains.
- If the message is only a greeting and there are no seeds, action is clarify.
- mode refine when they ask to swap, see more of a domain, or restyle, and seeds already exist. Put that domain in excludeDomains.
- mode expand when they add a domain but keep the same favorites.
- mode fresh when they name new favorites.
- Do not include recommendation titles in the JSON.`;

function asHint(value: unknown): TagScope {
  return value === "artist" || value === "place" || value === "media" ? value : "any";
}

function grounded(query: string, corpus: string): boolean {
  const lower = corpus.toLowerCase();
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3);
  if (!tokens.length) return lower.includes(query.toLowerCase());
  return tokens.some((token) => lower.includes(token));
}

function parsePlan(value: unknown, corpus: string, memory: Memory): Plan | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const action = raw.action === "clarify" ? "clarify" : raw.action === "cast" ? "cast" : null;
  if (!action) return null;
  const domains = Array.isArray(raw.domains)
    ? raw.domains.filter((domain): domain is Domain => typeof domain === "string" && isDomain(domain)).slice(0, 5)
    : [];
  const entityQueries = Array.isArray(raw.entityQueries)
    ? raw.entityQueries
        .filter((query): query is string => typeof query === "string" && grounded(query, corpus))
        .map((query) => query.trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 4)
    : [];
  const tagQueries = Array.isArray(raw.tagQueries)
    ? raw.tagQueries
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const query = typeof (item as { query?: unknown }).query === "string" ? (item as { query: string }).query.trim() : "";
          if (!query || !grounded(query, corpus)) return null;
          return { query: query.slice(0, 40), hint: asHint((item as { hint?: unknown }).hint) };
        })
        .filter((item): item is { query: string; hint: TagScope } => Boolean(item))
        .slice(0, 3)
    : [];
  const excludeDomains = Array.isArray(raw.excludeDomains)
    ? raw.excludeDomains.filter((domain): domain is Domain => typeof domain === "string" && isDomain(domain))
    : [];
  const mode = raw.mode === "refine" || raw.mode === "expand" || raw.mode === "fresh" ? raw.mode : "fresh";
  const location = typeof raw.location === "string" && raw.location.trim() ? raw.location.trim().slice(0, 60) : memory.location;
  const question = typeof raw.question === "string" && raw.question.trim() ? raw.question.trim().slice(0, 240) : null;

  if (action === "cast" && mode === "fresh" && !entityQueries.length && !tagQueries.length && !memory.seeds.length) {
    return null;
  }
  if (action === "cast" && !domains.length) return null;

  return {
    action,
    question,
    mode,
    entityQueries,
    domains,
    location,
    tagQueries,
    dining: Boolean(raw.dining),
    excludeDomains,
    note: "openai plan",
  };
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text;
  return JSON.parse(source);
}

async function complete(body: Record<string, unknown>): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const base = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    return payload.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function planCast(messages: { role: string; content: string }[], rawMemory: unknown): Promise<{
  plan: Plan;
  planner: "openai" | "rules";
}> {
  const rules = planWithRules(messages, rawMemory);
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return { plan: rules, planner: "rules" };

  const memory = sanitizeMemory(rawMemory);
  const corpus = messages.map((message) => message.content).join("\n");
  const slim = {
    seeds: memory.seeds.map((seed) => seed.name),
    location: memory.location,
    domains: memory.domains,
    tags: memory.tagSignals.map((tag) => tag.name),
    dining: memory.dining,
  };
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const user = JSON.stringify({ messages: messages.slice(-8), memory: slim });
  let content = await complete({
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  });
  if (!content) {
    content = await complete({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    });
  }
  if (!content) return { plan: rules, planner: "rules" };

  try {
    const parsed = parsePlan(extractJson(content), corpus, memory);
    if (!parsed) return { plan: rules, planner: "rules" };
    if (parsed.action === "clarify" && rules.action === "cast") return { plan: rules, planner: "rules" };
    return { plan: parsed, planner: "openai" };
  } catch {
    return { plan: rules, planner: "rules" };
  }
}
