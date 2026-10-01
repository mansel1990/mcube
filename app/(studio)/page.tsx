import Link from "next/link";
import { StudioCube } from "@/components/studio/cube";
import { reasons, WHATSAPP_URL } from "@/components/studio/content";
import { WhatsAppIcon } from "@/components/studio/icons";
import { WorkRail } from "@/components/studio/work-rail";

const chips = [
  { strong: "11+ years", rest: " building products" },
  { rest: "Payments & fintech" },
  { rest: "B2B & enterprise SaaS" },
  { rest: "HR & payroll software" },
  { rest: "Japan, Korea & India" },
];

export default function HomePage() {
  return (
    <>
      <section>
        <div className="wrap hero">
          <div className="stack gap-28">
            <span className="eyebrow">A founder-led product studio</span>
            <h1>
              From messy operations to working software in <em>4 weeks.</em>
            </h1>
            <p className="lede">
              We turn the manual bottlenecks in your business into clean web and mobile apps. Small scope, fast launch, and one person accountable from first message to go-live.
            </p>
            <div className="row">
              <a className="btn btn-wa" href={WHATSAPP_URL} target="_blank" rel="noopener">
                <WhatsAppIcon />
                Discuss your workflow
              </a>
              <Link className="btn btn-line" href="/build">
                See how we build
              </Link>
            </div>
          </div>
          <StudioCube />
        </div>
      </section>

      <section className="flush">
        <div className="wrap facts" aria-label="Founder background">
          {chips.map((chip) => (
            <span className="chip" key={chip.rest}>
              {chip.strong ? <b>{chip.strong}</b> : null}
              {chip.rest}
            </span>
          ))}
        </div>
      </section>

      <section>
        <div className="wrap split">
          <h2 className="h2">Why clients pick a founder-led studio</h2>
          <div className="points">
            {reasons.map((reason, index) => (
              <div className="point" key={reason.title}>
                <span className="n">{index + 1}</span>
                <div>
                  <h3>{reason.title}</h3>
                  <p className="muted">{reason.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="block">
        <div className="wrap stack gap-48">
          <span className="eyebrow">Who we work with</span>
          <div className="two">
            <div>
              <h3>Business owners running on paper and Excel</h3>
              <p className="muted">
                Schools, clubs, bakeries, clinics, distributors. If your team spends evenings reconciling sheets and WhatsApp groups, we build the one system that replaces them.
              </p>
            </div>
            <div>
              <h3>Founders who need a first version live</h3>
              <p className="muted">
                You have the idea and the first customers lined up. We scope the one workflow that proves the business and ship it properly, in India or abroad.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap stack gap-36">
          <div className="row end">
            <h2 className="h2">Recent work</h2>
            <Link href="/work">Read the case studies</Link>
          </div>
          <WorkRail />
        </div>
      </section>
    </>
  );
}
