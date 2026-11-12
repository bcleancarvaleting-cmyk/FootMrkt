"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addToBasketAction, checkoutBasketAction, payExactAction, removeFromBasketAction } from "@/app/actions/basket";
import type { ActionResult } from "@/app/actions/result";
import { ResultText } from "./action-button";

/** "Add to transfers" on a MATCHX drop: toggles it in and out of the basket. */
export function AddToBasketButton({ listingId, price, inBasket, disabled }: { listingId: string; price: string; inBasket: boolean; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex shrink-0 flex-col items-end gap-1">
      {inBasket ? (
        <span className="flex items-center gap-1.5">
          <Link href="/transfers/basket" className="whitespace-nowrap rounded-xl border border-accent bg-accent/15 px-2.5 py-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-lime">
            ✓ Added
          </Link>
          <button
            type="button"
            aria-label="Remove from basket"
            disabled={pending}
            onClick={() => start(async () => void (await removeFromBasketAction(listingId)))}
            className="flex h-8 w-7 items-center justify-center rounded-lg border border-ink-700 text-muted hover:text-fg"
          >
            ✕
          </button>
        </span>
      ) : (
        <button
          type="button"
          disabled={pending || disabled}
          onClick={() =>
            start(async () => {
              const r = await addToBasketAction(listingId);
              setError(r.ok ? null : r.error);
            })
          }
          className="btn-primary whitespace-nowrap px-3 py-2 text-[11px]"
        >
          {pending ? "Adding…" : price ? `Add · ${price}` : "+ Add"}
        </button>
      )}
      {error && <span className="max-w-[14rem] text-right text-[11px] text-danger">{error}</span>}
    </span>
  );
}

export function RemoveFromBasketButton({ listingId }: { listingId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="Remove from basket"
      disabled={pending}
      onClick={() => start(async () => void (await removeFromBasketAction(listingId)))}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink-700 text-muted hover:text-fg"
    >
      {pending ? "…" : "✕"}
    </button>
  );
}

export function CheckoutButton({ total, count }: { total: string; count: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Pay ${total} for ${count} player${count > 1 ? "s" : ""}?`)) return;
          start(async () => setResult(await checkoutBasketAction()));
        }}
        className="btn-primary w-full py-3.5 text-sm"
      >
        {pending ? "Signing your players…" : `Pay for all · ${total}`}
      </button>
      {result && <ResultText result={result} exact={{ kind: "basket" }} />}
    </div>
  );
}

/** "Pay exactly £x by card" — card payment for this exact amount; the purchase completes once it's paid. */
export function PayExactButton({ target, label, disabled }: { target: { kind: "listing" | "auction" | "basket"; id?: string }; label: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            const r = await payExactAction(target, key);
            if (r.ok) window.location.href = r.data.checkoutUrl;
            else setError(r.error);
          })
        }
        className="btn-primary w-full flex-col gap-0 py-3"
      >
        <span>{pending ? "Opening card payment…" : label}</span>
        <span className="text-[10px] font-semibold normal-case tracking-normal opacity-75">Signs your players straight away — no bundle needed</span>
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
