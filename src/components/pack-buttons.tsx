"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buyPackAction, buyPackWithCreditAction, claimDevPackAction, claimWeeklyPackAction, openPackAction } from "@/app/actions/game";
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

export function BuyPackButton({ skuCode, price, enabled, gold }: { skuCode: string; price: string; enabled: boolean; gold?: boolean }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult<unknown> | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className={gold ? "btn-gold" : "btn-primary"}
        disabled={!enabled || pending}
        title={enabled ? undefined : "Paid packs are not available yet"}
        onClick={() => start(async () => setRes(await buyPackAction(skuCode, crypto.randomUUID())))}
      >
        {pending ? "…" : `Buy ${price}`}
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
        className="btn-ghost border-lime/50 text-lime"
        disabled={pending || !affordable}
        title={affordable ? undefined : "Not enough MP credit — complete a set to earn 10 MP"}
        onClick={() => start(async () => setRes(await buyPackWithCreditAction(skuCode, crypto.randomUUID())))}
      >
        {pending ? "…" : `Use ${price} credit`}
      </button>
      {res && <ResultText result={res} />}
    </span>
  );
}

/** Claim this week's free pack and open it straight away. */
export function ClaimWeeklyButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult<unknown> | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className="btn-primary px-6 py-3.5"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const claimed = await claimWeeklyPackAction();
            if (!claimed.ok) return setRes(claimed);
            const opened = await openPackAction(claimed.data.entitlementId);
            if (opened.ok) router.push(`/packs/opening/${opened.data.openingId}`);
            else setRes(opened);
          })
        }
      >
        {pending ? "Opening…" : "Claim & open free pack"}
      </button>
      {res && <ResultText result={res} />}
    </span>
  );
}
