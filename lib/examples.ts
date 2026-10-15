export const DEMO_PROMPT =
  "I love Studio Ghibli and rainy-day jazz. Cast me a weekend in Brooklyn: a film, playlist artists, and neighborhood dining.";

export const EXAMPLES = [
  {
    title: "Ghibli weekend",
    kicker: "Film, jazz, a table",
    prompt: DEMO_PROMPT,
  },
  {
    title: "One title, other rooms",
    kicker: "Cross-domain",
    prompt: "Spirited Away",
  },
  {
    title: "Darker shelf",
    kicker: "Books and records",
    prompt: "I love Radiohead and Neverwhere. Cast books, artists, and a film, and keep it dark.",
  },
] as const;
