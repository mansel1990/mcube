"use client";

import { useEffect, useState } from "react";
import { LongtermProposalBanner, type LongtermProposalView } from "./longterm-proposal-banner";
import { LoadError, PageSkeleton } from "./loading";

export function LongGameSuggestion() {
  const [proposal, setProposal] = useState<LongtermProposalView | null | undefined>(undefined);
  const [error, setError] = useState(false);

  function load() {
    setError(false);
    void fetch("/api/mlive/long-term/proposal", { cache: "no-store" }).then(async (res) => {
      if (!res.ok) {
        setError(true);
        return;
      }
      const body = (await res.json()) as { proposal: LongtermProposalView | null };
      setProposal(body.proposal);
    }).catch(() => setError(true));
  }

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (error) return <LoadError message="The suggestion could not be loaded." onRetry={load} />;
  if (proposal === undefined) return <PageSkeleton kind="suggestion" label="Loading the suggestion" />;
  if (!proposal) {
    return (
      <section className="page">
        <h1>Suggestion</h1>
        <article className="card"><p>No Core suggestion is waiting.</p></article>
      </section>
    );
  }
  return (
    <section className="page">
      <h1>Suggestion</h1>
      <LongtermProposalBanner proposal={proposal} onDone={() => setProposal(null)} />
    </section>
  );
}
