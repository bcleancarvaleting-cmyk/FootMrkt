"use client";

import { useActionState, useState } from "react";
import { appGiveawayAction, setSettingAction, setTextSettingAction, addWelcomeGiftAction, competitionRulesAction, createAuctionAction, createMatchAction, createChallengeAction, pinnedListingsAction, scheduleDropAction, stockHouseAction } from "@/app/actions/economy";
import { createSimMatchdayAction } from "@/app/actions/admin";
import type { ActionResult } from "@/app/actions/result";
import { ResultText } from "./action-button";

function Form({ action, children, submit }: { action: (s: ActionResult | null, f: FormData) => Promise<ActionResult>; children: React.ReactNode; submit: string }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      <div className="flex items-center gap-3">
        <button className="btn-primary px-4 py-2 text-xs" disabled={pending}>{pending ? "Saving…" : submit}</button>
        {state && <ResultText result={state} />}
      </div>
    </form>
  );
}

function I({ name, label, ...rest }: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="min-w-0">
      <label className="label" htmlFor={`f-${name}`}>{label}</label>
      <input id={`f-${name}`} name={name} className="input min-w-0 max-w-full" {...rest} />
    </div>
  );
}

const localNow = () => {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

export function DropForm({ packs }: { packs: Array<{ code: string; name: string }> }) {
  return (
    <Form action={scheduleDropAction} submit="Schedule gift">
      <I name="title" label="Banner title" placeholder="Happy Christmas from MATCHX" required />
      <div>
        <label className="label" htmlFor="f-gift">Gift</label>
        <select id="f-gift" name="gift" className="input" defaultValue="PACK:football-gold-pick">
          <optgroup label="Pick a player (choose 1 of 3)">
            {packs.filter((p) => p.code.endsWith("-pick")).map((p) => (
              <option key={p.code} value={`PACK:${p.code}`}>{p.name}</option>
            ))}
          </optgroup>
          <optgroup label="Packs">
            {packs.filter((p) => !p.code.endsWith("-pick")).map((p) => (
              <option key={p.code} value={`PACK:${p.code}`}>{p.name}</option>
            ))}
          </optgroup>
          <optgroup label="Credit">
            <option value="XP">XP credit</option>
            <option value="MX">Earned credit credit</option>
          </optgroup>
        </select>
      </div>
      <I name="amount" label="Amount (for XP or £ credit)" type="number" min="1" step="0.01" placeholder="e.g. 500 XP or £2.00" />
      <I name="startsAt" label="Goes live" type="datetime-local" defaultValue={localNow()} required />
      <I name="hours" label="Hours open" type="number" min="1" max="72" defaultValue="24" />
    </Form>
  );
}

export function AuctionForm() {
  return (
    <Form action={createAuctionAction} submit="Start auction">
      <I name="player" label="Player name" placeholder="e.g. Saka" required />
      <div>
        <label className="label" htmlFor="f-category">Tier</label>
        <select id="f-category" name="category" className="input" defaultValue="GOLD">
          <option>GOLD</option>
          <option>SILVER</option>
          <option>BRONZE</option>
        </select>
      </div>
      <I name="start" label="Start price (£)" type="number" step="0.01" min="0.10" max="100" defaultValue="1.00" required />
      <I name="increment" label="Min raise (£)" type="number" step="0.01" min="0.01" defaultValue="0.10" />
      <I name="reserve" label="Reserve (£, optional)" type="number" step="0.01" min="0" max="100" />
      <I name="startsAt" label="Starts (blank = now)" type="datetime-local" />
      <I name="hours" label="Duration (hours)" type="number" min="1" max="168" defaultValue="24" />
    </Form>
  );
}

export function ChallengeForm({ packs }: { packs: Array<{ code: string; name: string }> }) {
  return (
    <Form action={createChallengeAction} submit="Create challenge">
      <I name="code" label="Code" placeholder="weekend-keepers" required />
      <I name="name" label="Name" placeholder="Safe hands" required />
      <I name="description" label="Description" placeholder="Hand in 2 goalkeepers for £1" required />
      <I name="count" label="Cards to hand in" type="number" min="1" max="11" defaultValue="3" required />
      <I name="tiers" label="Tiers (comma list)" placeholder="BRONZE,SILVER" />
      <I name="positions" label="Positions" placeholder="GK,DEF" />
      <I name="leagues" label="Leagues" placeholder="EPL,CHA,LG1,LG2" />
      <I name="maxPerClub" label="Max per club" type="number" min="1" />
      <I name="reward" label="Reward (£)" type="number" step="0.01" min="0" max="100" defaultValue="1.00" />
      <div>
        <label className="label" htmlFor="f-pack">Reward pack</label>
        <select id="f-pack" name="pack" className="input" defaultValue="">
          <option value="">None</option>
          {packs.map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
      </div>
      <I name="maxPerUser" label="Max per manager" type="number" min="1" />
      <I name="endsAt" label="Ends (optional)" type="datetime-local" />
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="excludeFree" className="accent-lime" /> Exclude free/starter cards (untradeable cards count by default; free ones are retired when handed in)
      </label>
    </Form>
  );
}

type Opt = { value: string; label: string };
/** A labelled drop-down. */
function S({ name, label, options, defaultValue }: { name: string; label: string; options: Opt[]; defaultValue?: string }) {
  return (
    <div className="min-w-0">
      <label className="label" htmlFor={`f-${name}`}>{label}</label>
      <select id={`f-${name}`} name={name} className="input" defaultValue={defaultValue ?? ""}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
const TIERS: Opt[] = [{ value: "", label: "Any tier" }, { value: "BRONZE", label: "Bronze only" }, { value: "SILVER", label: "Silver only" }, { value: "GOLD", label: "Gold only" }];
const PER_CLUB: Opt[] = [{ value: "", label: "No limit" }, ...[1, 2, 3, 4].map((n) => ({ value: String(n), label: `Max ${n} per club` }))];
const PACK: Opt[] = [{ value: "", label: "None" }, { value: "BRONZE", label: "Bronze Pack" }, { value: "SILVER", label: "Silver Pack" }, { value: "GOLD", label: "Gold Pack" }];

/** Admin: add an extra match to an open gameweek, set up with drop-downs. */
type FixtureOpt = { value: string; label: string; league: string };
/** Tick the real fixtures a match covers, grouped by league, with a tick-all per league. */
function FixturePicker({ fixtures }: { fixtures: FixtureOpt[] }) {
  const [on, setOn] = useState<Set<string>>(new Set());
  const leagues = [...new Set(fixtures.map((f) => f.league))];
  const toggle = (ids: string[], value: boolean) =>
    setOn((s) => {
      const n = new Set(s);
      ids.forEach((id) => (value ? n.add(id) : n.delete(id)));
      return n;
    });
  return (
    <fieldset className="min-w-0 sm:col-span-2 lg:col-span-4">
      <legend className="label">Fixtures this match covers (optional — none ticked = every fixture that gameweek)</legend>
      <p className="mb-2 text-xs text-faint">Only players from clubs in the ticked fixtures can be picked, and squads lock 10 minutes before the first of them kicks off. Tick one for a head to head, a whole league for an international-break week, or a few for a midweek match.</p>
      <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-ink-700 p-3">
        {leagues.map((lg) => {
          const ids = fixtures.filter((f) => f.league === lg).map((f) => f.value);
          const all = ids.every((id) => on.has(id));
          return (
            <div key={lg}>
              <label className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">
                <input type="checkbox" className="accent-lime" checked={all} onChange={(e) => toggle(ids, e.target.checked)} /> {lg} — all {ids.length}
              </label>
              <div className="grid gap-1 pl-5 sm:grid-cols-2">
                {fixtures
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
        {!fixtures.length && <p className="text-sm text-faint">No upcoming fixtures in an open gameweek.</p>}
      </div>
    </fieldset>
  );
}

export function CreateMatchForm({ gameweeks, leagues, fixtures }: { gameweeks: Opt[]; leagues: Opt[]; fixtures: FixtureOpt[] }) {
  return (
    <Form action={createMatchAction} submit="Create match">
      <I name="name" label="Match title" placeholder="League Two Cup" required minLength={3} maxLength={40} />
      <S name="gameweekId" label="Gameweek" options={gameweeks} defaultValue={gameweeks[0]?.value} />
      <S name="kind" label="Type" options={[{ value: "CARDS", label: "Managers use their own cards" }, { value: "DRAFT", label: "Free draft (no cards needed)" }]} />
      <fieldset className="min-w-0">
        <legend className="label">Leagues</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
          {leagues.map((l) => (
            <label key={l.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="leagues" value={l.value} className="h-4 w-4 accent-lime" />
              {l.label}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-faint">Tick any mix, e.g. Premier League + League Two. None ticked = every league, so a League Two squad can take on a Premier League one.</p>
      </fieldset>
      <S name="tier" label="Card tier" options={TIERS} />
      <S name="cards" label="Which cards" options={[{ value: "ANY", label: "Any cards" }, { value: "FREE", label: "Free cards only (needed for £ prizes)" }]} />
      <S name="who" label="Who can enter" options={[{ value: "ALL", label: "Everyone" }, { value: "FOUNDERS", label: "Founding members only" }]} />
      <S name="maxPerClub" label="Players per club" options={PER_CLUB} />
      <S name="budget" label="Free draft budget" options={[{ value: "", label: "Not a draft" }, ...[50, 70, 100, 150].map((n) => ({ value: String(n), label: `£${n}` }))]} />
      <S name="fee" label="Entry" options={[{ value: "0", label: "Free" }, ...[0.5, 1, 2, 5].map((n) => ({ value: String(n), label: `£${n.toFixed(2)}` }))]} />
      <S name="winnerPack" label="Winner's pack" options={PACK} />
      <S name="top3Pack" label={"Top 3's pack"} options={PACK} />
      <S name="everyonePack" label="Everyone else's pack" options={PACK} />
      <I name="prizes" label="Total £ pot (optional) — winner takes it, ties split it" placeholder="e.g. 20" />
      <FixturePicker fixtures={fixtures} />
    </Form>
  );
}

export function MatchRulesForm({ id, fee, req, prizes, leagues }: { id: string; fee: number; req: { tiers?: string[]; leagues?: string[]; maxPerClub?: number; maxSquadValueMp?: number; foundersOnly?: boolean; freeCardsOnly?: boolean; clubs?: string[] }; prizes: string; leagues: Opt[] }) {
  return (
    <Form action={competitionRulesAction} submit="Save">
      <input type="hidden" name="competitionId" value={id} />
      <I name="fee" label="Entry fee (£)" type="number" step="0.01" min="0" max="100" defaultValue={(fee / 100).toFixed(2)} />
      <S name="tiers" label="Card tier" options={TIERS} defaultValue={req.tiers?.length === 1 ? req.tiers[0] : ""} />
      <S name="leagues" label="League" options={[{ value: "", label: "All leagues" }, ...leagues]} defaultValue={req.leagues?.length === 1 ? req.leagues[0] : ""} />
      <I name="clubs" label="Clubs only (e.g. CHE,MUN)" placeholder="CHE,MUN" defaultValue={req.clubs?.join(",")} />
      <S name="maxPerClub" label="Players per club" options={PER_CLUB} defaultValue={req.maxPerClub ? String(req.maxPerClub) : ""} />
      <I name="maxValue" label="Max starters value (£)" type="number" min="1" defaultValue={req.maxSquadValueMp} />
      <I name="prizes" label="Total £ pot — winner takes it, ties split it" placeholder="e.g. 20" defaultValue={prizes} />
      <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
        <input type="checkbox" name="freeCardsOnly" defaultChecked={req.freeCardsOnly} className="accent-lime" /> Free cards only
      </label>
      <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
        <input type="checkbox" name="foundersOnly" defaultChecked={req.foundersOnly} className="accent-lime" /> Founding members only
      </label>
    </Form>
  );
}

export function WelcomeGiftForm({ packs }: { packs: Array<{ code: string; name: string }> }) {
  return (
    <Form action={addWelcomeGiftAction} submit="Add gift">
      <div>
        <label className="label" htmlFor="f-skuCode">Free pack</label>
        <select id="f-skuCode" name="skuCode" className="input">
          {packs.map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
      </div>
      <I name="afterDays" label="Days after registering" type="number" min="0" max="365" defaultValue="3" required />
    </Form>
  );
}

export function HouseStockForm() {
  return (
    <Form action={stockHouseAction} submit="List cards">
      <div>
        <label className="label" htmlFor="f-tier">Tier</label>
        <select id="f-tier" name="tier" className="input" defaultValue="BRONZE">
          <option>BRONZE</option>
          <option>SILVER</option>
          <option>GOLD</option>
        </select>
      </div>
      <I name="count" label="How many cards" type="number" min="1" max="200" defaultValue="20" required />
      <I name="min" label="Price range: min (£)" type="number" step="0.01" min="0.10" max="100" placeholder="1.00" />
      <I name="max" label="Price range: max (£)" type="number" step="0.01" min="0.10" max="100" placeholder="4.99" />
      <I name="price" label="…or one fixed price (£)" type="number" step="0.01" min="0.10" max="100" />
      <I name="markup" label="…or recommended + markup (%)" type="number" min="-50" max="200" defaultValue="0" />
      <I name="days" label="Listed for (days)" type="number" min="1" max="30" defaultValue="7" />
      <I name="leagues" label="Leagues only (optional)" placeholder="EPL,CHA" />
    </Form>
  );
}

export function PinnedListingsForm() {
  return (
    <Form action={pinnedListingsAction} submit="List these players">
      <div className="sm:col-span-2 lg:col-span-3">
        <label className="label" htmlFor="f-pinned">Players at set prices (one per line or comma-separated)</label>
        <textarea id="f-pinned" name="pinned" rows={3} className="input" placeholder={"Haaland=45\nSalah=40"} required />
      </div>
      <I name="days" label="Listed for (days)" type="number" min="1" max="30" defaultValue="14" />
    </Form>
  );
}

export function SettingForm({ settingKey, label, help, value, min, max, choices }: { settingKey: string; label: string; help: string; value: number; min: number; max: number; choices?: Array<{ value: number; label: string }> }) {
  const [state, run, pending] = useActionState(setSettingAction, null);
  return (
    <form action={run} className="flex flex-wrap items-end gap-3 border-t border-ink-700 pt-4 first:border-0 first:pt-0">
      <input type="hidden" name="key" value={settingKey} />
      <div className="min-w-0 flex-1 basis-64">
        <label className="label" htmlFor={`s-${settingKey}`}>{label}</label>
        <p className="mb-2 text-xs text-faint">{help}</p>
        {choices ? (
          <select id={`s-${settingKey}`} name="value" defaultValue={String(value)} className="input max-w-md">
            {choices.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        ) : (
          <input id={`s-${settingKey}`} name="value" type="number" min={min} max={max} defaultValue={value} className="input max-w-[180px] tabular-nums" />
        )}
      </div>
      <button className="btn-primary px-4 py-2 text-xs" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      {state && <ResultText result={state} />}
    </form>
  );
}

export function TextSettingForm({ settingKey, label, help, value, options, placeholder }: { settingKey: string; label: string; help: string; value: string; options?: Array<{ code: string; name: string }>; placeholder?: string }) {
  const [state, run, pending] = useActionState(setTextSettingAction, null);
  return (
    <form action={run} className="flex flex-wrap items-end gap-3 border-t border-ink-700 pt-4">
      <input type="hidden" name="key" value={settingKey} />
      <div className="min-w-0 flex-1 basis-64">
        <label className="label" htmlFor={`t-${settingKey}`}>{label}</label>
        <p className="mb-2 text-xs text-faint">{help}</p>
        {options ? (
          <select id={`t-${settingKey}`} name="value" defaultValue={value} className="input max-w-sm">
            {options.map((o) => (
              <option key={o.code} value={o.code}>{o.name}</option>
            ))}
          </select>
        ) : (
          <input id={`t-${settingKey}`} name="value" defaultValue={value} className="input max-w-md" placeholder={placeholder ?? "https://www.facebook.com/groups/…"} />
        )}
      </div>
      <button className="btn-primary px-4 py-2 text-xs" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      {state && <ResultText result={state} />}
    </form>
  );
}

/** Generic admin form + input, for pages that bring their own server action. */
export const AdminForm = Form;
export const AdminInput = I;

export function AppGiveawayForm({ packs }: { packs: Array<{ code: string; name: string }> }) {
  return (
    <Form action={appGiveawayAction} submit="Send giveaway">
      <I name="title" label="Title (shown in the notification)" maxLength={60} placeholder="App users' weekend treat" required />
      <I name="message" label="Message" maxLength={200} placeholder="Thanks for installing MATCHX — here's a free pack on us." required />
      <div>
        <label className="label" htmlFor="f-packSku">Free pack (optional)</label>
        <select id="f-packSku" name="packSku" className="input" defaultValue="">
          <option value="">No pack</option>
          {packs.map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
      </div>
      <I name="mx" label="Credit in £ (optional)" type="number" step="0.01" min="0" max="100" placeholder="0.00" />
      <I name="openDays" label="Keep open for new installs (days, 0 = current app users only)" type="number" min="0" max="60" defaultValue="0" />
    </Form>
  );
}

/** Simulated matchday: kick-off time (UK) and whether to copy the last sim day's matches. */
export function SimMatchdayForm({ suggested, canCopy }: { suggested: string; canCopy: boolean }) {
  return (
    <Form action={createSimMatchdayAction} submit="Create simulated matchday">
      <I name="kickoffAt" label="Kick-off (UK time)" type="datetime-local" defaultValue={suggested} required />
      <I name="name" label="Match name (players enter this)" placeholder="e.g. Sim Night Cup" maxLength={40} />
      <S name="tier" label="Cards" options={[{ value: "", label: "Any cards" }, ...TIERS.slice(1)]} />
      <I name="fee" label="Entry fee (£, 0 = free)" type="number" min={0} step="0.01" defaultValue="0" />
      <I name="prizes" label="Total £ pot — winner takes it, ties split it" placeholder="e.g. 20" />
      <S name="winnerPack" label="Winner's pack" options={PACK} />
      <div className="flex flex-col justify-end gap-2 pb-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="freeOnly" /> Free cards only
        </label>
        {canCopy && (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="copy" /> Also copy the last sim day&apos;s matches
          </label>
        )}
      </div>
    </Form>
  );
}
