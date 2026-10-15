export const DOMAINS = [
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
] as const;

export type Domain = (typeof DOMAINS)[number];

export const DOMAIN_LABEL: Record<Domain, string> = {
  movie: "Film",
  tv_show: "Television",
  artist: "Artists",
  book: "Books",
  podcast: "Podcasts",
  place: "Places",
  destination: "Destinations",
  brand: "Brands",
  person: "People",
  video_game: "Games",
};

export const DOMAIN_URN: Record<Domain, string> = {
  movie: "urn:entity:movie",
  tv_show: "urn:entity:tv_show",
  artist: "urn:entity:artist",
  book: "urn:entity:book",
  podcast: "urn:entity:podcast",
  place: "urn:entity:place",
  destination: "urn:entity:destination",
  brand: "urn:entity:brand",
  person: "urn:entity:person",
  video_game: "urn:entity:video_game",
};

export type Tag = {
  id: string;
  name: string;
  type: string;
};

export type TagScope = "artist" | "place" | "media" | "any";

export type TagSignal = Tag & { scope: TagScope };

export type Seed = {
  id: string;
  name: string;
  entityType: string;
  tags: Tag[];
};

export type TasteCard = {
  id: string;
  name: string;
  domain: Domain;
  affinity: number | null;
  description: string;
  imageUrl: string | null;
  year: number | null;
  locality: string | null;
  why: string;
  tags: Tag[];
};

export type DomainGroup = {
  domain: Domain;
  label: string;
  cards: TasteCard[];
  error?: string;
};

export type Memory = {
  seeds: Seed[];
  location: string | null;
  dining: boolean;
  tagSignals: TagSignal[];
  domains: Domain[];
  shown: Partial<Record<Domain, string[]>>;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type Plan = {
  action: "clarify" | "cast";
  question: string | null;
  mode: "fresh" | "refine" | "expand";
  entityQueries: string[];
  domains: Domain[];
  location: string | null;
  tagQueries: { query: string; hint: TagScope }[];
  dining: boolean;
  excludeDomains: Domain[];
  note: string;
};

export type CastResult = {
  assistant: string;
  question: string | null;
  groups: DomainGroup[];
  memory: Memory;
  planner: "openai" | "rules";
  steps: string[];
  replaceDomains: Domain[] | null;
};

export type CastEvent =
  | { type: "status"; phase: "planning" | "searching" | "tags" | "insights" | "composing"; detail: string }
  | { type: "result"; result: CastResult }
  | { type: "error"; message: string };

export function isDomain(value: string): value is Domain {
  return (DOMAINS as readonly string[]).includes(value);
}

export function emptyMemory(): Memory {
  return {
    seeds: [],
    location: null,
    dining: false,
    tagSignals: [],
    domains: [],
    shown: {},
  };
}
