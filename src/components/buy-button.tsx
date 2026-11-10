"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buyNowAction } from "@/app/actions/transfers";
import type { ActionResult } from "@/app/actions/result";
import { ResultText } from "./action-button";

/** Buy now → straight to the signing reveal. */
export function BuyButton({ listingId, label, confirm, disabled, className = "btn-primary min-w-[104px] px-3 py-2 text-[11px]" }: { listingId: string; label: string; confirm: string; disabled?: boolean; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult<unknown> | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className={className}
        disabled={disabled || pending}
        onClick={() => {
          if (!window.confirm(confirm)) return;
          start(async () => {
            const r = await buyNowAction(listingId);
            if (r.ok) router.push(`/transfers/signed/${listingId}`);
            else setRes(r);
          });
        }}
      >
        {pending ? "Signing…" : label}
      </button>
      {res && <ResultText result={res} />}
    </span>
  );
}
