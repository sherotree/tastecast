import type { Seed, Tag, TagSignal } from "@/lib/types";

const PREFERRED_PREFIXES = [
  "urn:tag:genre:music",
  "urn:tag:genre:media",
  "urn:tag:genre:qloo",
  "urn:tag:genre:place",
  "urn:tag:genre:destination",
  "urn:tag:style:qloo",
  "urn:tag:subgenre:qloo",
  "urn:tag:music:qloo",
  "urn:tag:theme:qloo",
  "urn:tag:keyword:media",
  "urn:tag:keyword:qloo",
  "urn:tag:artist:qloo",
];

function rank(tag: Tag): number {
  const index = PREFERRED_PREFIXES.findIndex((prefix) => tag.type.startsWith(prefix) || tag.id.startsWith(prefix));
  return index === -1 ? PREFERRED_PREFIXES.length + 1 : index;
}

export function rankTags(tags: Tag[]): Tag[] {
  const seen = new Set<string>();
  return [...tags]
    .filter((tag) => {
      const key = tag.name.toLowerCase();
      if (!tag.name || seen.has(key) || seen.has(tag.id)) return false;
      if (/^(place|destination|podcasts?|movies?|films?|entity|title)$/i.test(key)) return false;
      seen.add(key);
      seen.add(tag.id);
      return true;
    })
    .sort((a, b) => rank(a) - rank(b));
}

function joinNames(names: string[]): string {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length <= 1) return unique[0] ?? "";
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")}, and ${unique[unique.length - 1]}`;
}

export function explainFit(options: {
  affinity: number | null;
  tags: Tag[];
  seeds: Seed[];
  signalTags: TagSignal[];
}): string {
  const seedTagIds = new Set(options.seeds.flatMap((seed) => seed.tags.map((tag) => tag.id)));
  const shared = rankTags(options.tags.filter((tag) => seedTagIds.has(tag.id))).slice(0, 3);
  const affinity =
    options.affinity != null && options.affinity > 0
      ? `${options.affinity.toFixed(2)} Qloo affinity`
      : "Qloo match";
  const seedNames = options.seeds.map((seed) => seed.name).filter(Boolean).slice(0, 3);
  const from = seedNames.length ? ` with ${joinNames(seedNames)}` : "";
  const signalNames = [...new Set(options.signalTags.map((tag) => tag.name))].slice(0, 2);
  const signalBit = signalNames.length ? ` Tag signal: ${joinNames(signalNames)}.` : "";

  if (shared.length) {
    return `${affinity}${from}, sharing ${joinNames(shared.map((tag) => tag.name))}.${signalBit}`;
  }
  const own = rankTags(options.tags).slice(0, 3);
  if (own.length) {
    return `${affinity}${from}. Tags on this pick: ${joinNames(own.map((tag) => tag.name))}.${signalBit}`;
  }
  return `${affinity}${from}.${signalBit}`.replace(/\s+\./g, ".").trim();
}
