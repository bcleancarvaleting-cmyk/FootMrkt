"use client";

import Link from "next/link";
import { FINISH_STYLE, FinishPill, RainbowChant } from "./finish-art";
import { useEffect, useState } from "react";
import type { CardView } from "@/lib/view";
import { PlayerCard } from "./player-card";

/**
 * Reveals already-issued cards one by one. Contents were decided server-side before this renders.
 * Each card spins in on a stage (Golds and special finishes spin longer, with a flash), then lands
 * in the grid below. Tap the stage to skip to the next card.
 */
export function PackReveal({ cards }: { cards: CardView[] }) {
  // Reveal lowest tiers first so the best card lands last.
  const order = [...cards].sort((a, b) => rank(a) - rank(b));
  const [shown, setShown] = useState(0);
  // A Rainbow (one of one) gets its own full-screen moment once it's been revealed.
  const rainbowAt = order.findIndex((c) => c.finish?.kind === "RAINBOW");
  const rainbow = rainbowAt >= 0 ? order[rainbowAt] : null;
  const [dismissed, setDismissed] = useState(false);
  const staged = shown < order.length ? order[shown] : null;
  const big = !!staged && (staged.category === "GOLD" || !!staged.finish);
  useEffect(() => {
    if (shown >= order.length) return;
    // Build up to the big ones: a Gold spins longer, a Diamond longer still.
    const next = order[shown];
    const calm = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setShown((s) => s + 1), calm ? 300 : next.finish ? 900 + FINISH_STYLE[next.finish.kind].pause : next.category === "GOLD" ? 1700 : 950);
    return () => clearTimeout(t);
  }, [shown, order]);
  return (
    <div className="space-y-6">
      {staged && (
        <button type="button" onClick={() => setShown((s) => s + 1)} className="mx-auto flex min-h-[22rem] w-full items-center justify-center [perspective:1000px]" aria-label="Next card">
          <div key={staged.id} className={`relative ${big ? "animate-spin-in-big" : "animate-spin-in"}`}>
            {big && <span className="spin-flash" aria-hidden="true" />}
            <PlayerCard card={staged} size="lg" />
          </div>
        </button>
      )}
      {/* Every card sits in the same-sized cell with a label underneath, so rows line up neatly. */}
      <div className={`flex flex-wrap items-start justify-center gap-x-4 gap-y-5 sm:grid sm:justify-center ${columns(order.length)}`}>
        {order.map((c, i) => (
          <div key={c.id} className={`flex w-44 flex-col items-center gap-3 ${i < shown ? "animate-land" : "hidden sm:invisible sm:flex"}`}>
            <Link href={`/cards/${c.id}`}>
              <PlayerCard card={c} className={c.category === "GOLD" && !c.finish ? "animate-gold" : ""} />
            </Link>
            <div className="flex h-7 items-center">
              {c.finish ? (
                <FinishPill finish={c.finish} id={`reveal-${c.id}`} size="lg" className={FINISH_STYLE[c.finish.kind].halo} />
              ) : (
                <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${TIER_PILL[c.category]}`}>{c.category}</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {rainbow && shown > rainbowAt && !dismissed && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-ink-950/90 p-6 text-center backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="One of one">
          <p className="rainbow-name font-display text-5xl font-black uppercase italic sm:text-7xl">One of one</p>
          <div className="animate-reveal">
            <PlayerCard card={rainbow} size="lg" />
          </div>
          <RainbowChant name={rainbow.name} full className="text-2xl" />
          <p className="max-w-sm text-sm text-muted">
            You&apos;ve pulled the <b className="rainbow-name">Rainbow {rainbow.name}</b>. There is only one in the whole game, and it&apos;s yours. It goes in the Hall of Fame.
          </p>
          <button type="button" className="btn-primary px-8" onClick={() => setDismissed(true)}>
            Send to my club
          </button>
        </div>
      )}
      {shown < order.length && (
        <div className="text-center">
          <button className="btn-ghost" onClick={() => setShown(order.length)}>
            Reveal all
          </button>
        </div>
      )}
    </div>
  );
}

/** Even rows: 6 cards → 2 rows of 3, 12 → 3 rows of 4, and so on (phones just wrap). */
function columns(n: number) {
  if (n <= 1) return "sm:grid-cols-[repeat(1,11rem)]";
  if (n === 2) return "sm:grid-cols-[repeat(2,11rem)]";
  if (n === 4) return "sm:grid-cols-[repeat(2,11rem)] lg:grid-cols-[repeat(4,11rem)]";
  if (n % 3 === 0 && n <= 9) return "sm:grid-cols-[repeat(3,11rem)]";
  return "sm:grid-cols-[repeat(3,11rem)] lg:grid-cols-[repeat(4,11rem)]";
}

const TIER_PILL: Record<CardView["category"], string> = {
  GOLD: "border-gold/60 text-gold",
  SILVER: "border-silver/60 text-silver",
  BRONZE: "border-bronze/60 text-bronze",
};

const rank = (c: CardView) => (c.finish ? FINISH_STYLE[c.finish.kind].rank : c.category === "GOLD" ? 2 : c.category === "SILVER" ? 1 : 0);
