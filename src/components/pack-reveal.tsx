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
      <div className="flex flex-wrap justify-center gap-4">
        {order.map((c, i) => (
          <div key={c.id} className={`relative ${i < shown ? "animate-reveal" : "invisible"}`}>
            <Link href={`/cards/${c.id}`}>
              <PlayerCard card={c} className={c.category === "GOLD" && !c.finish ? "animate-gold" : ""} />
            </Link>
            {c.finish && i < shown && (
              <div className="mt-3 flex justify-center">
                <FinishPill finish={c.finish} id={`reveal-${c.id}`} size="lg" className={c.finish.kind === "DIAMOND" ? "diamond-halo" : "ruby-halo"} />
              </div>
            )}
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

const rank = (c: CardView) => (c.finish?.kind === "DIAMOND" ? 4 : c.finish ? 3 : c.category === "GOLD" ? 2 : c.category === "SILVER" ? 1 : 0);
