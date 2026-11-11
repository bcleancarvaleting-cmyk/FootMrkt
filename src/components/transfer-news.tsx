"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { acceptTransferNewsAction } from "@/app/actions/account";
import type { CardView } from "@/lib/view";
import { PlayerCard } from "./player-card";

type Notice = { id: string; player: string; from: string; to: string; fee: string | null; type: string | null; date: string | null; cardId: string; card: CardView | null };

/**
 * Transfer news: when a player you own has moved club in real life, a pop-up shows the move — from,
 * to, the reported fee — and your card now at the new club. Tap Accept to carry on.
 */
export function TransferNews({ notices }: { notices: Notice[] }) {
  const [queue, setQueue] = useState(notices);
  const [pending, start] = useTransition();
  const n = queue[0];
  if (!n) return null;
  const accept = () =>
    start(async () => {
      await acceptTransferNewsAction(n.id);
      setQueue((q) => q.slice(1));
    });
  const deal = n.fee ? `Reported fee ${n.fee}` : n.type ? n.type : null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="transfer-news-title">
      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl border border-accent/50 bg-ink-950 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
        <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-[80%] rounded-full bg-accent/25 blur-3xl" aria-hidden="true" />
        <div className="relative px-6 pb-6 pt-5 text-center">
          <p className="flex items-center justify-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.22em] text-lime">
            <span className="live-dot" aria-hidden="true" /> Transfer news{queue.length > 1 ? ` · 1 of ${queue.length}` : ""}
          </p>
          <h2 id="transfer-news-title" className="mt-2 font-display text-4xl font-black uppercase italic leading-[0.9]">
            {n.player}
          </h2>
          <p className="mt-1 text-sm font-semibold text-muted">has signed for {n.to}</p>

          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-ink-700 bg-ink-900 px-3 py-3">
            <span className="min-w-0">
              <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-faint">From</span>
              <span className="block truncate font-display text-lg font-bold uppercase italic text-muted line-through decoration-danger/70">{n.from}</span>
            </span>
            <span className="text-2xl text-lime" aria-hidden="true">
              →
            </span>
            <span className="min-w-0">
              <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-faint">To</span>
              <span className="block truncate font-display text-lg font-black uppercase italic text-fg">{n.to}</span>
            </span>
          </div>
          {(deal || n.date) && (
            <p className="mt-2 text-sm">
              {deal && <b className="text-gold">{deal}</b>}
              {deal && n.date ? <span className="text-faint"> · </span> : null}
              {n.date && <span className="text-faint">{new Date(n.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>}
            </p>
          )}

          {n.card && (
            <div className="my-4 flex justify-center">
              <PlayerCard card={n.card} size="md" />
            </div>
          )}
          <p className="text-sm text-muted">
            Your {n.player} card now plays for <b className="text-fg">{n.to}</b> — same card, same number and history. Their points count for {n.to} from now on.
          </p>
          <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
            <button type="button" onClick={accept} disabled={pending} className="btn-primary py-3.5 text-sm">
              {pending ? "…" : "Accept"}
            </button>
            <Link href={`/cards/${n.cardId}`} onClick={accept} className="btn-ghost px-4 py-3.5 text-sm">
              View card
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
