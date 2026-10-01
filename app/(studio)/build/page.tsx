import type { Metadata } from "next";
import { weeks } from "@/components/studio/content";

export const metadata: Metadata = {
  title: "How We Build",
  description:
    "Most software projects fail because they try to build everything at once. We build the workflow that makes you money first.",
};

export default function BuildPage() {
  return (
    <>
      <section>
        <div className="wrap stack gap-28">
          <span className="eyebrow">How we build</span>
          <h1 className="page-title build">We don&apos;t do feature creep. We ship.</h1>
          <p className="muted intro">
            Most software projects fail because they try to build everything at once. We build the workflow that makes you money first.
          </p>
        </div>
      </section>
      <section className="flush-top">
        <div className="wrap">
          <ol className="weeks">
            {weeks.map((week) => (
              <li className="week" key={week.n}>
                <span className="wk">Week</span>
                <span className="big">{week.n}</span>
                <h3>{week.title}</h3>
                <p className="muted">{week.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="block">
        <div className="wrap stack gap-48">
          <span className="eyebrow">Two kinds of project</span>
          <div className="two">
            <div>
              <h3>Digital transformation</h3>
              <p className="muted">
                For businesses running on paper, WhatsApp and spreadsheets. We replace the manual process with one system your staff will actually use.
              </p>
            </div>
            <div>
              <h3>0-to-1 MVP builds</h3>
              <p className="muted">
                For founders who need a live product, not another pitch deck. We scope the one workflow that proves the business and ship it.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
