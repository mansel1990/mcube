"use client";

/* Card thumbnails use raw images so the rail crop matches the studio layout. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useRef } from "react";
import { railItems, type RailItem } from "./content";

function RailCard({ item, tabIndex }: { item: RailItem; tabIndex?: number }) {
  const className = "client";
  const inner = (
    <>
      <span className="tag">{item.tag}</span>
      <img
        className={item.tall ? "thumb tall" : "thumb"}
        src={item.image}
        alt={item.alt}
        loading="lazy"
      />
      <span className="name">{item.name}</span>
      <span className="muted">{item.summary}</span>
      <span className="go">{item.go}</span>
    </>
  );

  if (item.external) {
    return (
      <a className={className} href={item.href} target="_blank" rel="noopener" tabIndex={tabIndex}>
        {inner}
      </a>
    );
  }

  return (
    <Link className={className} href={item.href} tabIndex={tabIndex}>
      {inner}
    </Link>
  );
}

export function WorkRail() {
  const railRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const paused = useRef(false);
  const x = useRef(0);
  const resumeTimer = useRef<number | null>(null);
  const copies = [railItems, railItems];

  useEffect(() => {
    const rail = railRef.current;
    const track = trackRef.current;
    if (!rail || !track) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const half = () => track.scrollWidth / 2;

    const onScroll = () => {
      const h = half();
      if (h <= 0) return;
      if (rail.scrollLeft >= h) {
        rail.scrollLeft -= h;
        x.current = rail.scrollLeft;
      } else if (rail.scrollLeft <= 0 && paused.current) {
        rail.scrollLeft += h;
        x.current = rail.scrollLeft;
      }
    };

    rail.addEventListener("scroll", onScroll, { passive: true });

    let frame = 0;
    const tick = () => {
      if (!paused.current && !document.hidden && rail.offsetParent !== null) {
        const h = half();
        if (h > 0) {
          x.current += 0.45;
          if (x.current >= h) x.current -= h;
          rail.scrollLeft = x.current;
        }
      }
      frame = requestAnimationFrame(tick);
    };

    if (!reduce) frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      rail.removeEventListener("scroll", onScroll);
      if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    };
  }, []);

  function pause(ms?: number) {
    paused.current = true;
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    if (ms) {
      resumeTimer.current = window.setTimeout(() => {
        paused.current = false;
        if (railRef.current) x.current = railRef.current.scrollLeft;
      }, ms);
    }
  }

  function resume() {
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    paused.current = false;
    if (railRef.current) x.current = railRef.current.scrollLeft;
  }

  function step(dir: number) {
    const rail = railRef.current;
    const track = trackRef.current;
    if (!rail || !track) return;
    const first = track.querySelector("li");
    const width = (first?.getBoundingClientRect().width ?? 300) + 18;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    pause(4000);
    rail.scrollBy({ left: dir * width, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <>
      <div
        className="rail"
        ref={railRef}
        aria-label="Recent work"
        onMouseEnter={() => pause()}
        onMouseLeave={resume}
        onTouchStart={() => pause(3500)}
        onFocus={() => pause()}
        onBlur={resume}
      >
        <ul className="rail-track" ref={trackRef}>
          {copies.map((items, copy) =>
            items.map((item) => (
              <li key={`${copy}-${item.name}`} aria-hidden={copy === 1 ? true : undefined}>
                <RailCard item={item} tabIndex={copy === 1 ? -1 : undefined} />
              </li>
            )),
          )}
        </ul>
      </div>
      <div className="rail-ctrl">
        <button className="rail-btn" type="button" aria-label="Previous project" onClick={() => step(-1)}>
          ←
        </button>
        <button className="rail-btn" type="button" aria-label="Next project" onClick={() => step(1)}>
          →
        </button>
      </div>
    </>
  );
}
