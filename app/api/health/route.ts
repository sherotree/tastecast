import { QLOO_BASE_URL, qlooConfigured, QlooError, searchEntities } from "@/lib/qloo/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const live = new URL(request.url).searchParams.get("live") === "1";
  const configured = qlooConfigured();
  const body: {
    ok: boolean;
    service: string;
    qlooConfigured: boolean;
    planner: "openai" | "rules";
    baseUrl: string;
    live?: boolean;
    resolved?: string | null;
    liveError?: string;
  } = {
    ok: true,
    service: "tastecast",
    qlooConfigured: configured,
    planner: process.env.OPENAI_API_KEY?.trim() ? "openai" : "rules",
    baseUrl: QLOO_BASE_URL,
  };

  if (live) {
    if (!configured) {
      body.live = false;
      body.liveError = "QLOO_API_KEY is not configured.";
    } else {
      try {
        const hits = await searchEntities("Spirited Away", ["urn:entity:movie"]);
        body.live = hits.some((hit) => hit.name.toLowerCase() === "spirited away");
        body.resolved = hits[0]?.name ?? null;
      } catch (error) {
        body.live = false;
        body.liveError = error instanceof QlooError ? error.message : "Qloo check failed.";
      }
    }
  }

  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
