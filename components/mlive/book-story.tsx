"use client";

import { useEffect, useRef } from "react";

export function BookStory({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="story-back" onClick={onClose}>
      <aside className="story-panel" role="dialog" aria-modal="true" aria-labelledby="book-story-title" onClick={(event) => event.stopPropagation()}>
        <header className="story-head">
          <p className="story-kicker">Long Game</p>
          <h2 id="book-story-title">The four jars</h2>
          <button type="button" className="story-close" ref={closeRef} onClick={onClose}>Close</button>
        </header>

        <p>Long Game is slow money. It is not a share you buy in the morning and sell before the market shuts. Picture a shelf with four jars.</p>

        <div className="jar-list" aria-hidden="true">
          <div className="jar-row"><span>Nifty 50 · 40</span><span className="jar-track"><i style={{ width: "40%" }} /></span></div>
          <div className="jar-row"><span>Next basket of companies · 20</span><span className="jar-track"><i style={{ width: "20%" }} /></span></div>
          <div className="jar-row"><span>Gold · 25</span><span className="jar-track"><i style={{ width: "25%" }} /></span></div>
          <div className="jar-row"><span>Quiet cash-like fund · 15</span><span className="jar-track"><i style={{ width: "15%" }} /></span></div>
        </div>

        <h3>Core is the recipe that stays</h3>
        <p>Core is a recipe card taped to the shelf. The amounts never change: 40 parts in the Nifty jar, 20 in the next basket of companies, 25 in gold, and 15 in the quiet fund.</p>
        <p>When one jar grows taller than its line, Core does not rush to sell it. The next time money is added, more of that money goes into the jar that has fallen behind, until the shelf looks like the recipe again.</p>
        <p>You still say yes before any money moves. Core can ask. It cannot spend on its own.</p>

        <h3>Radar was a recipe that watched the weather</h3>
        <p>Radar was a second idea for the same four jars. Instead of a fixed card, it would watch the season. Some years it would pour more into the company jars. Other years it would pour more into gold or the quiet fund. Same jars. Different amounts. Only a few changes a year.</p>

        <h3>The sealed test</h3>
        <p>One stretch of history was kept sealed, the way a science test keeps one sample untouched until the end. Then both recipes were measured on that stretch. The question was simple: in the worst fall, how far down did each one go?</p>
        <div className="story-falls">
          <p><b>Core</b><span>fell 12.5%</span></p>
          <p><b>Radar</b><span>fell 14.2%</span></p>
        </div>
        <p>There was a line at 15%. Radar stayed under that line. The second rule was stricter: the moving recipe had to fall less than the fixed one. 14.2 is not less than 12.5, so Radar did not pass. That was held-back run 17, read on 18 Nov 2026.</p>

        <h3>What the live shelf uses</h3>
        <p>The live book uses Core, the fixed recipe. Radar stays in the research notebook. It is not a second pile of money, and it does not place orders.</p>
        <p className="story-note">These numbers describe that sealed test. They are not a promise about next year.</p>
      </aside>
    </div>
  );
}
