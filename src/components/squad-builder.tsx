"use client";

import { useMemo, useState, useTransition } from "react";
import { submitDraftEntryAction, submitEntryAction, withdrawEntryAction } from "@/app/actions/game";
import type { ActionResult } from "@/app/actions/result";
import type { CardView, Pos } from "@/lib/view";
import { leagueShort, mpLabel } from "@/lib/view";
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
  draft,
  boosters,
}: {
  competitionId: string;
  formations: Formation[];
  allowedCategories: string[];
  cards: BuilderCard[];
  initial: { formation: string; starters: Array<{ cardId: string; position: Pos }>; bench: string[]; captain?: string | null; viceCaptain?: string | null; boostedOn?: string | null } | null;
  hasEntry: boolean;
  /** Free draft: the cards are players (id = player id), priced at their MX value, within a budget. */
  draft?: { budgetMx: number; maxPerClub?: number };
  /** Weekly boosters this manager can play here (any match; strictly one per entry). */
  boosters?: { available: Array<{ id: string; name: string; icon: string; description: string; color: string; expires: string; benchOnly: boolean }>; current: string | null };
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
  const [captain, setCaptainRaw] = useState<string | null>(initial?.captain ?? null);
  const [boosterId, setBoosterId] = useState<string | null>(boosters?.current ?? null);
  const [boostedOn, setBoostedOn] = useState<string | null>(initial?.boostedOn ?? null);
  // Booster placement: tap "Use", then tap the player on the pitch (or a sub, for Super Sub).
  const [boostMode, setBoostMode] = useState(false);
  const booster = boosters?.available.find((b) => b.id === boosterId) ?? null;
  const [vice, setViceRaw] = useState<string | null>(initial?.viceCaptain ?? null);
  // One player can't hold both armbands: picking one clears the other.
  const setCaptain = (id: string | null) => {
    setCaptainRaw(id);
    if (id && id === vice) setViceRaw(null);
  };
  const setVice = (id: string | null) => {
    setViceRaw(id);
    if (id && id === captain) setCaptainRaw(null);
  };
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);

  const slots = slotsFor(formation);
  const benchSlots = [0, 1, 2, 3].map((i) => `B-${i}`);
  const used = new Set(Object.values(assign));
  // Who can carry the chosen booster: subs for Super Sub, the starting seven for the rest.
  const boostTargets = booster ? (booster.benchOnly ? benchSlots : slots.map((s) => s.key)).map((k) => assign[k]).filter(Boolean) : [];
  const boostTarget = boostedOn && boostTargets.includes(boostedOn) ? boostedOn : null;
  const tapSlot = (key: SlotKey) => {
    if (boostMode && booster) {
      const id = assign[key];
      if (id && boostTargets.includes(id)) {
        setBoostedOn(id);
        setBoostMode(false);
      }
      return;
    }
    setSelected(selected === key ? null : key);
  };
  const canBoost = (key: SlotKey) => boostMode && !!booster && !!assign[key] && boostTargets.includes(assign[key]);
  const [search, setSearch] = useState("");
  const price = (c: BuilderCard | undefined) => Math.max(1, c?.valueMp ?? 1);
  const spent = draft ? [...used].reduce((n, id) => n + price(byId.get(id)), 0) : 0;
  const clubCount = (code: string | null) => [...used].filter((id) => byId.get(id)?.clubCode === code).length;
  const fitsDraft = (c: BuilderCard) => {
    if (!draft || used.has(c.id)) return true;
    const replacing = selected && assign[selected] ? price(byId.get(assign[selected])) : 0;
    const sameClubOut = selected && assign[selected] && byId.get(assign[selected])?.clubCode === c.clubCode ? 1 : 0;
    return spent - replacing + price(c) <= draft.budgetMx && (!draft.maxPerClub || clubCount(c.clubCode) - sameClubOut < draft.maxPerClub);
  };
  const eligible = (c: BuilderCard) => c.available && allowedCategories.includes(c.category) && fitsDraft(c);

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
    const pool = cards.filter((c) => c.available && allowedCategories.includes(c.category)).sort((a, b) => score(b) - score(a));
    setAssign((a) => {
      const n = { ...a };
      const taken = new Set(Object.values(n));
      const players = new Set([...taken].map((id) => byId.get(id)?.playerId));
      // Draft: leave enough budget to fill every remaining slot with the cheapest players.
      const cheapest = draft ? Math.min(...pool.map(price)) : 0;
      let budgetLeft = draft ? draft.budgetMx - [...taken].reduce((x, id) => x + price(byId.get(id)), 0) : Infinity;
      const empties = () => [...slots.map((x) => x.key), ...benchSlots].filter((k) => !n[k]).length;
      const clubs = new Map<string | null, number>();
      for (const id of taken) clubs.set(byId.get(id)?.clubCode ?? null, (clubs.get(byId.get(id)?.clubCode ?? null) ?? 0) + 1);
      const affordable = (p: BuilderCard) =>
        !draft || (price(p) + cheapest * (empties() - 1) <= budgetLeft && (!draft.maxPerClub || (clubs.get(p.clubCode) ?? 0) < draft.maxPerClub));
      const take = (k: string, c: BuilderCard) => {
        n[k] = c.id;
        taken.add(c.id);
        players.add(c.playerId);
        budgetLeft -= draft ? price(c) : 0;
        clubs.set(c.clubCode, (clubs.get(c.clubCode) ?? 0) + 1);
      };
      for (const s of slots) {
        if (n[s.key]) continue;
        const c = pool.find((p) => p.position === s.pos && !taken.has(p.id) && !players.has(p.playerId) && affordable(p));
        if (c) take(s.key, c);
      }
      // Bench: try to cover GK first, then best remaining.
      for (const k of benchSlots) {
        if (n[k]) continue;
        const hasGk = benchSlots.some((b) => n[b] && byId.get(n[b])?.position === "GK");
        const c =
          (!hasGk && pool.find((p) => p.position === "GK" && !taken.has(p.id) && !players.has(p.playerId) && affordable(p))) ||
          pool.find((p) => !taken.has(p.id) && !players.has(p.playerId) && affordable(p));
        if (c) take(k, c);
      }
      return n;
    });
  }

  function save() {
    const starters = slots.filter((s) => assign[s.key]).map((s) => ({ cardId: assign[s.key], position: s.pos }));
    const bench = benchSlots.map((k) => assign[k]).filter(Boolean);
    const cap = captain && starters.some((s) => s.cardId === captain) ? captain : undefined;
    const vc = vice && vice !== cap && starters.some((s) => s.cardId === vice) ? vice : undefined;
    start(async () =>
      setResult(
        draft
          ? await submitDraftEntryAction(competitionId, { formation: formationId, starters: starters.map((x) => ({ playerId: x.cardId, position: x.position })), bench, captain: cap, viceCaptain: vc, boosterId, boostedOn: boosterId ? boostTarget : null })
          : await submitEntryAction(competitionId, { formation: formationId, starters, bench, captain: cap, viceCaptain: vc, boosterId, boostedOn: boosterId ? boostTarget : null }),
      ),
    );
  }

  const selectedPos: Pos | null = selected ? (selected.startsWith("B-") ? null : (selected.split("-")[0] as Pos)) : null;
  const q = search.trim().toLowerCase();
  const picker = cards
    .filter((c) => (selectedPos ? c.position === selectedPos : true))
    .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.clubName ?? "").toLowerCase().includes(q) || (c.clubShort ?? "").toLowerCase() === q)
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
                        onSelect={() => tapSlot(s.key)}
                        target={canBoost(s.key) ? booster!.color : undefined}
                        onClear={() => clear(s.key)}
                        boost={booster && boostTarget && assign[s.key] === boostTarget ? booster : undefined}
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
                      {assign[s.key] && (
                        <button
                          type="button"
                          onClick={() => setVice(vice === assign[s.key] ? null : assign[s.key])}
                          aria-pressed={vice === assign[s.key]}
                          aria-label={vice === assign[s.key] ? "Remove vice-captain" : "Make vice-captain"}
                          title="Vice-captain: doubles instead if your captain doesn't play"
                          className={`absolute -bottom-2 -left-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-extrabold ${
                            vice === assign[s.key] ? "border-white bg-white text-black" : "border-white/30 bg-black/60 text-white/70 hover:text-white"
                          }`}
                        >
                          V
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
          )}{" "}
          {vice && byId.get(vice) ? (
            <>
              Vice-captain: <b className="text-fg">{byId.get(vice)!.name}</b> — takes the double if your captain doesn&apos;t play.
            </>
          ) : (
            <>Tap <b className="text-fg">V</b> to pick a vice-captain, who doubles if your captain doesn&apos;t play.</>
          )}
        </p>

        <div className="panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">Bench — subs come on in this order</span>
            <span className="text-[11px] text-faint">If a starter doesn&apos;t play, the first compatible sub replaces them</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {benchSlots.map((k, i) => (
              <div key={k} className="relative flex flex-col items-center gap-1">
                <PitchSlot
                  label={`Sub ${i + 1}`}
                  card={assign[k] ? byId.get(assign[k]) : undefined}
                  selected={selected === k}
                  onSelect={() => tapSlot(k)}
                  target={canBoost(k) ? booster!.color : undefined}
                  onClear={() => clear(k)}
                  boost={booster && boostTarget && assign[k] === boostTarget ? booster : undefined}
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

        {boosters && boosters.available.length > 0 && (
          <div className="panel space-y-2 p-4">
            <p className="text-sm font-bold">
              Booster <span className="font-normal text-faint">· one per match</span>
            </p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Booster">
                <button type="button" role="radio" aria-checked={!boosterId} onClick={() => { setBoosterId(null); setBoostMode(false); }} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${!boosterId ? "border-lime bg-accent/10" : "border-ink-700 text-muted"}`}>
                  None
                </button>
                {boosters.available.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    role="radio"
                    aria-checked={boosterId === b.id}
                    title={b.description}
                    onClick={() => { setBoosterId(b.id); setBoostMode(true); }}
                    style={{ borderColor: b.color, borderWidth: boosterId === b.id ? 2 : 1 }}
                    className={`rounded-xl border px-3 py-2 text-left text-xs ${boosterId === b.id ? "bg-white/5" : "text-muted opacity-80"}`}
                  >
                    <span className="font-semibold text-fg">
                      {b.icon} {b.name}
                    </span>
                    <span className="block text-[10px] text-faint">expires {b.expires}</span>
                  </button>
                ))}
            </div>
            {booster && (
              <div className="space-y-2">
                <p className="text-xs text-muted">{booster.description}</p>
                <p className="text-xs font-semibold">
                  {booster.icon} It goes on {booster.benchOnly ? "one of your subs" : "one of your starting seven"}.
                </p>
                {boostTargets.length === 0 ? (
                  <p className="text-xs text-faint">Pick your {booster.benchOnly ? "subs" : "starters"} first.</p>
                ) : boostMode ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-bold" style={{ color: booster.color }}>
                      Tap {booster.benchOnly ? "one of your subs" : "a player on the pitch"} to put {booster.name} on them.
                    </p>
                    <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setBoostMode(false)}>
                      Cancel
                    </button>
                  </div>
                ) : boostTarget ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span>
                      On <b>{byId.get(boostTarget)?.name}</b>.
                    </span>
                    <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setBoostMode(true)}>
                      Change player
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn-primary px-4 py-2 text-xs" onClick={() => setBoostMode(true)}>
                    Use {booster.name} — tap a player
                  </button>
                )}
                {!boostTarget && boostTargets.length > 0 && <p className="text-xs text-warn">Choose a player to carry your booster.</p>}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-start gap-3">
          <button className="btn-primary px-6 py-3" onClick={save} disabled={pending || !filled || (!!booster && !boostTarget)}>
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
          <div className="text-sm font-bold">{selected ? (selectedPos ? `Choose a ${selectedPos}` : `Choose ${selected.replace("B-", "Sub ")}`) : draft ? "Players" : "Your players"}</div>
          <div className="text-[11px] text-faint">{selected ? "Tap a player to place them" : "Tap a pitch or bench slot, then pick a player"}</div>
          {draft && (
            <div className="mt-2">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold">Budget</span>
                <span className={spent > draft.budgetMx ? "font-bold text-danger" : "text-muted"}>
                  {spent} / {draft.budgetMx} MX · {draft.budgetMx - spent} left
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-800">
                <div className={`h-full ${spent > draft.budgetMx ? "bg-danger" : "bg-accent"}`} style={{ width: `${Math.min(100, (spent / draft.budgetMx) * 100)}%` }} />
              </div>
            </div>
          )}
          {(draft || cards.length > 30) && (
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search player or club" className="input mt-2 py-2 text-sm" aria-label="Search players" />
          )}
        </div>
        <ul className="flex-1 divide-y divide-ink-700/60 overflow-y-auto">
          {picker.slice(0, draft ? 150 : undefined).map((c) => {
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
                      {c.clubShort} · {c.leagueName ?? "no league"} · {c.fixture ?? "no fixture"}
                      {c.pointsForYou ? ` · ${c.pointsForYou} pts won for you` : ""}
                      {!ok && ` · ${!fitsDraft(c) ? "over budget or club limit" : (c.unavailableReason ?? `${c.category.toLowerCase()} not allowed`)}`}
                    </span>
                  </span>
                  <span className="text-right text-[11px]">
                    <span className="block font-bold text-lime">{f === null ? "–" : f.toFixed(1)}</span>
                    <span className="block text-faint">{draft ? `${price(c)} MX` : c.loan ? `Loan · ${c.loan.left} of ${c.loan.total} uses` : mpLabel(c.valueMp)}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {!picker.length && <li className="p-4 text-sm text-faint">{draft || q ? "No players match." : "No players for this position. Open more packs!"}</li>}
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
  boost,
  target,
}: {
  label: string;
  card?: BuilderCard;
  selected: boolean;
  onSelect: () => void;
  onClear: () => void;
  /** The booster on this player: the card takes the booster's colour as its border. */
  boost?: { name: string; color: string };
  /** While placing a booster: this player can take it (pulses in the booster's colour). */
  target?: string;
}) {
  const t = card ? tierStyle(card.category) : null;
  const boostStyle = boost && card && !selected ? { borderColor: boost.color, borderWidth: 3, boxShadow: `0 0 14px ${boost.color}66` } : undefined;
  return (
    <div className="relative">
      <button
        onClick={onSelect}
        style={target ? ({ ...boostStyle, "--boost": target } as React.CSSProperties) : boostStyle}
        title={boost && card ? `${boost.name} booster` : undefined}
        className={`${target ? "boost-target " : ""}flex h-20 w-[72px] flex-col items-center justify-center rounded-xl border text-center transition sm:w-24 ${
          selected ? "border-lime bg-lime/15 ring-2 ring-lime/40" : card ? "border-white/15 bg-ink-950/70" : "border-dashed border-white/25 bg-ink-950/30 hover:border-lime/60"
        }`}
      >
        {card ? (
          <>
            <span className={`text-[10px] font-black ${t!.text}`}>{card.position}</span>
            <span className="w-full truncate px-1 text-xs font-bold">{card.lastName}</span>
            <span className="text-[10px] text-faint">
              <b className="font-bold">{leagueShort(card.leagueName)}</b> · {card.fixture ?? card.clubShort}
            </span>
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
