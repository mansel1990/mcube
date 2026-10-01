"use client";

/* Screenshot frames use raw images so the phone and browser CSS can size them. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Shot } from "./content";

type Props = {
  phones: Shot[];
  webs?: Shot[];
  solo?: boolean;
};

export function ScreenshotScene({ phones, webs, solo }: Props) {
  const [order, setOrder] = useState(() => phones.map((_, index) => index));
  const [webIndex, setWebIndex] = useState(0);
  const [flying, setFlying] = useState<number | null>(null);
  const reduceRef = useRef(false);
  const hovered = useRef(false);
  const orderRef = useRef(order);

  const advance = useCallback(() => {
    if (phones.length > 1) {
      const current = orderRef.current;
      const front = current[0];
      const next = [...current.slice(1), front];
      orderRef.current = next;
      if (!reduceRef.current) {
        setFlying(front);
        window.setTimeout(() => {
          setFlying((value) => (value === front ? null : value));
        }, 950);
      }
      setOrder(next);
    }
    if (webs && webs.length > 1) {
      setWebIndex((index) => (index + 1) % webs.length);
    }
  }, [phones.length, webs]);

  useEffect(() => {
    reduceRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceRef.current) return;
    const id = window.setInterval(() => {
      if (!hovered.current && !document.hidden) advance();
    }, 3800);
    return () => window.clearInterval(id);
  }, [advance]);

  const phone = phones[order[0]];
  const web = webs?.[webIndex];
  const caption = [web?.cap, phone?.cap].filter(Boolean).join(" · ");
  const canAdvance = phones.length > 1 || (webs?.length ?? 0) > 1;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      advance();
    }
  }

  return (
    <div className="deckwrap">
      <div
        className={solo ? "scene solo" : "scene"}
        tabIndex={0}
        aria-label="Web and mobile screenshots. Select to see the next ones."
        onClick={advance}
        onKeyDown={onKeyDown}
        onMouseEnter={() => {
          hovered.current = true;
        }}
        onMouseLeave={() => {
          hovered.current = false;
        }}
      >
        {webs && webs.length > 0 ? (
          <div className="browser">
            <div className="bbar">
              <i />
              <i />
              <i />
              <span className="burl">{web?.url}</span>
            </div>
            <div className="screens">
              {webs.map((shot, index) => (
                <img
                  key={shot.src}
                  src={shot.src}
                  alt={shot.alt}
                  className={index === webIndex ? "on" : undefined}
                />
              ))}
            </div>
          </div>
        ) : null}
        <div className="deck" data-count={phones.length}>
          {order.map((shotIndex, position) => {
            const shot = phones[shotIndex];
            return (
              <figure
                key={shot.src}
                className={flying === shotIndex ? "card fly" : "card"}
                data-pos={position}
              >
                <img src={shot.src} alt={shot.alt} />
              </figure>
            );
          })}
        </div>
      </div>
      <div className="deckbar">
        <span className="deckcap" aria-live="polite">
          {caption}
        </span>
        {canAdvance ? (
          <button
            className="decknext"
            type="button"
            aria-label="Next screenshots"
            onClick={advance}
          >
            Next →
          </button>
        ) : null}
      </div>
    </div>
  );
}
