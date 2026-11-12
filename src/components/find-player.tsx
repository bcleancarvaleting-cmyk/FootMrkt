"use client";

import { useRouter } from "next/navigation";

/**
 * 🔍 on every player card: find this player for sale — the market, a drop, the Transfer list or an
 * auction — or, if no one's selling, the "rare" page with the watchlist. Works inside cards that
 * are themselves links (it stops the card's own click).
 */
export function FindPlayer({ playerId, name, small = false, inline = false }: { playerId: string; name: string; small?: boolean; inline?: boolean }) {
  const router = useRouter();
  const go = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/transfers/find/${playerId}`);
  };
  return (
    <span
      role="link"
      tabIndex={0}
      title={`Find ${name} to buy`}
      aria-label={`Find ${name} to buy`}
      onClick={go}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go(e)}
      className={`${inline ? "relative shrink-0" : "absolute bottom-1 left-1 z-10"} flex cursor-pointer items-center gap-1 rounded-full border border-white/25 bg-ink-950/85 font-bold text-white shadow-md backdrop-blur transition hover:border-[#adfc07] hover:text-[#adfc07] ${small ? "h-5 px-1.5 text-[9px]" : "h-6 px-2 text-[10px]"}`}
    >
      <svg viewBox="0 0 24 24" className={small ? "h-2.5 w-2.5" : "h-3 w-3"} fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </svg>
      {!small && "Find"}
    </span>
  );
}
