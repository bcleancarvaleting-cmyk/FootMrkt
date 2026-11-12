"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { finishTourAction, restartTourAction } from "@/app/actions/account";

const STEPS: Array<{ icon: string; title: string; body: string }> = [
  { icon: "👋", title: "Welcome to MATCHX", body: "Collect real players from the Premier League to League Two, pick a squad every gameweek and score points from what they do on the pitch." },
  { icon: "🎁", title: "Your 32 free players", body: "Four starter packs give you a starting seven and a sub for every league. Get the app for 4 more: a top-performer pick from each league." },
  { icon: "🛡️", title: "My Club", body: "Every player you own lives in My Club — their value, how they're trending, and your squad's total portfolio value." },
  { icon: "⚽", title: "Pick your squad", body: "On Matches, choose 7 starters and a sub before the deadline. Your captain scores double, and a weekly booster adds extra points." },
  { icon: "🔁", title: "Build a better club", body: "Sell players on Transfers, bid in auctions, and sign new MATCHX player drops every day at 10am." },
  { icon: "🔥", title: "Earn every day", body: "Points earn XP, XP levels you up for free packs, and daily logins and predictions add more. Guides to everything are in the menu." },
];

/** First-visit tour for new managers: six quick slides, then off to open their packs. */
export function WelcomeTour({ name }: { name: string }) {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  const [, start] = useTransition();
  const router = useRouter();
  if (!open) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const finish = (to?: string) => {
    setOpen(false);
    start(async () => {
      await finishTourAction();
      if (to) router.push(to);
    });
  };
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/80 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-accent/50 bg-ink-950 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
        <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-[80%] rounded-full bg-accent/25 blur-3xl" aria-hidden="true" />
        <div className="relative px-6 pb-6 pt-6 text-center">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-lime">
              {step + 1} of {STEPS.length}
            </span>
            <button type="button" onClick={() => finish()} className="text-xs text-faint underline hover:text-fg">
              Skip tour
            </button>
          </div>
          <p className="mt-4 text-5xl" aria-hidden="true">
            {s.icon}
          </p>
          <h2 id="tour-title" className="mt-3 font-display text-4xl font-black uppercase italic leading-[0.9]">
            {step === 0 ? `Welcome, ${name}` : s.title}
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm text-muted">{s.body}</p>
          <div className="mt-5 flex justify-center gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-accent" : "w-1.5 bg-ink-700"}`} />
            ))}
          </div>
          <div className="mt-6 grid grid-cols-[auto_1fr] gap-2">
            <button type="button" onClick={() => setStep((x) => Math.max(0, x - 1))} disabled={step === 0} className="btn-ghost px-4 py-3.5 text-sm disabled:opacity-30">
              Back
            </button>
            {last ? (
              <button type="button" onClick={() => finish("/packs")} className="btn-primary py-3.5 text-sm">
                Open my packs
              </button>
            ) : (
              <button type="button" onClick={() => setStep((x) => x + 1)} className="btn-primary py-3.5 text-sm">
                Next
              </button>
            )}
          </div>
          {last && (
            <Link href="/guides" onClick={() => finish()} className="mt-3 inline-block text-xs text-faint underline hover:text-fg">
              Read the guides first
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/** Guides page: take the tour again. */
export function RestartTourButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await restartTourAction();
          router.refresh();
        })
      }
      className="btn-ghost px-4 py-2 text-xs"
    >
      {pending ? "…" : "▶ Take the welcome tour again"}
    </button>
  );
}
