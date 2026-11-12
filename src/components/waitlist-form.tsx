"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { type WaitlistResult, joinWaitlistAction } from "@/app/actions/waitlist";
import { CopyLink } from "./copy-link";

type Clubs = Array<{ league: string; clubs: Array<{ code: string; name: string }> }>;
type Tracking = { ref?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string; club?: string };

/** The waitlist sign-up: email, name, club, 18+ and news consent. Then the visitor's place and share link. */
export function WaitlistForm({ clubs, tracking, gift, perFriend, mine }: { clubs: Clubs; tracking: Tracking; gift: string; perFriend: number; mine: WaitlistResult | null }) {
  const [state, action, pending] = useActionState(joinWaitlistAction, null);
  const [referrerHost, setReferrerHost] = useState("");
  useEffect(() => {
    try {
      const host = document.referrer ? new URL(document.referrer).hostname : "";
      const t = setTimeout(() => setReferrerHost(host === location.hostname ? "" : host), 0);
      return () => clearTimeout(t);
    } catch {
      return undefined;
    }
  }, []);

  const done = state?.ok ? state.data : mine;
  if (done) return <YoureIn r={done} perFriend={perFriend} />;

  return (
    <form action={action} className="space-y-3" noValidate={false}>
      {Object.entries(tracking).map(([k, v]) => (v && k !== "club" ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <input type="hidden" name="referrerHost" value={referrerHost} />
      {/* Honeypot: hidden from people, tempting to bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="wl-website">Website</label>
        <input id="wl-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div>
        <label className="label" htmlFor="wl-email">Email</label>
        <input id="wl-email" name="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com" className="input py-3 text-base" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="wl-name">First name</label>
          <input id="wl-name" name="firstName" maxLength={40} autoComplete="given-name" placeholder="Optional" className="input py-3 text-base" />
        </div>
        <div>
          <label className="label" htmlFor="wl-club">Who do you support?</label>
          <select id="wl-club" name="clubCode" defaultValue={tracking.club ?? ""} className="input py-3 text-base">
            <option value="">Choose your club</option>
            {clubs.map((l) => (
              <optgroup key={l.league} label={l.league}>
                {l.clubs.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </optgroup>
            ))}
            <option value="none">I don&apos;t support an English club</option>
          </select>
        </div>
      </div>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="over18" required className="mt-0.5 h-5 w-5 shrink-0 accent-lime" />
        <span>I&apos;m 18 or over</span>
      </label>
      <label className="flex items-start gap-2.5 text-sm text-muted">
        <input type="checkbox" name="marketingOptIn" className="mt-0.5 h-5 w-5 shrink-0 accent-lime" />
        <span>Also send me MATCHX news: free pack drops, new features and offers. (Optional — we&apos;ll always tell you when we launch.)</span>
      </label>
      <button className="btn-primary w-full py-4 text-sm" disabled={pending}>{pending ? "Saving your place…" : `Save my place + get ${gift} free`}</button>
      {state && !state.ok && <p role="alert" className="text-sm font-semibold text-danger">{state.error}</p>}
      <p className="text-xs text-faint">
        We&apos;ll only use your email for MATCHX. Unsubscribe any time. See our <Link href="/legal/privacy" className="underline">privacy policy</Link>.
      </p>
    </form>
  );
}

function YoureIn({ r, perFriend }: { r: WaitlistResult; perFriend: number }) {
  const text = `I've joined the MATCHX waitlist — the football card game for every English club. Join with my link and we both move up:`;
  const enc = encodeURIComponent;
  const shares: Array<[string, string]> = [
    ["WhatsApp", `https://wa.me/?text=${enc(`${text} ${r.shareUrl}`)}`],
    ["X", `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(r.shareUrl)}`],
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${enc(r.shareUrl)}`],
  ];
  return (
    <div className="space-y-4" aria-live="polite">
      <p className="eyebrow text-lime">{r.again ? "You're already on the list" : "You're in"}</p>
      <div className="flex items-end gap-3">
        <span className="font-display text-7xl font-black italic leading-none tabular-nums text-lime">#{r.position?.toLocaleString("en-GB") ?? "—"}</span>
        {r.total ? <span className="pb-2 text-sm text-muted">of {r.total.toLocaleString("en-GB")} in the queue</span> : null}
      </div>
      <p className="text-sm text-muted">
        {r.firstName ? `Nice one, ${r.firstName}. ` : ""}We&apos;ll email you the moment MATCHX kicks off. Create your club with the same email to get <b className="text-fg">{r.gift}</b> free.
      </p>
      <div className="rounded-2xl border border-accent/50 bg-accent/5 p-4">
        <p className="font-semibold">Jump the queue</p>
        <p className="mt-0.5 text-sm text-muted">
          Every friend who joins with your link moves you up <b className="text-fg">{perFriend} places</b>.{r.referrals ? ` ${r.referrals} friend${r.referrals === 1 ? " has" : "s have"} joined so far.` : ""}
        </p>
        <div className="mt-3">
          <CopyLink value={r.shareUrl} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {shares.map(([label, href]) => (
            <a key={label} href={href} target="_blank" rel="noreferrer" className="btn-ghost px-4 py-2 text-xs">
              Share on {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
