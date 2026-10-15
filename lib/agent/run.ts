import { explainFit, rankTags } from "@/lib/agent/explain";
import { planCast } from "@/lib/agent/llm";
import { sanitizeMemory } from "@/lib/agent/rules";
import { fetchInsights, qlooConfigured, QlooError, searchEntities, searchTags, type QlooEntity, type QlooTag } from "@/lib/qloo/client";
import {
  DOMAIN_LABEL,
  DOMAIN_URN,
  type CastEvent,
  type CastResult,
  type Domain,
  type DomainGroup,
  type Memory,
  type Plan,
  type Seed,
  type TagScope,
  type TagSignal,
  type TasteCard,
} from "@/lib/types";

const PARENT_BY_HINT: Record<TagScope, string | undefined> = {
  artist: "urn:entity:artist",
  place: "urn:entity:place",
  media: "urn:entity:movie",
  any: undefined,
};

const PREFER_BY_HINT: Record<TagScope, string[]> = {
  artist: ["urn:tag:genre:music", "urn:tag:music:qloo", "urn:tag:subgenre:qloo", "urn:tag:style:qloo", "urn:tag:artist:qloo"],
  place: ["urn:tag:genre:place", "urn:tag:category:place", "urn:tag:cuisine", "urn:tag:amenity:place", "urn:tag:dining_option:qloo"],
  media: ["urn:tag:genre:media", "urn:tag:genre:qloo", "urn:tag:keyword:media", "urn:tag:style:qloo", "urn:tag:theme:qloo"],
  any: [],
};

function scopeForTag(type: string, hint: TagScope): TagScope {
  if (hint === "artist" || hint === "place" || hint === "media") return hint;
  if (/music|instrument|voice_type|:artist:/.test(type)) return "artist";
  if (/:place|cuisine|dining|destination/.test(type)) return "place";
  if (/media|genre:qloo|style:qloo|keyword|theme/.test(type)) return "media";
  return "any";
}

function pickTag(tags: QlooTag[], query: string, hint: TagScope): QlooTag | null {
  if (!tags.length) return null;
  const wanted = query.toLowerCase();
  const prefer = PREFER_BY_HINT[hint];
  const exact = tags.filter((tag) => tag.name.toLowerCase() === wanted);
  const pool = exact.length ? exact : tags;
  const ranked = [...pool].sort((a, b) => {
    const aRank = prefer.findIndex((prefix) => a.type.startsWith(prefix) || a.id.startsWith(prefix));
    const bRank = prefer.findIndex((prefix) => b.type.startsWith(prefix) || b.id.startsWith(prefix));
    return (aRank === -1 ? 99 : aRank) - (bRank === -1 ? 99 : bRank);
  });
  return ranked[0] ?? null;
}

function scoreEntity(entity: QlooEntity, query: string): number {
  const left = entity.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const right = query.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let score = entity.popularity ?? 0;
  if (left === right) score += 3;
  else if (left.startsWith(right) || right.startsWith(left)) score += 1.4;
  else if (left.includes(right) || right.includes(left)) score += 0.6;
  return score;
}

function tagsForDomain(domain: Domain, tags: TagSignal[]): TagSignal[] {
  return tags.filter((tag) => {
    if (tag.scope === "any") return domain !== "place";
    if (tag.scope === "artist") return domain === "artist";
    if (tag.scope === "place") return domain === "place";
    return domain === "movie" || domain === "tv_show" || domain === "book" || domain === "podcast";
  });
}

function toCard(entity: QlooEntity, domain: Domain, seeds: Seed[], signalTags: TagSignal[]): TasteCard {
  return {
    id: entity.id,
    name: entity.name,
    domain,
    affinity: entity.affinity,
    description: entity.description,
    imageUrl: entity.imageUrl,
    year: entity.year,
    locality: entity.locality,
    why: explainFit({ affinity: entity.affinity, tags: entity.tags, seeds, signalTags }),
    tags: rankTags(entity.tags).slice(0, 4),
  };
}

function dedupe(cards: TasteCard[]): TasteCard[] {
  const seen = new Set<string>();
  const unique: TasteCard[] = [];
  for (const card of cards) {
    const nameKey = card.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (seen.has(card.id) || seen.has(nameKey)) continue;
    seen.add(card.id);
    seen.add(nameKey);
    unique.push(card);
  }
  return unique.slice(0, 4);
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function assistantCopy(seeds: Seed[], groups: DomainGroup[], question: string | null): string {
  const filled = groups.filter((group) => group.cards.length);
  const seedNames = joinNames(seeds.map((seed) => seed.name));
  let text = filled.length
    ? `Cast from ${seedNames}. Qloo Insights filled ${joinNames(filled.map((group) => group.label.toLowerCase()))}.`
    : `I resolved ${seedNames} in Qloo, but those Insight calls came back empty.`;
  const failed = groups.filter((group) => group.error);
  if (failed.length) {
    text += ` ${failed.map((group) => `${group.label}: ${group.error}`).join(" ")}`;
  }
  if (question) text += ` ${question}`;
  return text;
}

async function resolveEntities(
  queries: string[],
  emit: (event: CastEvent) => void,
  steps: string[],
): Promise<Seed[]> {
  const settled = await Promise.all(
    queries.map(async (query) => {
      emit({ type: "status", phase: "searching", detail: `Searching entities for “${query}”` });
      try {
        const hits = await searchEntities(query);
        const best = [...hits].sort((a, b) => scoreEntity(b, query) - scoreEntity(a, query))[0];
        if (!best) {
          steps.push(`Search “${query}” returned no supported entity.`);
          return null;
        }
        const label = best.entityType.replace("urn:entity:", "") || "entity";
        steps.push(`Search “${query}” → ${best.name} (${label}).`);
        return {
          id: best.id,
          name: best.name,
          entityType: best.entityType,
          tags: best.tags.slice(0, 12),
        } satisfies Seed;
      } catch (error) {
        const message = error instanceof QlooError ? error.message : "Search failed.";
        steps.push(`Search “${query}” failed: ${message}`);
        return null;
      }
    }),
  );
  const unique = new Map<string, Seed>();
  for (const seed of settled) {
    if (seed) unique.set(seed.id, seed);
  }
  return [...unique.values()];
}

async function resolveTagSignals(
  queries: { query: string; hint: TagScope }[],
  emit: (event: CastEvent) => void,
  steps: string[],
): Promise<TagSignal[]> {
  const settled = await Promise.all(
    queries.map(async (item) => {
      emit({ type: "status", phase: "tags", detail: `Looking up the “${item.query}” tag` });
      try {
        const tags = await searchTags(item.query, PARENT_BY_HINT[item.hint]);
        const picked = pickTag(tags, item.query, item.hint);
        if (!picked) {
          steps.push(`No Qloo tag for “${item.query}”.`);
          return null;
        }
        steps.push(`Tag “${item.query}” → ${picked.name} (${picked.id}).`);
        return { ...picked, scope: scopeForTag(picked.type, item.hint) } satisfies TagSignal;
      } catch (error) {
        const message = error instanceof QlooError ? error.message : "Tag lookup failed.";
        steps.push(`Tag “${item.query}” failed: ${message}`);
        return null;
      }
    }),
  );
  const unique = new Map<string, TagSignal>();
  for (const tag of settled) {
    if (tag) unique.set(tag.id, tag);
  }
  return [...unique.values()];
}

export async function runCast(
  input: { messages: { role: string; content: string }[]; memory?: unknown },
  emit: (event: CastEvent) => void,
): Promise<void> {
  if (!qlooConfigured()) {
    emit({ type: "error", message: "QLOO_API_KEY is not configured on the server." });
    return;
  }

  emit({ type: "status", phase: "planning", detail: "Planning the Qloo lookups" });
  const messages = (input.messages ?? [])
    .filter((message) => message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
    .slice(-16)
    .map((message) => ({ role: message.role, content: message.content.trim().slice(0, 2000) }));

  const prior = sanitizeMemory(input.memory);
  const { plan, planner } = await planCast(messages, prior);
  if (plan.action === "clarify") {
    const result: CastResult = {
      assistant: plan.question ?? "Tell me a little more about what to cast.",
      question: plan.question,
      groups: [],
      memory: prior,
      planner,
      steps: [`Planner (${planner}) asked a clarifying question.`],
      replaceDomains: null,
    };
    emit({ type: "result", result });
    return;
  }

  await execute(plan, prior, planner, emit);
}

async function execute(plan: Plan, prior: Memory, planner: "openai" | "rules", emit: (event: CastEvent) => void) {
  const steps: string[] = [`Planner: ${planner}. ${plan.note}.`];
  const found = await resolveEntities(plan.entityQueries, emit, steps);
  const seeds = plan.mode === "fresh" && found.length ? found : [...prior.seeds, ...found].filter((seed, index, list) => list.findIndex((item) => item.id === seed.id) === index).slice(0, 6);
  if (!seeds.length && !plan.tagQueries.length && !prior.tagSignals.length) {
    emit({
      type: "result",
      result: {
        assistant: "I couldn’t find those names in Qloo. Try a specific film, artist, book, or place.",
        question: "What title should I search?",
        groups: [],
        memory: prior,
        planner,
        steps,
        replaceDomains: null,
      },
    });
    return;
  }

  const diningQuery = plan.dining ? [{ query: "restaurant", hint: "place" as const }] : [];
  const tagQueries = plan.mode === "fresh" ? [...plan.tagQueries, ...diningQuery] : [...plan.tagQueries, ...diningQuery];
  const resolvedTags = await resolveTagSignals(tagQueries, emit, steps);
  const tagSignals =
    plan.mode === "fresh"
      ? resolvedTags
      : [...prior.tagSignals, ...resolvedTags].filter((tag, index, list) => list.findIndex((item) => item.id === tag.id) === index).slice(0, 6);

  if (!seeds.length && !tagSignals.length) {
    emit({
      type: "result",
      result: {
        assistant: "Qloo didn’t return a usable entity or tag for that. Try a more specific name.",
        question: null,
        groups: [],
        memory: prior,
        planner,
        steps,
        replaceDomains: null,
      },
    });
    return;
  }

  const restaurantTag = tagSignals.find((tag) => tag.id === "urn:tag:genre:place:restaurant" || /restaurant/i.test(tag.name));
  const groups = await Promise.all(
    plan.domains.map(async (domain) => {
      const label = DOMAIN_LABEL[domain];
      emit({ type: "status", phase: "insights", detail: `Pulling ${label.toLowerCase()} insights` });
      try {
        const signalTags = tagsForDomain(domain, tagSignals).filter((tag) => tag.id !== restaurantTag?.id);
        const filterTagIds = domain === "place" && plan.dining && restaurantTag ? [restaurantTag.id] : [];
        const entities = await fetchInsights({
          domain,
          entityIds: seeds.map((seed) => seed.id),
          tagIds: signalTags.map((tag) => tag.id),
          filterTagIds,
          location: plan.location,
          excludeIds: plan.excludeDomains.includes(domain) ? prior.shown[domain] ?? [] : [],
          take: 6,
        });
        const cards = dedupe(entities.map((entity) => toCard(entity, domain, seeds, signalTags)));
        const signalNote = [
          seeds.length ? `${seeds.length} entities` : "",
          signalTags.length ? `${signalTags.length} tag signal${signalTags.length === 1 ? "" : "s"}` : "",
          domain === "place" && plan.location ? plan.location : "",
        ]
          .filter(Boolean)
          .join(", ");
        steps.push(`Insights ${DOMAIN_URN[domain]} (${signalNote || "no extra signal"}) → ${cards.length} picks.`);
        return { domain, label, cards } satisfies DomainGroup;
      } catch (error) {
        const message = error instanceof QlooError ? error.message : "Insights failed.";
        steps.push(`Insights ${DOMAIN_URN[domain]} failed: ${message}`);
        return { domain, label, cards: [], error: message } satisfies DomainGroup;
      }
    }),
  );

  emit({ type: "status", phase: "composing", detail: "Laying out the cast" });

  const shown: Memory["shown"] = { ...prior.shown };
  if (plan.mode === "fresh") {
    for (const domain of Object.keys(shown) as Domain[]) delete shown[domain];
  }
  for (const group of groups) {
    const previous = plan.mode === "fresh" ? [] : prior.shown[group.domain] ?? [];
    const next = [...previous, ...group.cards.map((card) => card.id)];
    shown[group.domain] = [...new Set(next)].slice(-24);
  }

  const memory: Memory = {
    seeds,
    location: plan.location,
    dining: plan.dining || prior.dining,
    tagSignals,
    domains: plan.mode === "fresh" ? plan.domains : [...new Set([...prior.domains, ...plan.domains])],
    shown,
  };

  const result: CastResult = {
    assistant: assistantCopy(seeds, groups, plan.question),
    question: plan.question,
    groups,
    memory,
    planner,
    steps,
    replaceDomains: plan.mode === "fresh" ? null : plan.domains,
  };
  emit({ type: "result", result });
}
