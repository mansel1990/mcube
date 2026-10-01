import type { Metadata } from "next";
import { record, roles } from "@/components/studio/content";

export const metadata: Metadata = {
  title: "Meet the Founder",
  description:
    "Mithila Kannan is a senior product and delivery lead with over 11 years of experience designing and scaling high-volume platforms in B2B SaaS and fintech.",
};

export default function FounderPage() {
  return (
    <>
      <section>
        <div className="wrap split founder">
          <div className="stack gap-12">
            <div className="portrait">
              {/* Framed photograph; raw img keeps the crop without a loader wrapper. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/founder/mithila.jpg" alt="Mithila Kannan, founder of MCube Tech Studio" />
            </div>
            <span className="muted portrait-caption">Mithila Kannan, Founder &amp; Lead Product Manager</span>
          </div>
          <div className="stack gap-28">
            <span className="eyebrow">Meet the founder</span>
            <h1 className="page-title founder">The product brain behind the build.</h1>
            <p>
              Mithila Kannan is a senior product and delivery lead with over 11 years of experience designing and scaling high-volume platforms in B2B SaaS and fintech.
            </p>
            <p>
              She started the studio to help early-stage founders and business owners close the gap between how their operations actually run and the clean software they need.
            </p>
            <p>
              You won&apos;t be handed to a junior account manager. Mithila scopes every MVP herself, designs the logic and stays on the project until it&apos;s live.
            </p>
          </div>
        </div>
      </section>
      <section className="flush-top">
        <div className="wrap split">
          <div className="stack gap-12">
            <h2 className="h2">Track record</h2>
            <p className="muted">Before the studio, inside payments, fintech and SaaS companies.</p>
          </div>
          <ul className="record">
            {record.map((item) => (
              <li key={item.k}>
                <span className="k">{item.k}</span>
                <span>{item.v}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="block">
        <div className="wrap two start">
          <div className="stack gap-20">
            <span className="eyebrow">The team behind the build</span>
            <h2 className="h2">Mithila owns it. A full team builds it.</h2>
            <p className="muted team-note">
              Every project has one owner from the first call to launch. Behind her is a team that gets the work done, so nothing waits on one person&apos;s calendar.
            </p>
          </div>
          <div className="stack gap-28">
            <ul className="roles">
              {roles.map((role) => (
                <li key={role.title}>
                  <b>{role.title}</b>
                  <span>{role.body}</span>
                </li>
              ))}
            </ul>
            <p className="muted">
              Mithila scopes the work, writes the spec and signs off every release. The team designs, builds and ships it.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
