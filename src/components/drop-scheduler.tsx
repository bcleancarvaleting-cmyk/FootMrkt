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
};

const DEFAULT_PRICE: Record<string, string> = { BRONZE: "0.50", SILVER: "2.50", GOLD: "10.00" };
const pad = (n: number) => String(n).padStart(2, "0");
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Player database with a release queue: tick players, set price and go-live time, schedule a week at once. */
export function DropScheduler({ rows }: { rows: DbRow[] }) {
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
      <div className="overflow-x-auto rounded-2xl border border-ink-700">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-ink-850 text-left text-[11px] uppercase tracking-[0.12em] text-faint">
            <tr>
              {["", "Player", "Club", "Tier", "Total available", "In circulation", "% in circulation", "In packs", ""].map((h, i) => (
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
                <td className="px-3 py-2 font-semibold">
                  {r.name} <span className="text-xs font-normal text-faint">{r.position}</span>
                </td>
                <td className="px-3 py-2">
                  {r.club ?? "—"} <span className="text-xs text-faint">{r.league}</span>
                </td>
                <td className={`px-3 py-2 text-xs font-extrabold ${r.tier === "GOLD" ? "text-gold" : r.tier === "SILVER" ? "text-silver" : "text-bronze"}`}>{r.tier}</td>
                <td className="px-3 py-2 tabular-nums">{r.maxSupply ?? "∞"}</td>
                <td className="px-3 py-2 tabular-nums">{r.held}</td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-16 rounded-full bg-ink-800">
                      <span className="block h-1.5 rounded-full bg-[var(--color-chart)]" style={{ width: `${Math.min(100, r.pct ?? 0)}%` }} />
                    </span>
                    <span className="tabular-nums">{r.pct ?? 0}%</span>
                  </span>
                </td>
                <td className="px-3 py-2 tabular-nums text-muted">{r.inPacks}</td>
                <td className="px-3 py-2 text-xs">{r.onDrop && <span className="tag text-lime">On drop</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="panel space-y-4 p-5">
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
