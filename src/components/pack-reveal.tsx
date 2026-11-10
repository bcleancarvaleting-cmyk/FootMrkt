"use client";

import Link from "next/link";
import { DiamondGem } from "./diamond-art";
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
    const t = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 300 : next.diamond ? 1600 : next.category === "GOLD" ? 900 : 380);
    return () => clearTimeout(t);
  }, [shown, order]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-center gap-4">
        {order.map((c, i) => (
          <div key={c.id} className={`relative ${i < shown ? "animate-reveal" : "invisible"}`}>
            {c.diamond && i < shown && (
              <span className="diamond-halo absolute -top-8 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-r from-[#9be8ff] via-white to-[#d6a8ff] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-ink-950">
                <DiamondGem id={`reveal-${c.id}`} size={16} />
                Diamond {c.diamond} of 5
              </span>
            )}
            <Link href={`/cards/${c.id}`}>
              <PlayerCard card={c} className={c.category === "GOLD" ? "animate-gold" : ""} />
            </Link>
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

const rank = (c: CardView) => (c.diamond ? 3 : c.category === "GOLD" ? 2 : c.category === "SILVER" ? 1 : 0);
