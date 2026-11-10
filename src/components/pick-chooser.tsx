"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { choosePickAction } from "@/app/actions/account";
import type { ActionResult } from "@/app/actions/result";
import type { CardView } from "@/lib/view";
import { ResultText } from "./action-button";
import { PlayerCard } from "./player-card";

/** Choose `keep` of the offered players (Starter Loans: 2 of 6), then confirm once. */
export function PickChooser({ entitlementId, cards, keep, verb }: { entitlementId: string; cards: CardView[]; keep: number; verb: string }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult<unknown> | null>(null);
  const names = cards.filter((c) => chosen.includes(c.playerId)).map((c) => c.name);

  function toggle(id: string) {
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= keep ? [...c.slice(1), id] : [...c, id]));
  }
  function confirm() {
    if (!window.confirm(`${verb} ${names.join(" and ")}? You can't change your mind.`)) return;
    start(async () => {
      const r = await choosePickAction(entitlementId, chosen);
      if (r.ok) router.push(`/packs/opening/${r.data.openingId}`);
      else setRes(r);
    });
  }

  return (
    <div className="space-y-6">
      <ul className={`mx-auto flex flex-wrap items-start justify-center gap-3 sm:gap-6 ${keep > 1 ? "max-w-3xl" : ""}`}>
        {cards.map((c) => {
          const on = chosen.includes(c.playerId);
          return (
            <li key={c.playerId}>
              <button
                type="button"
                onClick={() => toggle(c.playerId)}
                aria-pressed={on}
                className={`relative block rounded-[22px] p-1 transition ${on ? "ring-4 ring-lime" : "opacity-90 hover:opacity-100"}`}
              >
                {keep > 1 ? (
                  <>
                    {/* Two per row on phones, bigger cards from tablet up. */}
                    <PlayerCard card={{ ...c, acquired: null, pointsForYou: null }} size="sm" className="sm:hidden" />
                    <PlayerCard card={{ ...c, acquired: null, pointsForYou: null }} size="md" className="hidden sm:block" />
                  </>
                ) : (
                  <PlayerCard card={{ ...c, acquired: null, pointsForYou: null }} size="lg" />
                )}
                {on && <span className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-lime font-black text-ink-950">✓</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-20 z-10 mx-auto flex max-w-md flex-col items-center gap-2 rounded-2xl border border-ink-700 bg-ink-900/95 p-3 backdrop-blur sm:bottom-4">
        <p className="text-sm text-muted">
          {chosen.length < keep ? `Choose ${keep - chosen.length} more` : names.join(" & ")}
        </p>
        <button type="button" className="btn-primary w-full" disabled={chosen.length !== keep || pending} onClick={confirm}>
          {pending ? "Signing…" : chosen.length === keep ? `${verb} ${keep > 1 ? "both" : names[0]}` : `Choose ${keep}`}
        </button>
        {res && <ResultText result={res} />}
      </div>
    </div>
  );
}
