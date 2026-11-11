"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { openBoosterPackAction } from "@/app/actions/boosters";
import { BOOSTERS, type BoosterKind } from "@/config/boosters";
import { ResultText } from "./action-button";
import type { ActionResult } from "@/app/actions/result";

const RARITY_STYLE: Record<string, string> = {
  Common: "border-ink-600 from-ink-800 to-ink-900",
  Rare: "border-[#8fe3ff]/60 from-[#0b2a3a] to-ink-900",
  Epic: "border-[#e9c46a]/70 from-[#3a2a08] to-ink-900",
};

/** One booster, face up. */
export function BoosterFace({ kind, expires, usedOn }: { kind: BoosterKind; expires: string; usedOn?: string | null }) {
  const b = BOOSTERS[kind];
  return (
    <div className={`flex h-full flex-col gap-2 rounded-2xl border bg-gradient-to-b p-4 ${RARITY_STYLE[b.rarity]}`}>
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
        <span>Booster</span>
        <span className={b.rarity === "Epic" ? "text-[#e9c46a]" : b.rarity === "Rare" ? "text-[#8fe3ff]" : ""}>{b.rarity}</span>
      </div>
      <div className="text-4xl" aria-hidden="true">
        {b.icon}
      </div>
      <p className="font-display text-2xl font-black uppercase italic leading-none">{b.name}</p>
      <p className="text-sm text-muted">{b.description}</p>
      <p className="mt-auto text-xs text-faint">{usedOn ? `Playing on ${usedOn}` : `Expires ${expires}`}</p>
      {!usedOn && (
        <Link href="/matches" className="btn-primary py-2 text-[11px]">
          Use it on a match
        </Link>
      )}
    </div>
  );
}

/** A sealed weekly booster pack that flips open. */
export function BoosterPackSealed({ packId, expires }: { packId: string; expires: string }) {
  const [kind, setKind] = useState<BoosterKind | null>(null);
  const [err, setErr] = useState<ActionResult<unknown> | null>(null);
  const [pending, start] = useTransition();
  if (kind) return <BoosterFace kind={kind} expires={expires} />;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-accent/60 bg-[radial-gradient(80%_60%_at_50%_30%,rgba(173,252,7,.18),transparent_70%)] p-5 text-center">
      <span className="text-5xl" aria-hidden="true">
        ⚡
      </span>
      <p className="font-display text-2xl font-black uppercase italic leading-none">Weekly booster</p>
      <p className="text-xs text-muted">Free every Tuesday · expires {expires}</p>
      <button
        type="button"
        className="btn-primary w-full py-2.5"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await openBoosterPackAction(packId);
            if (r.ok) setKind(r.data);
            else setErr(r);
          })
        }
      >
        {pending ? "Opening…" : "Open"}
      </button>
      {err && <ResultText result={err} />}
    </div>
  );
}
