import Link from "next/link";
import { HealthPanel } from "@/components/HealthPanel";
import { DEMO_PROMPT } from "@/lib/examples";

export const metadata = {
  title: "Demo",
};

export default function DemoPage() {
  return (
    <main className="narrow">
      <p className="kicker">For judges</p>
      <h1>Run a cast from end to end.</h1>
      <p className="lede">
        This path searches Studio Ghibli, resolves a jazz tag, and asks Qloo Insights for a film, artists, and
        Brooklyn dining. Nothing on the board is filled in ahead of time.
      </p>
      <div className="hero-actions">
        <Link className="button" href={`/cast?prompt=${encodeURIComponent(DEMO_PROMPT)}`}>
          Run the Ghibli weekend
        </Link>
        <Link className="button button-ghost" href="/cast?prompt=Spirited%20Away">
          Cast from one title
        </Link>
      </div>
      <blockquote className="prompt-block">{DEMO_PROMPT}</blockquote>
      <h2>Server check</h2>
      <HealthPanel />
      <p className="quiet">
        After the board lands, try “swap the movie”, “more places”, or “keep music darker”. Those are follow-up Qloo
        calls, using the entities already resolved.
      </p>
    </main>
  );
}
