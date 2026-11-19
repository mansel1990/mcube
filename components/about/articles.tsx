import { renderMarkdown } from "@/lib/about/markdown";
import type { RulesModel } from "@/lib/about/rules-model";

export function PhilosophyArticle({ markdown }: { markdown: string }) {
  return (
    <article className="about-article" dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }} />
  );
}

export function RulesArticle({ model }: { model: RulesModel }) {
  return (
    <article className="about-article">
      <h1>Rules</h1>
      <p className="about-updated">Last updated {model.lastUpdated}</p>
      <h2>What is live now</h2>
      <ul>
        {model.strategies.map((row) => <li key={row.name}>{row.line}</li>)}
      </ul>
      {model.strategies.filter((row) => row.live && row.detail.length > 0).map((row) => (
        <section key={row.name}>
          <h2>{row.name}</h2>
          <ul>
            {row.detail.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </section>
      ))}
      <h2>Account-wide safety</h2>
      <ul>
        {model.safety.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <h2>How strategies are tested</h2>
      {model.testing.map((line) => <p key={line}>{line}</p>)}
      <h2 id="long-game">Long Game</h2>
      {model.longGame.map((line) => <p key={line}>{line}</p>)}
    </article>
  );
}
