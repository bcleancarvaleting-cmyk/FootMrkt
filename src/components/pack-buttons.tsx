"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { claimDropAction } from "@/app/actions/account";
import { buyPackAction, buyPackWithCreditAction, claimDevPackAction, openPackAction } from "@/app/actions/game";
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
        title={enabled ? undefined : "Buying packs by card is coming soon"}
        onClick={() => start(async () => setRes(await buyPackAction(skuCode, crypto.randomUUID())))}
      >
        {pending ? "…" : enabled ? `${price} by card` : `${price} · Soon`}
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
