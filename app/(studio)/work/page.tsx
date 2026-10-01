import type { Metadata } from "next";
import { CaseStudyBlock } from "@/components/studio/case-study";
import { caseStudies } from "@/components/studio/content";
import { ShotWall } from "@/components/studio/shot-wall";

export const metadata: Metadata = {
  title: "Our Work",
  description: "What was broken, what we built, what changed.",
};

export default function WorkPage() {
  return (
    <>
      <section className="tight-bottom">
        <div className="wrap stack gap-24">
          <span className="eyebrow">Our work</span>
          <h1 className="page-title work">What was broken, what we built, what changed.</h1>
        </div>
        <div className="wrap">
          <ShotWall />
        </div>
      </section>
      <section className="flush-top">
        <div className="wrap">
          {caseStudies.map((study) => (
            <CaseStudyBlock key={study.title} study={study} />
          ))}
        </div>
      </section>
    </>
  );
}
