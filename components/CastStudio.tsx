"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DOMAINS, DOMAIN_LABEL, type CastEvent, type CastResult, type Domain, type DomainGroup, type Memory } from "@/lib/types";

type ThreadItem = { id: string; role: "user" | "assistant"; content: string };

const REFINES = ["Swap the movie", "More places", "Keep music darker"];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function mergeGroups(previous: DomainGroup[], result: CastResult): DomainGroup[] {
  if (!result.groups.length && result.question) return previous;
  if (!result.replaceDomains) return result.groups.length ? result.groups : previous;
  const next = new Map(previous.map((group) => [group.domain, group]));
  for (const group of result.groups) next.set(group.domain, group);
  return DOMAINS.filter((domain) => next.has(domain)).map((domain) => next.get(domain)!);
}

function affinityLabel(value: number | null) {
  if (value == null || value <= 0) return "—";
  return value.toFixed(2);
}

export function CastStudio() {
  const params = useSearchParams();
  const prompt = params.get("prompt");
  const seenPrompt = useRef<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [thread, setThread] = useState<ThreadItem[]>([
    {
      id: "intro",
      role: "assistant",
      content: "Name a favorite, a mood, or both. I’ll resolve them in Qloo and cast across domains.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [groups, setGroups] = useState<DomainGroup[]>([]);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [status, setStatus] = useState<string[]>([]);
  const [steps, setSteps] = useState<string[]>([]);
  const [planner, setPlanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState<string | null>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [thread, status]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const history = [...thread.filter((item) => item.id !== "intro"), { id: uid(), role: "user" as const, content }];
    setThread((current) => [...current, { id: uid(), role: "user", content }]);
    setDraft("");
    setLoading(true);
    setError(null);
    setStatus(["Planning the Qloo lookups"]);
    setQuestion(null);

    try {
      const response = await fetch("/api/cast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((item) => ({ role: item.role, content: item.content })),
          memory,
        }),
      });
      if (!response.ok || !response.body) {
        setError("The cast desk didn’t respond.");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawResult = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as CastEvent;
          if (event.type === "status") {
            setStatus((current) => [...current.slice(-6), event.detail]);
          } else if (event.type === "error") {
            setError(event.message);
          } else if (event.type === "result") {
            sawResult = true;
            setThread((current) => [...current, { id: uid(), role: "assistant", content: event.result.assistant }]);
            setGroups((current) => mergeGroups(current, event.result));
            setMemory(event.result.memory);
            setSteps(event.result.steps);
            setPlanner(event.result.planner);
            setQuestion(event.result.question);
            setStatus([]);
          }
        }
      }
      if (!sawResult) setError((current) => current ?? "The cast ended before a board came back.");
    } catch {
      setError("The connection dropped while Qloo was working.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!prompt || seenPrompt.current === prompt) return;
    const handle = window.setTimeout(() => {
      seenPrompt.current = prompt;
      void send(prompt);
    }, 0);
    return () => window.clearTimeout(handle);
    // Fire the linked prompt once on entry. send is the initial desk, with empty memory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  const filled = groups.some((group) => group.cards.length);
  const signals = useMemo(() => memory, [memory]);

  return (
    <main className="studio">
      <section className="desk" aria-label="Casting conversation">
        <div className="log" ref={logRef}>
          {thread.map((item) => (
            <article key={item.id} className={`bubble bubble-${item.role}`}>
              <span>{item.role === "user" ? "You" : "Desk"}</span>
              <p>{item.content}</p>
            </article>
          ))}
          {loading ? (
            <div className="status-rail" aria-live="polite">
              {status.map((line, index) => (
                <p key={`${line}-${index}`} className={index === status.length - 1 ? "is-current" : ""}>
                  {line}
                </p>
              ))}
            </div>
          ) : null}
          {error ? <p className="banner">{error}</p> : null}
        </div>
        {filled && !loading ? (
          <div className="chips">
            {REFINES.map((label) => (
              <button key={label} type="button" onClick={() => send(label)}>
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <label htmlFor="cast-input" className="sr-only">
            What should TasteCast look up
          </label>
          <textarea
            id="cast-input"
            rows={3}
            value={draft}
            placeholder={question ? "Name the city, or ask for a change" : "A film, an artist, a city, a mood"}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
          />
          <button className="button" type="submit" disabled={loading || !draft.trim()}>
            {loading ? "Casting" : "Cast"}
          </button>
        </form>
      </section>

      <section className="board" aria-label="Taste cast">
        <header className="board-head">
          <div>
            <p className="kicker">Taste cast</p>
            <h1>{filled ? "On the board" : loading ? "Casting" : "Waiting for a signal"}</h1>
          </div>
          {planner ? <p className="planner">Planner · {planner === "openai" ? "model" : "rules"}</p> : null}
        </header>

        {signals && (signals.seeds.length > 0 || signals.tagSignals.length > 0) ? (
          <ul className="signals">
            {signals.seeds.map((seed) => (
              <li key={seed.id}>
                {seed.name}
                <span>{seed.entityType.replace("urn:entity:", "") || "entity"}</span>
              </li>
            ))}
            {signals.tagSignals.map((tag) => (
              <li key={tag.id}>
                {tag.name}
                <span>tag</span>
              </li>
            ))}
            {signals.location ? (
              <li>
                {signals.location}
                <span>place filter</span>
              </li>
            ) : null}
          </ul>
        ) : null}

        {!filled && !loading ? (
          <div className="empty">
            <p>The board stays empty until Qloo returns entities. A model plan, if one is configured, only chooses the calls.</p>
            <div className="chips">
              {["Spirited Away", "I love Björk. Cast a film and a book."].map((sample) => (
                <button key={sample} type="button" onClick={() => send(sample)}>
                  {sample}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {groups.map((group) => (
          <DomainBlock key={group.domain} group={group} />
        ))}

        {steps.length ? (
          <details className="audit">
            <summary>How this cast was fetched</summary>
            <ol>
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p>Recommendations are Qloo entities. Shared tags and affinity come from the Insights payload.</p>
          </details>
        ) : null}
      </section>
    </main>
  );
}

function DomainBlock({ group }: { group: DomainGroup }) {
  return (
    <section className="domain">
      <header>
        <h2>{DOMAIN_LABEL[group.domain as Domain]}</h2>
        <p>{group.error ? group.error : group.cards.length ? `${group.cards.length} from Qloo` : "No entities returned"}</p>
      </header>
      {group.cards.length ? (
        <ol className="picks">
          {group.cards.map((card) => (
            <li key={card.id} className="pick">
              {card.imageUrl ? (
                // Qloo image hosts are not worth optimizing through the image pipeline.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.imageUrl} alt="" width={84} height={112} />
              ) : (
                <div className="placeholder" aria-hidden="true" />
              )}
              <div>
                <h3>{card.name}</h3>
                <p className="meta">
                  {[card.year, card.locality].filter(Boolean).join(" · ")}
                </p>
                <p className="why">{card.why}</p>
                {card.description ? <p className="desc">{card.description}</p> : null}
                {card.tags.length ? (
                  <ul className="tag-row">
                    {card.tags.map((tag) => (
                      <li key={tag.id}>{tag.name}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <p className="score">
                <span>Affinity</span>
                {affinityLabel(card.affinity)}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
