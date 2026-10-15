import Link from "next/link";
import { EXAMPLES } from "@/lib/examples";

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <div>
          <p className="kicker">Qloo Agentic Hackathon</p>
          <h1>
            Cast a weekend from what you already <em>love</em>.
          </h1>
          <p className="lede">
            Name a film, a record, a book, or a mood. TasteCast looks those names up in Qloo, then asks the taste graph
            for the things that sit beside them: another film, the artists, the table, the city.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/cast">
              Start casting
            </Link>
            <Link className="button button-ghost" href="/demo">
              Judge demo
            </Link>
          </div>
        </div>
        <aside className="sheet">
          <p className="sheet-kicker">Call sheet</p>
          <ol className="steps">
            <li>
              <span>01</span>
              <div>
                <strong>Search the name</strong>
                <p>Qloo <code>/search</code> turns “Studio Ghibli” into an entity id. A guess is not an id.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Resolve the words</strong>
                <p>
                  “Jazz” goes through <code>/v2/tags</code> and becomes a tag id. Freeform tag strings never reach
                  Insights.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Read the affinity</strong>
                <p>
                  <code>/v2/insights</code> returns the cast. Each card’s reason is a Qloo score plus shared tags.
                </p>
              </div>
            </li>
          </ol>
        </aside>
      </section>

      <section className="examples">
        <div className="section-head">
          <h2>Three ways in</h2>
          <p>Each one opens the desk with the line already written.</p>
        </div>
        <div className="example-grid">
          {EXAMPLES.map((example) => (
            <Link key={example.title} className="example" href={`/cast?prompt=${encodeURIComponent(example.prompt)}`}>
              <span>{example.kicker}</span>
              <strong>{example.title}</strong>
              <p>{example.prompt}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="note">
        <h2>How Qloo powers this</h2>
        <div>
          <p>
            A language model can plan the calls. It cannot invent the board. Entity ids come from search, tag ids come
            from the tag index, and every recommendation is an entity Qloo returned for those signals. That is why a
            Ghibli seed can surface a Brooklyn restaurant or a book you would not get from a genre keyword alone: the
            link lives in the taste graph.
          </p>
          <p>
            With no <code>OPENAI_API_KEY</code>, a rule-based planner still runs the same Qloo calls. Set the key when
            you want the planner to read looser sentences.
          </p>
        </div>
      </section>
    </main>
  );
}
