"use client";

import { useActionState, useMemo, useState } from "react";
import { createGameAction } from "@/app/actions/admin";
import type { ActionResult } from "@/app/actions/result";
import { ResultText } from "./action-button";

type Week = { id: string; label: string };
type Fx = { value: string; week: string; league: string; label: string };

/**
 * Admin → Games: one form for every game. Real (built on real fixtures, whenever you like) or Sim
 * (simulated, at the kick-off you choose). Name it, set the entry fee and the £ pot, pick which cards
 * — nothing else is made for you.
 */
export function NewGameForm({ weeks, fixtures, suggestedKickoff }: { weeks: Week[]; fixtures: Fx[]; suggestedKickoff: string }) {
  const [state, run, pending] = useActionState<ActionResult | null, FormData>(createGameAction, null);
  const [kind, setKind] = useState<"real" | "sim">("sim");
  const [week, setWeek] = useState(weeks[0]?.id ?? "");
  const [on, setOn] = useState<Set<string>>(new Set());
  const inWeek = useMemo(() => fixtures.filter((f) => f.week === week), [fixtures, week]);
  const leagues = [...new Set(inWeek.map((f) => f.league))];
  const toggle = (ids: string[], v: boolean) =>
    setOn((s) => {
      const n = new Set(s);
      ids.forEach((id) => (v ? n.add(id) : n.delete(id)));
      return n;
    });
  const field = "input min-w-0";
  return (
    <form action={run} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Real or simulated">
        {(
          [
            ["sim", "Sim game", "Simulated · watch it live in ~11 min"],
            ["real", "Real game", "Real fixtures · live scores"],
          ] as const
        ).map(([k, title, sub]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`rounded-2xl border-2 px-4 py-3 text-left transition ${kind === k ? (k === "sim" ? "border-[#8fe3ff] bg-[#8fe3ff]/10" : "border-accent bg-accent/10") : "border-ink-700 bg-ink-850"}`}
          >
            <span className="block font-display text-xl font-black uppercase italic leading-none">{title}</span>
            <span className="mt-1 block text-[11px] text-muted">{sub}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="g-name">Game name</label>
          <input id="g-name" name="name" className={field} placeholder={kind === "sim" ? "e.g. Sim Game 1" : "e.g. Gameweek 1 League Two"} required minLength={3} maxLength={40} />
        </div>
        <div>
          <label className="label" htmlFor="g-fee">Entry (£, 0 = free)</label>
          <input id="g-fee" name="fee" type="number" min={0} step="0.01" defaultValue="0" className={field} />
        </div>
        <div>
          <label className="label" htmlFor="g-pot">Prize pot (£) — winner takes it, ties split</label>
          <input id="g-pot" name="pot" type="number" min={0} step="0.01" placeholder="e.g. 20" className={field} />
        </div>
        <div>
          <label className="label" htmlFor="g-tier">Cards</label>
          <select id="g-tier" name="tier" className="input">
            <option value="">Any cards</option>
            <option value="BRONZE">Bronze only</option>
            <option value="SILVER">Silver only</option>
            <option value="GOLD">Gold only</option>
          </select>
        </div>
        <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
          <input type="checkbox" name="freeOnly" className="h-4 w-4 accent-lime" /> Free cards only
        </label>

        {kind === "sim" ? (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="g-ko">Kick-off (UK time)</label>
            <input id="g-ko" name="kickoffAt" type="datetime-local" defaultValue={suggestedKickoff} className={field} required />
            <p className="mt-1 text-xs text-faint">Every club plays, all kicking off together; entries close a minute before. Two sim games at the same kick-off share the same matchday.</p>
          </div>
        ) : (
          <div className="space-y-2 sm:col-span-2">
            <div>
              <label className="label" htmlFor="g-week">Fixtures from</label>
              <select
                id="g-week"
                name="gameweekId"
                className="input"
                value={week}
                onChange={(e) => {
                  setWeek(e.target.value);
                  setOn(new Set());
                }}
              >
                {weeks.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
              {!weeks.length && <p className="mt-1 text-xs text-warn">No fixtures loaded yet — load them under “Fixtures” below.</p>}
            </div>
            <fieldset className="min-w-0">
              <legend className="label">Which games count (none ticked = all of them)</legend>
              <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-ink-700 p-3">
                {leagues.map((lg) => {
                  const ids = inWeek.filter((f) => f.league === lg).map((f) => f.value);
                  return (
                    <div key={lg}>
                      <label className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">
                        <input type="checkbox" className="accent-lime" checked={ids.every((id) => on.has(id))} onChange={(e) => toggle(ids, e.target.checked)} /> {lg} — all {ids.length}
                      </label>
                      <div className="grid gap-1 pl-5 sm:grid-cols-2">
                        {inWeek
                          .filter((f) => f.league === lg)
                          .map((f) => (
                            <label key={f.value} className="flex items-center gap-2 text-sm">
                              <input type="checkbox" name="fixtureIds" value={f.value} className="accent-lime" checked={on.has(f.value)} onChange={(e) => toggle([f.value], e.target.checked)} />
                              <span className="min-w-0 truncate">{f.label}</span>
                            </label>
                          ))}
                      </div>
                    </div>
                  );
                })}
                {!inWeek.length && <p className="text-sm text-faint">No upcoming fixtures that week.</p>}
              </div>
              <p className="mt-1 text-xs text-faint">Only players from clubs in the ticked games can be picked. Entries close 10 minutes before the first of them kicks off.</p>
            </fieldset>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className={`px-6 py-3 text-sm ${kind === "sim" ? "btn bg-[#8fe3ff] text-[#04121a]" : "btn-primary"}`} disabled={pending}>
          {pending ? "Creating…" : kind === "sim" ? "Create sim game" : "Create real game"}
        </button>
        {state && <ResultText result={state} />}
      </div>
    </form>
  );
}
