/* eslint-disable @next/next/no-img-element */
import type { SignalSource } from "@/lib/stocks/types";
import { HERO_META } from "@/lib/stocks/heroes";

/**
 * Hero portrait — real Dota hero art loaded at runtime from Steam's public CDN
 * (nothing committed to the repo, per PRD §8). Bench strategies have no hero
 * assigned yet and render an initial sigil instead.
 */
export function HeroPortrait({
  source,
  size = "md",
  grey = false,
}: {
  source: SignalSource;
  size?: "sm" | "md" | "lg";
  grey?: boolean;
}) {
  const hero = HERO_META[source];
  const dims =
    size === "lg" ? "w-[86px] h-[48px]" : size === "md" ? "w-[64px] h-9" : "w-[34px] h-5";

  if (!hero.img) {
    return (
      <div
        className={`${dims} rounded-md border bg-[#151b27] flex items-center justify-center shrink-0 ${grey ? "grayscale opacity-60" : ""}`}
        style={{ borderColor: `${hero.accent}44` }}
        aria-label={hero.name}
      >
        <span className="cz text-[11px] font-bold" style={{ color: hero.accent }}>
          {hero.name
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .slice(0, 3)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`${dims} rounded-md border border-black/80 overflow-hidden bg-black shrink-0 ${grey ? "grayscale opacity-60" : ""}`}
      style={{ boxShadow: grey ? undefined : `0 0 8px ${hero.accent}33` }}
    >
      <img src={hero.img} alt={hero.dota ?? hero.name} className="w-full h-full object-cover" loading="lazy" />
    </div>
  );
}

/**
 * Full-bleed banner art for card headers — hero portrait anchored right,
 * masked so it fades into the panel. Absolutely positioned: parent must be
 * `relative overflow-hidden`.
 */
export function HeroBanner({ source }: { source: SignalSource }) {
  const hero = HERO_META[source];
  if (!hero.img) return null;
  return (
    <>
      <img
        src={hero.img}
        alt=""
        aria-hidden
        loading="lazy"
        className="absolute inset-y-0 right-0 w-[62%] h-full object-cover object-top"
        style={{
          maskImage: "linear-gradient(to left, rgba(0,0,0,0.95) 35%, transparent)",
          WebkitMaskImage: "linear-gradient(to left, rgba(0,0,0,0.95) 35%, transparent)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(90deg, ${hero.accent}26, transparent 45%), linear-gradient(to top, rgba(10,13,18,0.55), transparent 60%)`,
        }}
      />
    </>
  );
}

/** Compact inline chip: round hero face + roster name (tables, lists) */
export function HeroChip({ source }: { source: SignalSource }) {
  const hero = HERO_META[source];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold pl-0.5 pr-2 py-0.5 rounded-full border bg-black/30"
      style={{ borderColor: `${hero.accent}55`, color: hero.accent }}
    >
      <span
        className="w-[18px] h-[18px] rounded-full overflow-hidden border bg-black shrink-0"
        style={{ borderColor: `${hero.accent}66` }}
      >
        {hero.img ? (
          <img
            src={hero.img}
            alt={hero.dota ?? hero.name}
            className="w-full h-full object-cover object-top scale-[1.6]"
            loading="lazy"
          />
        ) : (
          <span className="cz text-[8px] font-bold flex items-center justify-center w-full h-full" style={{ color: hero.accent }}>
            {hero.name[0]}
          </span>
        )}
      </span>
      {hero.name}
    </span>
  );
}

/** Round face crop used in the roster filter bar */
export function HeroFace({
  img,
  accent,
  label,
  active = false,
  grey = false,
}: {
  img: string | null;
  accent: string;
  label: string;
  active?: boolean;
  grey?: boolean;
}) {
  return (
    <div
      className={`w-12 h-12 rounded-full overflow-hidden border-2 bg-black flex items-center justify-center shrink-0 ${grey ? "grayscale opacity-50" : ""}`}
      style={{
        borderColor: active ? accent : "#38415a",
        boxShadow: active ? `0 0 12px ${accent}66` : undefined,
      }}
    >
      {img ? (
        <img
          src={img}
          alt={label}
          className="w-full h-full object-cover object-top scale-[1.6]"
          loading="lazy"
        />
      ) : (
        <span className="cz text-sm font-bold" style={{ color: accent }}>
          {label
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .slice(0, 2)}
        </span>
      )}
    </div>
  );
}
