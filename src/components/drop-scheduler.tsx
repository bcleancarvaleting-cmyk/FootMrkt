"use client";

import { useMemo, useState, useTransition } from "react";
import { scheduleDropsAction } from "@/app/actions/economy";
import type { ActionResult } from "@/app/actions/result";
import { ResultText } from "./action-button";

export type DbRow = {
  playerId: string;
  name: string;
  club: string | null;
  league: string | null;
  tier: string;
  position: string;
  maxSupply: number | null;
  issued: number;
  held: number;
  inPacks: number;
  pct: number | null;
  onDrop: boolean;
  /** Diamonds found so far (max 5, Gold players only). */
  diamonds: number;
  /** MATCHX points scored in the selected window (null = didn't play). */
  points: number | null;
  /** League code this player is the top performer in, if any. */
  topOf: string | null;
};

const DEFAULT_PRICE: Record<string, string> = { BRONZE: "0.50", SILVER: "2.50", GOLD: "10.00" };
const pad = (n: number) => String(n).padStart(2, "0");
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Player database with a release queue: tick players, set price and go-live time, schedule a week at once. */
export function DropScheduler({ rows, tops, pointsLabel }: { rows: DbRow[]; tops: DbRow[]; pointsLabel: string }) {
  const [queue, setQueue] = useState<Array<{ playerId: string; name: string; tier: string; price: string; liveAt: string }>>([]);
  const [perDay, setPerDay] = useState(10);
  const [start, setStart] = useState(() => {
    const d = new Date(Date.now() + 86_400_000);
    d.setHours(18, 0, 0, 0);
    return local(d);
  });
  const [pending, run] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const queued = useMemo(() => new Set(queue.map((q) => q.playerId)), [queue]);

  function toggle(r: DbRow) {
    setQueue((q) => (queued.has(r.playerId) ? q.filter((x) => x.playerId !== r.playerId) : [...q, { playerId: r.playerId, name: r.name, tier: r.tier, price: DEFAULT_PRICE[r.tier] ?? "1.00", liveAt: "" }]));
  }
  function addTops() {
    setQueue((q) => [
      ...q,
      ...tops.filter((r) => !queued.has(r.playerId)).map((r) => ({ playerId: r.playerId, name: r.name, tier: r.tier, price: DEFAULT_PRICE[r.tier] ?? "1.00", liveAt: "" })),
    ]);
  }
  function spread() {
    const base = new Date(start);
    setQueue((q) => q.map((x, i) => ({ ...x, liveAt: local(new Date(base.getTime() + Math.floor(i / Math.max(1, perDay)) * 86_400_000)) })));
  }
  function submit() {
    const items = queue.map((q) => ({ playerId: q.playerId, priceMinor: Math.round(Number(q.price) * 100), liveAt: q.liveAt ? new Date(q.liveAt).toISOString() : new Date(start).toISOString() }));
    run(async () => {
      const r = await scheduleDropsAction(items);
      setResult(r);
      if (r.ok) setQueue([]);
    });
  }

  return (
    <div className="space-y-5">
      {/* Phones: one compact row per player. */}
      <ul className="divide-y divide-ink-700 overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 md:hidden">
        {rows.map((r) => (
          <li key={r.playerId} className={queued.has(r.playerId) ? "bg-accent/5" : ""}>
            <label className="flex items-center gap-3 px-3 py-2.5">
              <input type="checkbox" className="h-5 w-5 shrink-0 accent-lime" checked={queued.has(r.playerId)} disabled={r.onDrop} onChange={() => toggle(r)} aria-label={`Queue ${r.name}`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-semibold">
                  <span className="truncate">{r.name}</span>
                  {r.topOf && <span className="text-xs text-lime">★</span>}
                  <span className={`text-[10px] font-extrabold ${r.tier === "GOLD" ? "text-gold" : r.tier === "SILVER" ? "text-silver" : "text-bronze"}`}>{r.tier}</span>
                </span>
                <span className="block truncate text-xs text-muted">
                  {r.position} · {r.club ?? "—"} {r.league}
                </span>
                <span className="block text-xs text-faint">
                  {r.held}/{r.maxSupply ?? "∞"} out · {r.pct ?? 0}% · {r.inPacks} in packs
                  {r.tier === "GOLD" ? ` · ◆ ${r.diamonds}/5` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-bold tabular-nums">{r.points ?? "—"}</span>
                <span className="block text-[10px] uppercase tracking-wider text-faint">pts</span>
                {r.onDrop && <span className="tag mt-1 text-lime">On drop</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-2xl border border-ink-700 md:block">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-ink-850 text-left text-[11px] uppercase tracking-[0.12em] text-faint">
            <tr>
              {["", "Player", "Club", "Tier", "Points", "Total available", "In circulation", "% in circulation", "In packs", ""].map((h, i) => (
                <th key={i} className="px-3 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700 bg-ink-900">
            {rows.map((r) => (
              <tr key={r.playerId} className={queued.has(r.playerId) ? "bg-accent/5" : ""}>
                <td className="px-3 py-2">
                  <input type="checkbox" className="accent-lime" checked={queued.has(r.playerId)} disabled={r.onDrop} onChange={() => toggle(r)} aria-label={`Queue ${r.name}`} />
                </td>
                <td data-label="Player" className="px-3 py-2 font-semibold">
                  {r.name} <span className="text-xs font-normal text-faint">{r.position}</span>
                  {r.topOf && (
                    <span className="ml-1 text-xs text-lime" title={`Top performer in ${r.topOf}`}>
                      ★
                    </span>
                  )}
                </td>
                <td data-label="Club" className="px-3 py-2">
                  {r.club ?? "—"} <span className="text-xs text-faint">{r.league}</span>
                </td>
                <td data-label="Tier" className={`px-3 py-2 text-xs font-extrabold ${r.tier === "GOLD" ? "text-gold" : r.tier === "SILVER" ? "text-silver" : "text-bronze"}`}>{r.tier}
                  {r.tier === "GOLD" && <span className="block text-[10px] font-bold text-[#8fe3ff]">◆ {r.diamonds}/5</span>}
                </td>
                <td data-label="Points" className="px-3 py-2 font-bold tabular-nums" title={pointsLabel}>{r.points ?? "—"}</td>
                <td data-label="Total available" className="px-3 py-2 tabular-nums">{r.maxSupply ?? "∞"}</td>
                <td data-label="In circulation" className="px-3 py-2 tabular-nums">{r.held}</td>
                <td data-label="% in circulation" className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-16 rounded-full bg-ink-800">
                      <span className="block h-1.5 rounded-full bg-[var(--color-chart)]" style={{ width: `${Math.min(100, r.pct ?? 0)}%` }} />
                    </span>
                    <span className="tabular-nums">{r.pct ?? 0}%</span>
                  </span>
                </td>
                <td data-label="In packs" className="px-3 py-2 tabular-nums text-muted">{r.inPacks}</td>
                <td className="px-3 py-2 text-xs">{r.onDrop && <span className="tag text-lime">On drop</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {queue.length > 0 && (
        <a href="#release-queue" className="btn-primary fixed inset-x-4 bottom-24 z-30 shadow-xl md:hidden">
          Release queue · {queue.length} → set prices &amp; schedule
        </a>
      )}
      <section id="release-queue" className="panel scroll-mt-36 space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="mr-auto text-2xl">Release queue · {queue.length}</h2>
          <div>
            <label className="label" htmlFor="q-start">First drop</label>
            <input id="q-start" type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="q-per">Players per day</label>
            <input id="q-per" type="number" min={1} max={50} className="input w-24" value={perDay} onChange={(e) => setPerDay(Number(e.target.value) || 1)} />
          </div>
          <button type="button" className="btn-ghost" onClick={addTops} disabled={!tops.length || tops.every((t) => queued.has(t.playerId))} title={tops.map((t) => `${t.topOf}: ${t.name} (${t.points} pts)`).join("\n")}>
            + Top performer from each league
          </button>
          <button type="button" className="btn-ghost" onClick={spread} disabled={!queue.length}>
            Spread across days
          </button>
        </div>
        {queue.length === 0 ? (
          <p className="text-sm text-faint">Tick players above to queue them. Each drop is one new copy, never found in packs, on sale from its go-live time with no end time.</p>
        ) : (
          <ul className="divide-y divide-ink-700 text-sm">
            {queue.map((q, i) => (
              <li key={q.playerId} className="flex flex-wrap items-center gap-3 py-2">
                <span className="min-w-0 flex-1 font-semibold">
                  {q.name} <span className="text-xs text-faint">{q.tier.toLowerCase()}</span>
                </span>
                <label className="flex items-center gap-1 text-xs text-muted">
                  MX
                  <input type="number" step="0.01" min="0.10" max="100" className="input w-24 py-1.5" value={q.price} onChange={(e) => setQueue((all) => all.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} aria-label={`Price for ${q.name}`} />
                </label>
                <input type="datetime-local" className="input w-auto py-1.5" value={q.liveAt || start} onChange={(e) => setQueue((all) => all.map((x, j) => (j === i ? { ...x, liveAt: e.target.value } : x)))} aria-label={`Go-live time for ${q.name}`} />
                <button type="button" className="text-xs text-muted hover:text-fg" onClick={() => setQueue((all) => all.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-3">
          <button type="button" className="btn-primary" disabled={!queue.length || pending} onClick={submit}>
            {pending ? "Scheduling…" : `Schedule ${queue.length} drop${queue.length === 1 ? "" : "s"}`}
          </button>
          {result && <ResultText result={result} />}
        </div>
      </section>
    </div>
  );
}
