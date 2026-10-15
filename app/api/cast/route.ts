import { runCast } from "@/lib/agent/run";
import type { CastEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let payload: { messages?: { role: string; content: string }[]; memory?: unknown };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON body with messages." }, { status: 400 });
  }
  if (!Array.isArray(payload.messages)) {
    return Response.json({ error: "messages must be an array." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: CastEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        await runCast({ messages: payload.messages ?? [], memory: payload.memory }, send);
      } catch {
        send({ type: "error", message: "The cast failed before Qloo returned a board." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
