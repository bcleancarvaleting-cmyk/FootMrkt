"use client";

import { useActionState } from "react";
import { addWelcomeGiftAction, competitionRulesAction, createAuctionAction, createChallengeAction, scheduleDropAction, stockHouseAction } from "@/app/actions/economy";
import type { ActionResult } from "@/app/actions/result";
import { ResultText } from "./action-button";

function Form({ action, children, submit }: { action: (s: ActionResult | null, f: FormData) => Promise<ActionResult>; children: React.ReactNode; submit: string }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      <div className="flex items-center gap-3">
        <button className="btn-primary px-4 py-2 text-xs" disabled={pending}>{pending ? "Saving…" : submit}</button>
        {state && <ResultText result={state} />}
      </div>
    </form>
  );
}

function I({ name, label, ...rest }: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="label" htmlFor={`f-${name}`}>{label}</label>
      <input id={`f-${name}`} name={name} className="input" {...rest} />
    </div>
  );
}

const localNow = () => {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

export function DropForm() {
  return (
    <Form action={scheduleDropAction} submit="Schedule drop">
      <I name="title" label="Banner title" placeholder="Matchday freebie" required />
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
      <I name="start" label="Start price (MP)" type="number" step="0.01" min="0.10" max="100" defaultValue="1.00" required />
      <I name="increment" label="Min raise (MP)" type="number" step="0.01" min="0.01" defaultValue="0.10" />
      <I name="reserve" label="Reserve (MP, optional)" type="number" step="0.01" min="0" max="100" />
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
      <I name="description" label="Description" placeholder="Hand in 2 goalkeepers for 1 MP" required />
      <I name="count" label="Cards to hand in" type="number" min="1" max="11" defaultValue="3" required />
      <I name="tiers" label="Tiers (comma list)" placeholder="BRONZE,SILVER" />
      <I name="positions" label="Positions" placeholder="GK,DEF" />
      <I name="leagues" label="Leagues" placeholder="EPL,CHA,LG1,LG2,NL" />
      <I name="maxPerClub" label="Max per club" type="number" min="1" />
      <I name="reward" label="Reward (MP)" type="number" step="0.01" min="0" max="100" defaultValue="1.00" />
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
        <input type="checkbox" name="includeUntradeable" className="accent-lime" /> Allow free/starter cards (they&apos;re retired, not recycled)
      </label>
    </Form>
  );
}

export function MatchRulesForm({ id, fee, req, prizes }: { id: string; fee: number; req: { tiers?: string[]; leagues?: string[]; maxPerClub?: number; maxSquadValueMp?: number }; prizes: string }) {
  return (
    <Form action={competitionRulesAction} submit="Save">
      <input type="hidden" name="competitionId" value={id} />
      <I name="fee" label="Entry fee (MP)" type="number" step="0.01" min="0" max="100" defaultValue={(fee / 100).toFixed(2)} />
      <I name="tiers" label="Tiers only" placeholder="BRONZE" defaultValue={req.tiers?.join(",")} />
      <I name="leagues" label="Leagues only" placeholder="EPL" defaultValue={req.leagues?.join(",")} />
      <I name="maxPerClub" label="Max per club" type="number" min="1" defaultValue={req.maxPerClub} />
      <I name="maxValue" label="Max starters value (MP)" type="number" min="1" defaultValue={req.maxSquadValueMp} />
      <I name="prizes" label="£ prizes (e.g. 1=10, 2-3=5)" placeholder="1=10, 2-3=5" defaultValue={prizes} />
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
      <I name="price" label="Fixed price (MP, blank = recommended)" type="number" step="0.01" min="0.10" max="100" />
      <I name="markup" label="Markup on recommended (%)" type="number" min="-50" max="200" defaultValue="0" />
      <I name="days" label="Listed for (days)" type="number" min="1" max="30" defaultValue="7" />
      <I name="leagues" label="Leagues only (optional)" placeholder="EPL,CHA" />
    </Form>
  );
}
