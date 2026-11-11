"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { claimDropAction } from "@/app/actions/account";
import { buyPackAction, buyPackWithCreditAction, buyPackWithXpAction, claimDevPackAction, openPackAction } from "@/app/actions/game";
import { ResultText } from "./action-button";
import type { ActionResult } from "@/app/actions/result";

export function OpenPackButton({ entitlementId, label = "Open pack" }: { entitlementId: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult<unknown> | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className="btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await openPackAction(entitlementId);
            if (r.ok) router.push(`/packs/opening/${r.data.openingId}`);
            else setRes(r);
          })
        }
      >
        {pending ? "Opening…" : label}
      </button>
      {res && <ResultText result={res} />}
    </span>
  );
}

export function DevPackButton({ skuCode }: { skuCode: string }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult<unknown> | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button className="btn-ghost border-dashed text-xs" disabled={pending} onClick={() => start(async () => setRes(await claimDevPackAction(skuCode)))}>
        {pending ? "…" : "DEV: claim free"}
      </button>
      {res && <ResultText result={res} />}
    </span>
  );
}

/** The pay-by-card button takes the pack's colour: bronze, silver, gold, or diamond sparkle for Rare. */
const PACK_BTN = (code: string) =>
  code.includes("rare") ? "btn-diamond" : code.includes("gold") ? "btn-gold" : code.includes("silver") ? "btn-silver" : code.includes("bronze") ? "btn-bronze" : "btn-primary";

export function BuyPackButton({ skuCode, price, enabled }: { skuCode: string; price: string; enabled: boolean }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult<unknown> | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className={PACK_BTN(skuCode)}
        disabled={!enabled || pending}
        title={enabled ? undefined : "Buying packs by card is coming soon"}
        onClick={() => start(async () => setRes(await buyPackAction(skuCode, crypto.randomUUID())))}
      >
        {pending ? "…" : enabled ? `Pay by card · ${price}` : `Pay by card · ${price} · soon`}
      </button>
      {res && <ResultText result={res} />}
    </span>
  );
}

export function CreditPackButton({ skuCode, price, affordable }: { skuCode: string; price: string; affordable: boolean }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult<unknown> | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className="btn-ghost"
        disabled={pending || !affordable}
        title={affordable ? undefined : "Not enough MX — add funds or complete a challenge"}
        onClick={() => start(async () => setRes(await buyPackWithCreditAction(skuCode, crypto.randomUUID())))}
      >
        {pending ? "…" : `${price}`}
      </button>
      {res && <ResultText result={res} />}
    </span>
  );
}

/** Buy a pack with XP, priced at the admin's XP-per-MX rate. */
export function XpPackButton({ skuCode, xp, affordable }: { skuCode: string; xp: number; affordable: boolean }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult<unknown> | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className="btn-ghost"
        disabled={pending || !affordable}
        title={affordable ? undefined : "Not enough XP yet — your players' match points earn XP"}
        onClick={() => start(async () => setRes(await buyPackWithXpAction(skuCode, crypto.randomUUID())))}
      >
        {pending ? "…" : `${xp.toLocaleString("en-GB")} XP`}
      </button>
      {res && <ResultText result={res} />}
    </span>
  );
}

/** Claim the live free pack drop and open it straight away. */
export function ClaimDropButton({ dropId }: { dropId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult<unknown> | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        className="btn-primary px-5 py-2.5"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const claimed = await claimDropAction(dropId);
            if (!claimed.ok) return setRes(claimed);
            if (!claimed.data.entitlementId) {
              router.refresh();
              return setRes(claimed);
            }
            if (claimed.data.pick) return router.push(`/packs/pick/${claimed.data.entitlementId}`);
            const opened = await openPackAction(claimed.data.entitlementId);
            if (opened.ok) router.push(`/packs/opening/${opened.data.openingId}`);
            else setRes(opened);
          })
        }
      >
        {pending ? "Claiming…" : "Claim gift"}
      </button>
      {res && <ResultText result={res} />}
    </span>
  );
}
