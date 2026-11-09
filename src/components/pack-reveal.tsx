"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CardView } from "@/lib/view";
import { PlayerCard } from "./player-card";

/** Reveals already-issued cards one by one. Contents were decided server-side before this renders. */
export function PackReveal({ cards }: { cards: CardView[] }) {
  // Reveal lowest tiers first so the best card lands last.
  const order = [...cards].sort((a, b) => rank(a.category) - rank(b.category));
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= order.length) return;
    const t = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 300 : order[shown].category === "GOLD" ? 900 : 380);
    return () => clearTimeout(t);
  }, [shown, order]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-center gap-4">
        {order.map((c, i) => (
          <div key={c.id} className={i < shown ? "animate-reveal" : "invisible"}>
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

const rank = (c: string) => (c === "GOLD" ? 2 : c === "SILVER" ? 1 : 0);
