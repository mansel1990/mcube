import { ScreenshotScene } from "./screenshot-scene";
import type { CaseStudy } from "./content";

export function CaseStudyBlock({ study }: { study: CaseStudy }) {
  return (
    <article className="case">
      <div className="stack gap-24">
        <span className="eyebrow">{study.eyebrow}</span>
        <h2>{study.title}</h2>
        {study.problem ? (
          <div>
            <p className="label">The problem</p>
            <p>{study.problem}</p>
          </div>
        ) : null}
        <div>
          <p className="label">What we built</p>
          <p>{study.built}</p>
        </div>
        {study.stats ? (
          <div className="stats">
            {study.stats.map((stat) => (
              <div className="stat" key={stat.value}>
                <b>{stat.value}</b>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="row">
          {study.links.map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noopener">
              {link.label}
            </a>
          ))}
        </div>
      </div>
      <ScreenshotScene phones={study.phones} webs={study.webs} solo={study.solo} />
    </article>
  );
}
