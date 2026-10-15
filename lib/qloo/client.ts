import { DOMAIN_URN, type Domain } from "@/lib/types";

/** Hackathon keys only work on this host. */
export const QLOO_BASE_URL = "https://hackathon.api.qloo.com";

const TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;

type CacheEntry = { expires: number; value: unknown };

const globalCache = globalThis as unknown as { __tastecastQlooCache?: Map<string, CacheEntry> };
const cache = globalCache.__tastecastQlooCache ?? new Map<string, CacheEntry>();
globalCache.__tastecastQlooCache = cache;

export class QlooError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "QlooError";
    this.status = status;
  }
}

export function qlooConfigured(): boolean {
  return Boolean(process.env.QLOO_API_KEY?.trim());
}

function apiKey(): string {
  const key = process.env.QLOO_API_KEY?.trim();
  if (!key) {
    throw new QlooError("QLOO_API_KEY is not configured on the server.", 500);
  }
  return key;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheKey(path: string, params: Record<string, string>) {
  const usp = new URLSearchParams(params);
  usp.sort();
  return `${path}?${usp.toString()}`;
}

function readCache(key: string): unknown | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function writeCache(key: string, value: unknown) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { expires: Date.now() + TTL_MS, value });
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "errors" in body) {
    const errors = (body as { errors?: unknown }).errors;
    if (Array.isArray(errors) && errors[0] && typeof errors[0] === "object") {
      const message = (errors[0] as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message.trim();
    }
  }
  if (status === 401 || status === 403) return "Qloo rejected the API key.";
  if (status === 429) return "Qloo rate limit reached. Try again in a moment.";
  return `Qloo request failed (${status}).`;
}

async function qlooGet(path: string, params: Record<string, string>, attempt = 0): Promise<unknown> {
  const key = cacheKey(path, params);
  const cached = readCache(key);
  if (cached !== undefined) return cached;

  const url = new URL(path, QLOO_BASE_URL);
  for (const [name, value] of Object.entries(params)) {
    if (value) url.searchParams.set(name, value);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Api-Key": apiKey(),
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (response.status === 404) {
      const empty = { results: [] };
      writeCache(key, empty);
      return empty;
    }

    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await sleep(450 * (attempt + 1));
      return qlooGet(path, params, attempt + 1);
    }

    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    if (!response.ok) {
      throw new QlooError(errorMessage(body, response.status), response.status);
    }
    writeCache(key, body);
    return body;
  } catch (error) {
    if (error instanceof QlooError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new QlooError("Qloo took too long to respond.", 504);
    }
    throw new QlooError("Could not reach the Qloo API.", 502);
  } finally {
    clearTimeout(timer);
  }
}

export type QlooTag = { id: string; name: string; type: string };

export type QlooEntity = {
  id: string;
  name: string;
  entityType: string;
  popularity: number | null;
  affinity: number | null;
  description: string;
  imageUrl: string | null;
  year: number | null;
  locality: string | null;
  tags: QlooTag[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function tagList(value: unknown): QlooTag[] {
  if (!Array.isArray(value)) return [];
  const tags: QlooTag[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;
    const id = asString(record.id) || asString(record.tag_id);
    const name = asString(record.name);
    const type = asString(record.type);
    if (!id.startsWith("urn:tag:") || !name) continue;
    tags.push({ id, name, type });
  }
  return tags;
}

function entityTypeOf(record: Record<string, unknown>): string {
  if (Array.isArray(record.types)) {
    const first = record.types.find((item) => typeof item === "string") as string | undefined;
    if (first) return first;
  }
  const subtype = asString(record.subtype);
  if (subtype.startsWith("urn:entity:")) return subtype;
  const type = asString(record.type);
  if (type.startsWith("urn:entity:") && type !== "urn:entity") return type;
  return "";
}

function safeImage(value: unknown): string | null {
  const record = asRecord(value);
  const url = record ? asString(record.url) : asString(value);
  if (!url.startsWith("https://")) return null;
  try {
    const host = new URL(url).hostname;
    if (host === "images.qloo.com" || host.endsWith(".qloo.com")) return url;
  } catch {
    return null;
  }
  return null;
}

function localityOf(record: Record<string, unknown>, properties: Record<string, unknown> | null): string | null {
  const address = properties?.address ?? record.address;
  if (typeof address === "string" && address.trim()) return address.trim();
  const geo = asRecord(address) ?? asRecord(properties?.geocode);
  if (!geo) return null;
  const parts = [asString(geo.name), asString(geo.admin1_region), asString(geo.country_code)].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function descriptionOf(properties: Record<string, unknown> | null): string {
  if (!properties) return "";
  const direct = asString(properties.description) || asString(properties.short_description);
  if (direct) return direct;
  const shorts = properties.short_descriptions;
  if (Array.isArray(shorts)) {
    const first = asRecord(shorts[0]);
    if (first) return asString(first.value);
  }
  return "";
}

function yearOf(properties: Record<string, unknown> | null): number | null {
  if (!properties) return null;
  const year =
    asNumber(properties.release_year) ??
    asNumber(properties.publication_year) ??
    asNumber(properties.finale_year);
  if (year && year > 1800 && year < 2200) return year;
  return null;
}

function entityFrom(record: Record<string, unknown>): QlooEntity | null {
  const id = asString(record.entity_id) || asString(record.id);
  const name = asString(record.name);
  if (!id || !name) return null;
  const properties = asRecord(record.properties);
  const query = asRecord(record.query);
  return {
    id,
    name,
    entityType: entityTypeOf(record),
    popularity: asNumber(record.popularity),
    affinity: query ? asNumber(query.affinity) : null,
    description: descriptionOf(properties).replace(/\s+/g, " ").slice(0, 280),
    imageUrl: safeImage(properties?.image),
    year: yearOf(properties),
    locality: localityOf(record, properties),
    tags: tagList(record.tags).slice(0, 16),
  };
}

function entitiesFrom(payload: unknown): QlooEntity[] {
  const root = asRecord(payload);
  const results = root?.results;
  const list = Array.isArray(results) ? results : asRecord(results)?.entities;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    const entity = entityFrom(record);
    return entity ? [entity] : [];
  });
}

function tagsFrom(payload: unknown): QlooTag[] {
  const root = asRecord(payload);
  const results = asRecord(root?.results);
  return tagList(results?.tags);
}

const SUPPORTED_SIGNAL_TYPES = new Set<string>(Object.values(DOMAIN_URN));

export async function searchEntities(query: string, types?: string[]): Promise<QlooEntity[]> {
  const params: Record<string, string> = { query: query.slice(0, 120), take: "6" };
  if (types?.length) params.types = types.join(",");
  const payload = await qlooGet("/search", params);
  return entitiesFrom(payload).filter((entity) => SUPPORTED_SIGNAL_TYPES.has(entity.entityType));
}

export async function searchTags(query: string, parentType?: string): Promise<QlooTag[]> {
  const params: Record<string, string> = { "filter.query": query.slice(0, 80), take: "12" };
  if (parentType) params["filter.parents.types"] = parentType;
  const payload = await qlooGet("/v2/tags", params);
  const tags = tagsFrom(payload);
  if (tags.length || !parentType) return tags;
  return tagsFrom(await qlooGet("/v2/tags", { "filter.query": query.slice(0, 80), take: "12" }));
}

/**
 * Parameters the Insights API documents for each filter.type.
 * `filter.location.query` is documented beside `filter.location.radius` and
 * is honored for places on the hackathon API. It is not sent for other types.
 */
const INSIGHT_PARAMS: Record<Domain, ReadonlySet<string>> = {
  movie: setOf([
    "filter.type",
    "take",
    "offset",
    "signal.interests.entities",
    "signal.interests.tags",
    "filter.tags",
    "operator.filter.tags",
    "filter.exclude.entities",
    "filter.exclude.tags",
    "filter.popularity.min",
    "filter.release_year.min",
    "filter.release_year.max",
    "filter.content_rating",
  ]),
  tv_show: setOf([
    "filter.type",
    "take",
    "offset",
    "signal.interests.entities",
    "signal.interests.tags",
    "filter.tags",
    "operator.filter.tags",
    "filter.exclude.entities",
    "filter.exclude.tags",
    "filter.release_year.min",
    "filter.release_year.max",
  ]),
  artist: setOf([
    "filter.type",
    "take",
    "offset",
    "signal.interests.entities",
    "signal.interests.tags",
    "filter.tags",
    "operator.filter.tags",
    "filter.exclude.entities",
    "filter.exclude.tags",
  ]),
  book: setOf([
    "filter.type",
    "take",
    "offset",
    "signal.interests.entities",
    "signal.interests.tags",
    "filter.tags",
    "operator.filter.tags",
    "filter.exclude.entities",
    "filter.publication_year.min",
    "filter.publication_year.max",
  ]),
  podcast: setOf([
    "filter.type",
    "take",
    "offset",
    "signal.interests.entities",
    "signal.interests.tags",
    "filter.tags",
    "operator.filter.tags",
    "filter.exclude.entities",
  ]),
  place: setOf([
    "filter.type",
    "take",
    "offset",
    "signal.interests.entities",
    "signal.interests.tags",
    "filter.tags",
    "operator.filter.tags",
    "filter.exclude.entities",
    "filter.exclude.tags",
    "filter.location.query",
    "filter.location.radius",
    "filter.price_level.min",
    "filter.price_level.max",
  ]),
  destination: setOf([
    "filter.type",
    "take",
    "offset",
    "signal.interests.entities",
    "signal.interests.tags",
    "filter.tags",
    "operator.filter.tags",
    "filter.exclude.entities",
    "filter.geocode.name",
    "filter.geocode.country_code",
  ]),
  brand: setOf([
    "filter.type",
    "take",
    "offset",
    "signal.interests.entities",
    "signal.interests.tags",
    "filter.tags",
    "operator.filter.tags",
    "filter.exclude.entities",
  ]),
  person: setOf([
    "filter.type",
    "take",
    "offset",
    "signal.interests.entities",
    "signal.interests.tags",
    "filter.tags",
    "filter.exclude.entities",
  ]),
  video_game: setOf([
    "filter.type",
    "take",
    "offset",
    "signal.interests.entities",
    "signal.interests.tags",
    "filter.tags",
    "filter.exclude.entities",
  ]),
};

function setOf(values: string[]) {
  return new Set(values);
}

export type InsightQuery = {
  domain: Domain;
  entityIds: string[];
  tagIds: string[];
  filterTagIds?: string[];
  location?: string | null;
  excludeIds?: string[];
  take?: number;
};

export async function fetchInsights(query: InsightQuery): Promise<QlooEntity[]> {
  const allowed = INSIGHT_PARAMS[query.domain];
  const params: Record<string, string> = {
    "filter.type": DOMAIN_URN[query.domain],
    take: String(Math.min(query.take ?? 6, 20)),
  };
  if (query.entityIds.length) params["signal.interests.entities"] = query.entityIds.slice(0, 8).join(",");
  if (query.tagIds.length) params["signal.interests.tags"] = query.tagIds.slice(0, 4).join(",");
  if (query.filterTagIds?.length) {
    params["filter.tags"] = query.filterTagIds.slice(0, 3).join(",");
    if (query.filterTagIds.length > 1) params["operator.filter.tags"] = "intersection";
  }
  if (query.location && query.domain === "place") params["filter.location.query"] = query.location;
  if (query.excludeIds?.length) params["filter.exclude.entities"] = query.excludeIds.slice(0, 15).join(",");

  const safe: Record<string, string> = {};
  for (const [name, value] of Object.entries(params)) {
    if (allowed.has(name) && value) safe[name] = value;
  }
  if (query.domain === "destination" && !safe["signal.interests.entities"]) {
    throw new QlooError("Destination insights require a resolved entity signal.", 400);
  }
  const payload = await qlooGet("/v2/insights", safe);
  return entitiesFrom(payload);
}
