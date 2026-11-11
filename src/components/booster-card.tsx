"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
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
    <div className={`flex h-full flex-col gap-2 rounded-2xl border-2 bg-gradient-to-b p-4 ${RARITY_STYLE[b.rarity]}`} style={{ borderColor: b.color }}>
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
        <span>Booster</span>
        <span className={b.rarity === "Epic" ? "text-[#e9c46a]" : b.rarity === "Rare" ? "text-[#8fe3ff]" : ""}>{b.rarity}</span>
      </div>
      <div className="text-4xl" aria-hidden="true">
        {b.icon}
      </div>
      <p className="font-display text-2xl font-black uppercase italic leading-none">{b.name}</p>
      <p className="text-sm text-muted">{b.description}</p>
      <p className="flex items-center gap-2 text-xs text-muted">
        <span className="h-3 w-3 shrink-0 rounded-sm border-2" style={{ borderColor: b.color }} aria-hidden="true" />
        Your boosted player&apos;s card gets this colour border
      </p>
      <p className="mt-auto text-xs text-faint">{usedOn ? `Playing on ${usedOn}` : `Expires ${expires}`}</p>
      {!usedOn && (
        <Link href="/matches" className="btn-primary py-2 text-[11px]">
          Use it on a match
        </Link>
      )}
    </div>
  );
}

/** A sealed weekly booster pack. Opening spins a reel of every booster, which slows and stops on yours. */
export function BoosterPackSealed({ packId, expires }: { packId: string; expires: string }) {
  const [kind, setKind] = useState<BoosterKind | null>(null);
  const [landed, setLanded] = useState(false);
  const [closed, setClosed] = useState(false);
  const [err, setErr] = useState<ActionResult<unknown> | null>(null);
  const [pending, start] = useTransition();
  if (kind && closed) return <BoosterFace kind={kind} expires={expires} />;
  if (kind)
    return (
      // Full screen, centred: the reel spins across the whole width, then the booster pops up.
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Weekly booster">
        <div className="w-full max-w-xl space-y-5 text-center">
          {landed ? (
            <>
              <p className="font-display text-3xl font-black uppercase italic">{BOOSTERS[kind].name}!</p>
              <div className="animate-pop mx-auto max-w-xs">
                <BoosterFace kind={kind} expires={expires} />
              </div>
              <button type="button" className="btn-ghost px-6" onClick={() => setClosed(true)}>
                Close
              </button>
            </>
          ) : (
            <BoosterReel kind={kind} onDone={() => setLanded(true)} />
          )}
        </div>
      </div>
    );
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

const TILE = 104; // tile width + gap, px
const STOP = 30; // the tile the reel stops on

/** The reel. The booster was already chosen on the server; this only shows it landing. */
function BoosterReel({ kind, onDone }: { kind: BoosterKind; onDone: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [strip] = useState(() => {
    const kinds = Object.keys(BOOSTERS) as BoosterKind[];
    return Array.from({ length: STOP + 4 }, (_, i) => (i === STOP ? kind : kinds[(i * 5 + Math.floor(Math.random() * 3)) % kinds.length]));
  });
  useEffect(() => {
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const w = box.current?.clientWidth ?? 300;
    const id = requestAnimationFrame(() => setX(STOP * TILE - (w / 2 - TILE / 2) + 6));
    const t = setTimeout(onDone, calm ? 100 : 3600);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(t);
    };
  }, [onDone]);
  return (
    <div className="flex flex-col justify-center gap-4 text-center">
      <p className="font-display text-3xl font-black uppercase italic">Spinning…</p>
      <div ref={box} className="relative overflow-hidden rounded-xl border border-ink-700 bg-ink-900 py-3" aria-hidden="true">
        <div className="reel-strip" style={{ transform: `translateX(-${x}px)`, transition: x ? "transform 3.4s cubic-bezier(.12,.75,.12,1)" : "none" }}>
          {strip.map((k, i) => (
            <div key={i} className="mx-1.5 grid h-28 w-[92px] shrink-0 place-items-center content-center gap-1 rounded-xl border-[3px] bg-ink-950" style={{ borderColor: BOOSTERS[k].color }}>
              <span className="text-4xl">{BOOSTERS[k].icon}</span>
              <b className="font-display text-xs font-black uppercase">{BOOSTERS[k].name}</b>
            </div>
          ))}
        </div>
        <i className="reel-mark" />
      </div>
      <span className="sr-only" role="status">
        Your booster is {BOOSTERS[kind].name}
      </span>
    </div>
  );
}
