"use client";

import Link from "next/link";
import { FinishPill } from "./finish-art";
import { useEffect, useState } from "react";
import type { CardView } from "@/lib/view";
import { PlayerCard } from "./player-card";

/** Reveals already-issued cards one by one. Contents were decided server-side before this renders. */
export function PackReveal({ cards }: { cards: CardView[] }) {
  // Reveal lowest tiers first so the best card lands last.
  const order = [...cards].sort((a, b) => rank(a) - rank(b));
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= order.length) return;
    // Build up to the big ones: a Gold pauses, a Diamond pauses longer.
    const next = order[shown];
    const t = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 300 : next.finish ? (next.finish.kind === "DIAMOND" ? 1800 : 1300) : next.category === "GOLD" ? 900 : 380);
    return () => clearTimeout(t);
  }, [shown, order]);
  return (
    <div className="space-y-6">
      {/* Every card sits in the same-sized cell with a label underneath, so rows line up neatly. */}
      <div className={`flex flex-wrap items-start justify-center gap-x-4 gap-y-5 sm:grid sm:justify-center ${columns(order.length)}`}>
        {order.map((c, i) => (
          <div key={c.id} className={`flex w-44 flex-col items-center gap-3 ${i < shown ? "animate-reveal" : "invisible"}`}>
            <Link href={`/cards/${c.id}`}>
              <PlayerCard card={c} className={c.category === "GOLD" && !c.finish ? "animate-gold" : ""} />
            </Link>
            <div className="flex h-7 items-center">
              {c.finish ? (
                <FinishPill finish={c.finish} id={`reveal-${c.id}`} size="lg" className={c.finish.kind === "DIAMOND" ? "diamond-halo" : "ruby-halo"} />
              ) : (
                <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${TIER_PILL[c.category]}`}>{c.category}</span>
              )}
            </div>
          </div>
        ))}
      </div>
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

const rank = (c: CardView) => (c.finish?.kind === "DIAMOND" ? 4 : c.finish ? 3 : c.category === "GOLD" ? 2 : c.category === "SILVER" ? 1 : 0);
