"use client";

import { useState } from "react";

type Health = {
  ok?: boolean;
  qlooConfigured?: boolean;
  planner?: string;
  baseUrl?: string;
  live?: boolean;
  resolved?: string | null;
  liveError?: string;
};

export function HealthPanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check(live: boolean) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(live ? "/api/health?live=1" : "/api/health", { cache: "no-store" });
      if (!response.ok) throw new Error("Health check failed.");
      setHealth((await response.json()) as Health);
    } catch {
      setError("Could not read the server health check.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="health">
      <div className="hero-actions">
        <button className="button" type="button" onClick={() => check(false)} disabled={pending}>
          Check server
        </button>
        <button className="button button-ghost" type="button" onClick={() => check(true)} disabled={pending}>
          Ping Qloo
        </button>
      </div>
      {error ? <p className="banner">{error}</p> : null}
      {health ? (
        <dl className="health-list">
          <div>
            <dt>Qloo key</dt>
            <dd>{health.qlooConfigured ? "Configured on the server" : "Missing QLOO_API_KEY"}</dd>
          </div>
          <div>
            <dt>Planner</dt>
            <dd>{health.planner === "openai" ? "OpenAI, with the rule planner as fallback" : "Rule-based"}</dd>
          </div>
          <div>
            <dt>Base URL</dt>
            <dd>{health.baseUrl}</dd>
          </div>
          {health.live !== undefined ? (
            <div>
              <dt>Live search</dt>
              <dd>
                {health.live
                  ? `Resolved “${health.resolved ?? "a movie"}”`
                  : health.liveError ?? "Search did not resolve."}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="quiet">The key never leaves the server. This panel only reports whether it is set.</p>
      )}
    </div>
  );
}
