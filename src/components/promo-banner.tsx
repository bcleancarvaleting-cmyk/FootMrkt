"use client";

import Link from "next/link";
import { useActionState } from "react";
import { claimPromoAction } from "@/app/actions/game";
import type { ActionResult } from "@/app/actions/result";

/**
 * The MATCHX welcome offer. Keeps flashing until it's used: "50% off a pack with code MATCHX" →
 * tap to apply (or type it) → "applied, your next pack is half price" → gone once used.
 */
export function PromoBanner({ code, headline, status, slim = false }: { code: string; headline: string; status: "none" | "claimed" | "used"; slim?: boolean }) {
  const [state, run, pending] = useActionState<ActionResult | null, FormData>(claimPromoAction, null);
  if (status === "used") return null;
  if (status === "claimed" || state?.ok) {
    return (
      <Link href="/packs" className={`promo-glow flex items-center gap-3 rounded-2xl border border-[#adfc07]/70 bg-[#0e1206] px-4 ${slim ? "py-2 text-xs" : "py-3 text-sm"}`}>
        <span className="text-lg" aria-hidden="true">✅</span>
        <span className="min-w-0 flex-1">
          <b className="text-[#adfc07]">{code} applied</b> — your next pack is half price
        </span>
        <span className="shrink-0 font-black text-[#adfc07]">Packs →</span>
      </Link>
    );
  }
  return (
    <form action={run} className={`promo-glow flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-[#f0cb5a]/70 bg-gradient-to-r from-[#1d1606] via-[#0f0d06] to-[#0b0e0c] px-4 ${slim ? "py-2" : "py-3"}`}>
      <input type="hidden" name="code" value={code} />
      <span className={`${slim ? "text-lg" : "text-2xl"}`} aria-hidden="true">🎁</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-[#f0cb5a]">New manager offer</span>
        <span className={`block font-bold ${slim ? "text-xs" : "text-sm"}`}>
          {headline} with code <span className="rounded bg-[#f0cb5a] px-1.5 font-black tracking-wider text-[#1a1203]">{code}</span>
        </span>
        {state && !state.ok && <span className="block text-xs text-danger">{state.error}</span>}
      </span>
      <button className={`btn-gold shrink-0 ${slim ? "px-3 py-1.5 text-[10px]" : "px-4 py-2 text-xs"}`} disabled={pending}>
        {pending ? "Applying…" : `Use ${code}`}
      </button>
    </form>
  );
}
