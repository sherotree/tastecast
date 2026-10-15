import {
  emptyMemory,
  isDomain,
  type Domain,
  type Memory,
  type Plan,
  type TagScope,
} from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAG_ID = /^urn:tag:[a-z0-9_:-]{3,160}$/i;

const DOMAIN_CUES: { domain: Domain; pattern: RegExp }[] = [
  { domain: "movie", pattern: /\b(films?|movies?|cinema)\b/i },
  { domain: "tv_show", pattern: /\b(tv|television|series)\b/i },
  { domain: "artist", pattern: /\b(playlist|artists?|music|songs?|albums?|jazz|records?)\b/i },
  { domain: "place", pattern: /\b(dining|restaurants?|neighborhood|food|eat|cafes?|bars?|brunch|dinner|places)\b/i },
  { domain: "destination", pattern: /\b(destinations?|travel|trip|getaway|cities)\b/i },
  { domain: "book", pattern: /\b(books?|novels?|reading|read)\b/i },
  { domain: "podcast", pattern: /\bpodcasts?\b/i },
  { domain: "brand", pattern: /\bbrands?\b/i },
  { domain: "person", pattern: /\b(actors?|directors?|people)\b/i },
  { domain: "video_game", pattern: /\b(video games?|games)\b/i },
];

const GENRES: { word: string; hint: TagScope }[] = [
  { word: "jazz", hint: "artist" },
  { word: "hip hop", hint: "artist" },
  { word: "hip-hop", hint: "artist" },
  { word: "rock", hint: "artist" },
  { word: "classical", hint: "artist" },
  { word: "ambient", hint: "artist" },
  { word: "electronic", hint: "artist" },
  { word: "folk", hint: "artist" },
  { word: "soul", hint: "artist" },
  { word: "metal", hint: "artist" },
  { word: "punk", hint: "artist" },
  { word: "blues", hint: "artist" },
  { word: "indie", hint: "artist" },
  { word: "lo-fi", hint: "artist" },
  { word: "lofi", hint: "artist" },
  { word: "anime", hint: "media" },
  { word: "horror", hint: "media" },
  { word: "comedy", hint: "media" },
  { word: "romance", hint: "media" },
  { word: "fantasy", hint: "media" },
  { word: "sci-fi", hint: "media" },
  { word: "science fiction", hint: "media" },
];

const LOCATION_STOP = new Set([
  "the",
  "a",
  "an",
  "my",
  "your",
  "this",
  "that",
  "some",
  "our",
  "me",
  "us",
  "order",
  "general",
  "addition",
  "front",
  "love",
  "mind",
  "fact",
  "particular",
  "which",
  "case",
]);

const DOMAIN_ORDER: Domain[] = [
  "movie",
  "tv_show",
  "artist",
  "book",
  "podcast",
  "place",
  "destination",
  "brand",
  "person",
  "video_game",
];

export function sanitizeMemory(input: unknown): Memory {
  const memory = emptyMemory();
  if (!input || typeof input !== "object") return memory;
  const raw = input as Partial<Memory>;
  if (Array.isArray(raw.seeds)) {
    memory.seeds = raw.seeds
      .filter((seed) => seed && UUID.test(seed.id) && typeof seed.name === "string" && seed.name.trim())
      .slice(0, 6)
      .map((seed) => ({
        id: seed.id,
        name: seed.name.trim().slice(0, 120),
        entityType: typeof seed.entityType === "string" ? seed.entityType.slice(0, 80) : "",
        tags: Array.isArray(seed.tags)
          ? seed.tags
              .filter((tag) => tag && TAG_ID.test(tag.id) && typeof tag.name === "string")
              .slice(0, 12)
              .map((tag) => ({ id: tag.id, name: tag.name.slice(0, 80), type: String(tag.type ?? "").slice(0, 80) }))
          : [],
      }));
  }
  if (typeof raw.location === "string" && raw.location.trim()) {
    memory.location = raw.location.trim().slice(0, 60);
  }
  memory.dining = Boolean(raw.dining);
  if (Array.isArray(raw.tagSignals)) {
    memory.tagSignals = raw.tagSignals
      .filter((tag) => tag && TAG_ID.test(tag.id) && typeof tag.name === "string")
      .slice(0, 6)
      .map((tag) => ({
        id: tag.id,
        name: tag.name.slice(0, 80),
        type: String(tag.type ?? "").slice(0, 80),
        scope: tag.scope === "artist" || tag.scope === "place" || tag.scope === "media" || tag.scope === "any" ? tag.scope : "any",
      }));
  }
  if (Array.isArray(raw.domains)) {
    memory.domains = raw.domains.filter((domain): domain is Domain => typeof domain === "string" && isDomain(domain));
  }
  if (raw.shown && typeof raw.shown === "object") {
    for (const domain of DOMAIN_ORDER) {
      const ids = raw.shown[domain];
      if (!Array.isArray(ids)) continue;
      const clean = ids.filter((id): id is string => typeof id === "string" && UUID.test(id)).slice(0, 24);
      if (clean.length) memory.shown[domain] = clean;
    }
  }
  return memory;
}

function lastUserText(messages: { role: string; content: string }[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return messages[index].content.trim().slice(0, 2000);
  }
  return "";
}

function tidyPlace(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ").replace(/[:.,;].*$/, "").trim();
  if (!trimmed) return "";
  if (trimmed === trimmed.toLowerCase()) {
    return trimmed.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  }
  return trimmed;
}

export function extractLocation(text: string): string | null {
  const pattern = /\b(?:in|near|around|across)\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,2})/gi;
  let found: string | null = null;
  for (const match of text.matchAll(pattern)) {
    let place = tidyPlace(match[1] ?? "");
    place = place.replace(/\b(a|the|my|for|with|and)\b.*$/i, "").trim();
    const first = place.split(/\s+/)[0]?.toLowerCase() ?? "";
    if (!place || place.length < 3 || LOCATION_STOP.has(first)) continue;
    if (/^(film|movie|order|love|mind|addition|front|back|general)$/i.test(first)) continue;
    found = place.slice(0, 48);
  }
  return found;
}

function wantsDining(text: string): boolean {
  return /\b(dining|restaurants?|food|eat|brunch|dinner|cafes?)\b/i.test(text);
}

function mentionedDomains(text: string): Domain[] {
  const found = DOMAIN_CUES.filter((cue) => cue.pattern.test(text)).map((cue) => cue.domain);
  return DOMAIN_ORDER.filter((domain) => found.includes(domain));
}

function domainFromText(text: string): Domain | null {
  return mentionedDomains(text)[0] ?? null;
}

type Refine =
  | { kind: "more" | "swap"; domain: Domain }
  | { kind: "restyle"; domain: Domain; tagQuery: string; hint: TagScope };

function detectRefine(text: string, memory: Memory): Refine | null {
  if (!memory.seeds.length) return null;
  if (text.length > 220 && /\b(love|like|adore)\b/i.test(text)) return null;
  const lower = text.toLowerCase();

  if (/\b(darker|moodier|bleaker|keep .{0,24}dark)\b/i.test(lower)) {
    const domain = /\b(film|movie|book|tv)\b/i.test(lower) ? domainFromText(lower) ?? "movie" : "artist";
    return { kind: "restyle", domain, tagQuery: "dark", hint: domain === "artist" ? "artist" : "media" };
  }
  if (/\b(lighter|softer|gentler|mellower)\b/i.test(lower)) {
    const domain = domainFromText(lower) ?? "artist";
    return { kind: "restyle", domain, tagQuery: "mellow", hint: domain === "artist" ? "artist" : "media" };
  }
  if (/\b(swap|replace|different)\b/i.test(lower)) {
    return { kind: "swap", domain: domainFromText(lower) ?? memory.domains[0] ?? "movie" };
  }
  if (/\b(more|another|extra|else)\b/i.test(lower)) {
    const domain = domainFromText(lower);
    if (!domain) return null;
    return { kind: "more", domain };
  }
  if (/^(also |what about |add |include |now )\b/i.test(lower)) {
    const domain = domainFromText(lower);
    if (domain) return { kind: "more", domain };
  }
  return null;
}

function hasProperNoun(phrase: string): boolean {
  return /\b[A-Z][a-z]/.test(phrase);
}

function genreHits(phrase: string): { query: string; hint: TagScope }[] {
  const lower = phrase.toLowerCase();
  const hits: { query: string; hint: TagScope }[] = [];
  for (const genre of GENRES) {
    const needle = genre.word.replace("-", "[- ]?");
    if (new RegExp(`\\b${needle}\\b`, "i").test(lower)) {
      const query = genre.word.replace(/-/g, " ").replace("lofi", "lo fi");
      if (!hits.some((hit) => hit.query === query)) hits.push({ query, hint: genre.hint });
    }
  }
  return hits;
}

function leftoverAfterGenre(phrase: string): string {
  return phrase
    .replace(/\b(rainy-day|rainy|cozy|chill|mellow|darker|dark|moody|weekend|night|day|vibe|mood|soft|heavy|upbeat|sad|happy|music|playlist)\b/gi, " ")
    .replace(/\b(jazz|hip hop|hip-hop|rock|classical|ambient|electronic|folk|soul|metal|punk|blues|indie|lo-fi|lofi|anime|horror|comedy|romance|fantasy|sci-fi|science fiction)\b/gi, " ")
    .replace(/[^a-z0-9' ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function takePhrase(phrase: string, entities: string[], tags: { query: string; hint: TagScope }[]) {
  const clean = phrase.replace(/^(a|an|the|some|my)\s+/i, "").replace(/[.!?]+$/g, "").trim();
  if (clean.length < 2) return;
  if (/^(film|films|movie|movies|playlist|artists?|music|dining|neighborhood|weekend|books?|podcasts?|tv|shows?|games?|places?)$/i.test(clean)) {
    return;
  }
  const genres = genreHits(clean);
  for (const genre of genres) {
    if (!tags.some((tag) => tag.query === genre.query)) tags.push(genre);
  }
  if (hasProperNoun(clean)) {
    entities.push(clean.slice(0, 80));
    return;
  }
  if (genres.length) {
    const rest = leftoverAfterGenre(clean);
    if (rest.length > 2) entities.push(rest.slice(0, 80));
    return;
  }
  entities.push(clean.slice(0, 80));
}

function extractPhrases(text: string): { entities: string[]; tags: { query: string; hint: TagScope }[] } {
  const entities: string[] = [];
  const tags: { query: string; hint: TagScope }[] = [];
  const quoted = [...text.matchAll(/"([^"]{2,80})"|'([^']{2,80})'/g)].map((match) => match[1] || match[2] || "");
  for (const phrase of quoted) takePhrase(phrase, entities, tags);

  const loved = text.match(
    /(?:love|like|loved|adore|enjoy|obsessed with|favorite is|favourite is|favorites?(?:\s+are)?|favourites?(?:\s+are)?)\s+([^.\n→;]+)/i,
  );
  const chunk = loved?.[1]?.split(/→|->|\bcast me\b/i)[0] ?? "";
  if (chunk) {
    for (const part of chunk.split(/\s*(?:,|&|\+|\band\b|\/)\s*/i)) {
      takePhrase(part, entities, tags);
    }
  } else if (!quoted.length) {
    const words = text.trim().split(/\s+/);
    const command = /\b(cast|weekend|more|swap|replace|darker|lighter|dining|playlist)\b/i.test(text);
    if (words.length <= 6 && !command && !/\b(in|near|around)\b/i.test(text)) {
      takePhrase(text.trim(), entities, tags);
    }
  }

  if (/\bdark(er)?\b/i.test(text)) {
    const wantsMusic = /\b(music|artists?|playlist|jazz|records?)\b/i.test(text);
    const wantsMedia = /\b(films?|movies?|books?|novels?|tv|television)\b/i.test(text);
    if (wantsMusic || !wantsMedia) tags.push({ query: "dark", hint: "artist" });
    if (wantsMedia) tags.push({ query: "dark", hint: "media" });
  }

  return {
    entities: [...new Set(entities)].slice(0, 4),
    tags: tags.slice(0, 3),
  };
}

function orderDomains(domains: Domain[]): Domain[] {
  return DOMAIN_ORDER.filter((domain) => domains.includes(domain)).slice(0, 5);
}

function clarify(question: string, note: string): Plan {
  return {
    action: "clarify",
    question,
    mode: "fresh",
    entityQueries: [],
    domains: [],
    location: null,
    tagQueries: [],
    dining: false,
    excludeDomains: [],
    note,
  };
}

export function planWithRules(messages: { role: string; content: string }[], rawMemory: unknown): Plan {
  const memory = sanitizeMemory(rawMemory);
  const text = lastUserText(messages);
  if (!text) {
    return clarify("Name a film, an artist, a book, or a place you already like.", "empty");
  }
  if (/^(hi|hey|hello|help|yo|sup|something|anything|idk|not sure|surprise me)[.!?\s]*$/i.test(text) && !memory.seeds.length) {
    return clarify(
      "Name something you already love, plus the occasion if you have one. A title is enough.",
      "vague",
    );
  }

  const location = extractLocation(text) ?? memory.location;
  const refine = detectRefine(text, memory);
  if (refine) {
    if ((refine.domain === "place" || refine.kind === "more") && refine.domain === "place" && !location) {
      return clarify("Which city or neighborhood should I use for places?", "need-location");
    }
    if (/\bmore\b/i.test(text) && !mentionedDomains(text).length) {
      return clarify("More of which — film, artists, places, or books?", "need-domain");
    }
    const adding = /^(also |what about |add |include |now )\b/i.test(text);
    return {
      action: "cast",
      question: null,
      mode: adding && !memory.domains.includes(refine.domain) ? "expand" : "refine",
      entityQueries: extractPhrases(text).entities,
      domains: [refine.domain],
      location,
      tagQueries: refine.kind === "restyle" ? [{ query: refine.tagQuery, hint: refine.hint }] : [],
      dining: refine.domain === "place" && (memory.dining || wantsDining(text)),
      excludeDomains: adding && !memory.domains.includes(refine.domain) ? [] : [refine.domain],
      note: `rule ${refine.kind}`,
    };
  }

  const extracted = extractPhrases(text);
  const cues = mentionedDomains(text);
  const dining = wantsDining(text) || (memory.dining && cues.includes("place"));
  let domains: Domain[] = [];
  if (cues.length) domains = [...cues];
  else if (/\bweekend\b/i.test(text)) domains = ["movie", "artist", "place"];
  else if (!extracted.entities.length && extracted.tags.some((tag) => tag.hint === "artist")) {
    domains = location ? ["artist", "place"] : ["artist"];
  } else domains = ["movie", "artist", "book", "destination"];

  let question: string | null = null;
  if (domains.includes("place") && !location) {
    domains = domains.filter((domain) => domain !== "place");
    question = "Which city or neighborhood should I use for places?";
    if (!domains.length) return clarify(question, "need-location");
  }

  if (!extracted.entities.length && !extracted.tags.length && !memory.seeds.length) {
    return clarify("I need a specific title or artist to look up in Qloo. What should I search?", "no-signal");
  }

  const freshNames = extracted.entities.length > 0;
  return {
    action: "cast",
    question,
    mode: freshNames ? "fresh" : memory.seeds.length ? "expand" : "fresh",
    entityQueries: extracted.entities,
    domains: orderDomains(domains),
    location,
    tagQueries: extracted.tags,
    dining: dining && (domains.includes("place") || cues.includes("place")),
    excludeDomains: [],
    note: "rule cast",
  };
}
