"use client";

import { useMemo, useState, useTransition } from "react";
import { submitEntryAction, withdrawEntryAction } from "@/app/actions/game";
import type { ActionResult } from "@/app/actions/result";
import type { CardView, Pos } from "@/lib/view";
import { mpLabel } from "@/lib/view";
import { ResultText } from "./action-button";
import { CategoryDot, tierStyle } from "./player-card";

export interface BuilderCard extends CardView {
  available: boolean;
  unavailableReason?: string;
  form: number[];
  fixture: string | null; // "vs ABC (H)"
}

interface Formation {
  id: string;
  def: number;
  mid: number;
  att: number;
  status: string;
}

type SlotKey = string; // e.g. "GK-0", "DEF-1", "B-2"

function slotsFor(f: Formation): Array<{ key: SlotKey; pos: Pos }> {
  return [
    { key: "GK-0", pos: "GK" },
    ...Array.from({ length: f.def }, (_, i) => ({ key: `DEF-${i}`, pos: "DEF" as Pos })),
    ...Array.from({ length: f.mid }, (_, i) => ({ key: `MID-${i}`, pos: "MID" as Pos })),
    ...Array.from({ length: f.att }, (_, i) => ({ key: `ATT-${i}`, pos: "ATT" as Pos })),
  ];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export function SquadBuilder({
  competitionId,
  formations,
  allowedCategories,
  cards,
  initial,
  hasEntry,
}: {
  competitionId: string;
  formations: Formation[];
  allowedCategories: string[];
  cards: BuilderCard[];
  initial: { formation: string; starters: Array<{ cardId: string; position: Pos }>; bench: string[]; captain?: string | null } | null;
  hasEntry: boolean;
}) {
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const [formationId, setFormationId] = useState(initial?.formation ?? formations[0].id);
  const formation = formations.find((f) => f.id === formationId) ?? formations[0];
  const [assign, setAssign] = useState<Record<SlotKey, string>>(() => {
    const a: Record<SlotKey, string> = {};
    if (!initial) return a;
    const counters: Record<Pos, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    for (const s of initial.starters) a[`${s.position}-${counters[s.position]++}`] = s.cardId;
    initial.bench.forEach((id, i) => (a[`B-${i}`] = id));
    return a;
  });
  const [selected, setSelected] = useState<SlotKey | null>(null);
  const [captain, setCaptain] = useState<string | null>(initial?.captain ?? null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);

  const slots = slotsFor(formation);
  const benchSlots = [0, 1, 2, 3].map((i) => `B-${i}`);
  const used = new Set(Object.values(assign));
  const eligible = (c: BuilderCard) => c.available && allowedCategories.includes(c.category);

  function changeFormation(id: string) {
    const f = formations.find((x) => x.id === id)!;
    const keys = new Set([...slotsFor(f).map((s) => s.key), ...benchSlots]);
    setAssign((a) => Object.fromEntries(Object.entries(a).filter(([k]) => keys.has(k))));
    setFormationId(id);
    setSelected(null);
  }

  function place(cardId: string) {
    if (!selected) return;
    setAssign((a) => {
      const next = { ...a };
      for (const [k, v] of Object.entries(next)) if (v === cardId) delete next[k];
      next[selected] = cardId;
      return next;
    });
    // Advance to the next empty slot for fast picking.
    const order = [...slots.map((s) => s.key), ...benchSlots];
    const nextEmpty = order.find((k) => k !== selected && !assign[k]);
    setSelected(nextEmpty ?? null);
  }

  function clear(key: SlotKey) {
    setAssign((a) => {
      const n = { ...a };
      delete n[key];
      return n;
    });
  }

  function moveBench(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j > 3) return;
    setAssign((a) => {
      const n = { ...a };
      const x = n[`B-${i}`];
      const y = n[`B-${j}`];
      if (y) n[`B-${i}`] = y;
      else delete n[`B-${i}`];
      if (x) n[`B-${j}`] = x;
      else delete n[`B-${j}`];
      return n;
    });
  }

  /** Fill empty slots with the best available players by recent form, then MX. */
  function autoPick() {
    const score = (c: BuilderCard) => (avg(c.form) ?? 0) * 10 + (c.valueMp ?? 0);
    const pool = cards.filter(eligible).sort((a, b) => score(b) - score(a));
    setAssign((a) => {
      const n = { ...a };
      const taken = new Set(Object.values(n));
      const players = new Set([...taken].map((id) => byId.get(id)?.playerId));
      for (const s of slots) {
        if (n[s.key]) continue;
        const c = pool.find((p) => p.position === s.pos && !taken.has(p.id) && !players.has(p.playerId));
        if (c) {
          n[s.key] = c.id;
          taken.add(c.id);
          players.add(c.playerId);
        }
      }
      // Bench: try to cover GK first, then best remaining.
      for (const k of benchSlots) {
        if (n[k]) continue;
        const hasGk = benchSlots.some((b) => n[b] && byId.get(n[b])?.position === "GK");
        const c =
          (!hasGk && pool.find((p) => p.position === "GK" && !taken.has(p.id) && !players.has(p.playerId))) ||
          pool.find((p) => !taken.has(p.id) && !players.has(p.playerId));
        if (c) {
          n[k] = c.id;
          taken.add(c.id);
          players.add(c.playerId);
        }
      }
      return n;
    });
  }

  function save() {
    const starters = slots.filter((s) => assign[s.key]).map((s) => ({ cardId: assign[s.key], position: s.pos }));
    const bench = benchSlots.map((k) => assign[k]).filter(Boolean);
    const cap = captain && starters.some((s) => s.cardId === captain) ? captain : undefined;
    start(async () => setResult(await submitEntryAction(competitionId, { formation: formationId, starters, bench, captain: cap })));
  }

  const selectedPos: Pos | null = selected ? (selected.startsWith("B-") ? null : (selected.split("-")[0] as Pos)) : null;
  const picker = cards
    .filter((c) => (selectedPos ? c.position === selectedPos : true))
    .sort((a, b) => Number(eligible(b)) - Number(eligible(a)) || (avg(b.form) ?? -1) - (avg(a.form) ?? -1) || (b.valueMp ?? 0) - (a.valueMp ?? 0));

  const filled = slots.every((s) => assign[s.key]) && benchSlots.every((k) => assign[k]);
  const rows: Pos[] = ["ATT", "MID", "DEF", "GK"];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label mb-0 mr-1">Formation</span>
          {formations.map((f) => (
            <button
              key={f.id}
              onClick={() => changeFormation(f.id)}
              className={`rounded-lg border px-3 py-1 text-sm font-semibold ${
                f.id === formationId ? "border-lime bg-lime/10 text-lime" : "border-ink-600 text-muted hover:text-fg"
              }`}
              title={f.status === "PROPOSED" ? "Proposed formation — not yet approved for every competition" : undefined}
            >
              1-{f.id}
              {f.status === "PROPOSED" && <sup className="ml-0.5 text-[9px] text-warn">β</sup>}
            </button>
          ))}
          <button onClick={autoPick} className="btn-ghost ml-auto px-3 py-1 text-xs">
            Auto-fill
          </button>
          <button onClick={() => setAssign({})} className="btn-ghost px-3 py-1 text-xs">
            Clear
          </button>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-ink-700 bg-[linear-gradient(180deg,#14261a,#0f1d14)] p-4">
          <div className="pointer-events-none absolute inset-4 rounded-xl border border-white/10" />
          <div className="pointer-events-none absolute inset-x-4 top-1/2 border-t border-white/10" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
          <div className="relative flex flex-col gap-5 py-2">
            {rows.map((pos) => (
              <div key={pos} className="flex justify-center gap-3 sm:gap-6">
                {slots
                  .filter((s) => s.pos === pos)
                  .map((s) => (
                    <div key={s.key} className="relative">
                      <PitchSlot
                        label={pos}
                        card={assign[s.key] ? byId.get(assign[s.key]) : undefined}
                        selected={selected === s.key}
                        onSelect={() => setSelected(selected === s.key ? null : s.key)}
                        onClear={() => clear(s.key)}
                      />
                      {assign[s.key] && (
                        <button
                          type="button"
                          onClick={() => setCaptain(captain === assign[s.key] ? null : assign[s.key])}
                          aria-pressed={captain === assign[s.key]}
                          aria-label={captain === assign[s.key] ? "Remove captain" : "Make captain"}
                          title="Captain: double points, up or down"
                          className={`absolute -left-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-extrabold ${
                            captain === assign[s.key] ? "border-accent bg-accent text-accent-ink" : "border-white/30 bg-black/60 text-white/70 hover:text-white"
                          }`}
                        >
                          C
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm text-muted">
          {captain && byId.get(captain) ? (
            <>
              Captain: <b className="text-lime">{byId.get(captain)!.name}</b> — double points, up or down (a red card counts double too).
            </>
          ) : (
            <>Tap <b className="text-fg">C</b> on a starter to make them captain: their points count double, up or down.</>
          )}
        </p>

        <div className="panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">Bench — subs come on in this order</span>
            <span className="text-[11px] text-faint">If a starter doesn&apos;t play, the first compatible sub replaces them</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {benchSlots.map((k, i) => (
              <div key={k} className="flex flex-col items-center gap-1">
                <PitchSlot
                  label={`Sub ${i + 1}`}
                  card={assign[k] ? byId.get(assign[k]) : undefined}
                  selected={selected === k}
                  onSelect={() => setSelected(selected === k ? null : k)}
                  onClear={() => clear(k)}
                />
                <div className="flex gap-1">
                  <button className="rounded px-1.5 text-xs text-faint hover:text-fg disabled:opacity-20" disabled={i === 0} onClick={() => moveBench(i, -1)} aria-label="Move earlier">
                    ◀
                  </button>
                  <button className="rounded px-1.5 text-xs text-faint hover:text-fg disabled:opacity-20" disabled={i === 3} onClick={() => moveBench(i, 1)} aria-label="Move later">
                    ▶
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-3">
          <button className="btn-primary px-6 py-3" onClick={save} disabled={pending || !filled}>
            {pending ? "Saving…" : hasEntry ? "Update squad" : "Enter squad"}
          </button>
          {hasEntry && (
            <button
              className="btn-ghost"
              disabled={pending}
              onClick={() => {
                if (confirm("Withdraw from this competition? Your cards will be unlocked.")) start(async () => setResult(await withdrawEntryAction(competitionId)));
              }}
            >
              Withdraw
            </button>
          )}
          {!filled && <span className="self-center text-xs text-faint">Fill all 7 starters and 4 subs to enter.</span>}
          {result && <ResultText result={result} />}
        </div>
      </div>

      <aside className="panel flex max-h-[760px] flex-col overflow-hidden">
        <div className="border-b border-ink-700 p-3">
          <div className="text-sm font-bold">{selected ? (selectedPos ? `Choose a ${selectedPos}` : `Choose ${selected.replace("B-", "Sub ")}`) : "Your players"}</div>
          <div className="text-[11px] text-faint">{selected ? "Tap a player to place them" : "Tap a pitch or bench slot, then pick a player"}</div>
        </div>
        <ul className="flex-1 divide-y divide-ink-700/60 overflow-y-auto">
          {picker.map((c) => {
            const ok = eligible(c);
            const inUse = used.has(c.id);
            const f = avg(c.form);
            return (
              <li key={c.id}>
                <button
                  disabled={!selected || !ok}
                  onClick={() => place(c.id)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${ok ? "hover:bg-ink-850" : "opacity-40"} ${inUse ? "bg-lime/5" : ""}`}
                >
                  <span className={`w-9 rounded text-center text-[10px] font-black ${tierStyle(c.category).text} bg-ink-800 py-0.5`}>{c.position}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate font-semibold">
                      <CategoryDot category={c.category} /> {c.name}
                      {inUse && <span className="text-[10px] text-lime">✓ picked</span>}
                    </span>
                    <span className="block truncate text-[11px] text-faint">
                      {c.clubShort} · {c.fixture ?? "no fixture"}
                      {c.pointsForYou ? ` · ${c.pointsForYou} pts won for you` : ""}
                      {!ok && ` · ${c.unavailableReason ?? `${c.category.toLowerCase()} not allowed`}`}
                    </span>
                  </span>
                  <span className="text-right text-[11px]">
                    <span className="block font-bold text-lime">{f === null ? "–" : f.toFixed(1)}</span>
                    <span className="block text-faint">{c.loan ? `Loan · ${c.loan.left} of ${c.loan.total} uses` : mpLabel(c.valueMp)}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {!picker.length && <li className="p-4 text-sm text-faint">No players for this position. Open more packs!</li>}
        </ul>
        <div className="border-t border-ink-700 p-2 text-[10px] text-faint">Form = avg points over recent gameweeks</div>
      </aside>
    </div>
  );
}

function PitchSlot({
  label,
  card,
  selected,
  onSelect,
  onClear,
}: {
  label: string;
  card?: BuilderCard;
  selected: boolean;
  onSelect: () => void;
  onClear: () => void;
}) {
  const t = card ? tierStyle(card.category) : null;
  return (
    <div className="relative">
      <button
        onClick={onSelect}
        className={`flex h-20 w-[72px] flex-col items-center justify-center rounded-xl border text-center transition sm:w-24 ${
          selected ? "border-lime bg-lime/15 ring-2 ring-lime/40" : card ? "border-white/15 bg-ink-950/70" : "border-dashed border-white/25 bg-ink-950/30 hover:border-lime/60"
        }`}
      >
        {card ? (
          <>
            <span className={`text-[10px] font-black ${t!.text}`}>{card.position}</span>
            <span className="w-full truncate px-1 text-xs font-bold">{card.lastName}</span>
            <span className="text-[10px] text-faint">{card.fixture ?? card.clubShort}</span>
          </>
        ) : (
          <span className="text-xs text-muted">+ {label}</span>
        )}
      </button>
      {card && (
        <button onClick={onClear} className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-ink-700 text-[10px] text-muted hover:bg-danger hover:text-white" aria-label="Remove">
          ✕
        </button>
      )}
    </div>
  );
}
