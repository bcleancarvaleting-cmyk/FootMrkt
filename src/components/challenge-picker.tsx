"use client";

import { useMemo, useState, useTransition } from "react";
import { completeChallengeAction } from "@/app/actions/account";
import type { ActionResult } from "@/app/actions/result";
import type { CardView } from "@/lib/view";
import { ResultText } from "./action-button";

/** Pick exactly `count` cards. Starts with the lowest-value eligible cards ticked. */
export function ChallengePicker({ challengeId, count, maxPerClub, cards }: { challengeId: string; count: number; maxPerClub: number | null; cards: CardView[] }) {
  const initial = useMemo(() => {
    const picked: string[] = [];
    const per = new Map<string, number>();
    for (const c of cards) {
      if (picked.length >= count) break;
      const k = c.clubCode ?? "-";
      if (maxPerClub && (per.get(k) ?? 0) >= maxPerClub) continue;
      per.set(k, (per.get(k) ?? 0) + 1);
      picked.push(c.id);
    }
    return picked;
  }, [cards, count, maxPerClub]);
  const [sel, setSel] = useState<string[]>(initial);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < count ? [...s, id] : s));

  if (cards.length < count) {
    return <p className="rounded-2xl border border-dashed border-ink-600 p-8 text-center text-sm text-muted">You have {cards.length} eligible card{cards.length === 1 ? "" : "s"} — this needs {count}. Open packs or trade to get more.</p>;
  }
  return (
    <div>
      <ul className="space-y-1.5">
        {cards.map((c) => {
          const on = sel.includes(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => toggle(c.id)}
                aria-pressed={on}
                className={`row-item tier-${c.category} w-full text-left ${on ? "border-accent bg-accent/5" : ""}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? "border-accent bg-accent text-accent-ink" : "border-ink-600"}`}>{on ? "✓" : ""}</span>
                <span className="w-9 text-center text-[11px] font-extrabold tracking-[0.12em] text-muted">{c.position}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-lg font-bold uppercase">{c.name}</span>
                  <span className="block truncate text-xs text-muted">{c.clubName} · {c.category.toLowerCase()}{c.tradeable ? "" : " · free card"}</span>
                </span>
                <span className="w-20 text-right font-bold tabular-nums">{c.valueMp ?? "—"} MP</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-24 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-700 bg-ink-900/95 p-4 backdrop-blur md:bottom-4">
        <span className="text-sm">
          <b className="tabular-nums">{sel.length}/{count}</b> selected · these cards leave your club for good
        </span>
        <span className="flex flex-col items-end gap-1">
          <button
            type="button"
            className="btn-primary"
            disabled={pending || sel.length !== count}
            onClick={() => {
              if (!window.confirm(`Hand in ${count} card${count > 1 ? "s" : ""}? This can't be undone.`)) return;
              start(async () => setResult(await completeChallengeAction(challengeId, sel, key)));
            }}
          >
            {pending ? "Working…" : "Complete challenge"}
          </button>
          {result && <ResultText result={result} />}
        </span>
      </div>
    </div>
  );
}
