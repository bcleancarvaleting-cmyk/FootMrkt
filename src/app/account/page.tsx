import Link from "next/link";
import { ClubCrest } from "@/components/club-crest";
import { logoutAction } from "@/app/actions/auth";
import { respondInviteAction } from "@/app/actions/moderation";
import { ActionButton } from "@/components/action-button";
import { FoundingBadge } from "@/components/founding-badge";
import { CopyLink } from "@/components/copy-link";
import { FOOTBALL_PACKS } from "@/config/packs";
import { getText } from "@/server/settings";
import { TakeItOnTheGo } from "@/components/app-install";
import { headers } from "next/headers";
import { requireUser } from "@/server/auth/session";
import { binderTotals } from "@/server/binder";
import { db } from "@/server/db";
import { isEnabled } from "@/server/flags";
import { canModerate, pendingInvite } from "@/server/moderation";
import { balancesFor, fmtGbp, fmtMp, profileGaps } from "@/server/wallet";
import { fmtDate } from "@/lib/view";

export const metadata = { title: "My Account" };

export default async function AccountPage() {
  const user = await requireUser();
  const [full, bal, totals, entries, invite, devTools] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id } }),
    balancesFor(user.id),
    binderTotals(user.id),
    db.competitionEntry.findMany({ where: { userId: user.id, finalPoints: { not: null } }, include: { competition: true }, orderBy: { updatedAt: "desc" }, take: 8 }),
    pendingInvite(user.id),
    isEnabled("DEV_TOOLS"),
  ]);
  const gaps = profileGaps(full);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "playmatchx.com"}`;
  const referLink = `${origin}/register?ref=${encodeURIComponent(user.displayName)}`;
  const rewardCode = await getText("referralRewardSku");
  const rewardName = FOOTBALL_PACKS.find((p) => p.code === rewardCode)?.name ?? "pack";
  const [referred, referralPacks] = await Promise.all([
    db.user.count({ where: { referredById: user.id } }),
    db.packEntitlement.count({ where: { userId: user.id, sourceRef: { startsWith: "referral:" } } }),
  ]);
  const points = entries.reduce((s, e) => s + (e.finalPoints ?? 0), 0);
  const best = entries.length ? Math.min(...entries.map((e) => e.rank ?? 999)) : null;

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center gap-5">
        <Link href="/account/club/crest" className="group relative flex flex-col items-center" title="Edit club name & crest">
          {user.crest ? (
            <ClubCrest crest={user.crest} id="account" size={64} title={user.clubName ?? "Club crest"} />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent font-display text-3xl font-extrabold uppercase italic text-accent-ink">{user.displayName.slice(0, 1)}</span>
          )}
          <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-lime group-hover:underline">{user.crest ? "Edit crest" : "Add crest"}</span>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-4xl leading-none sm:text-5xl">{user.displayName}</h1>
          {user.clubName && <p className="mt-1 font-display text-xl font-bold uppercase italic text-muted">{user.clubName}</p>}
          <Link href={`/clubs/${encodeURIComponent(user.displayName)}`} className="mt-1 inline-block text-xs font-bold uppercase tracking-wider text-lime hover:underline">
            View my public club page →
          </Link>
          {full.foundingNumber && (
            <p className="mt-2 flex items-center gap-2">
              <FoundingBadge number={full.foundingNumber} />
              <span className="text-xs font-semibold text-muted">#{full.foundingNumber}</span>
            </p>
          )}
          <p className="mt-1 text-sm text-muted">
            {full.fullName ?? "Add your name in Profile"} · Manager since {fmtDate(full.createdAt, { month: "long", year: "numeric" })}
            {user.role !== "USER" && <span className="ml-2 tag text-lime">{user.role.toLowerCase()}</span>}
          </p>
        </div>
        <form action={logoutAction}>
          <button className="btn-ghost px-4 py-2 text-xs">Log out</button>
        </form>
      </section>

      {invite && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gold/50 bg-ink-900 p-5">
          <div>
            <p className="eyebrow">Invitation</p>
            <p className="font-bold">{invite.invitedBy.displayName} has invited you to be a chat moderator.</p>
            <p className="text-sm text-muted">Moderators review reported messages and can remove them.</p>
          </div>
          <div className="flex gap-2">
            <ActionButton action={respondInviteAction.bind(null, invite.id, true)} className="btn-gold">Accept</ActionButton>
            <ActionButton action={respondInviteAction.bind(null, invite.id, false)} className="btn-ghost">Decline</ActionButton>
          </div>
        </div>
      )}

      {(gaps.length > 0 || !user.emailVerified) && (
        <div className="rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm">
          {gaps.length > 0 && (
            <p>
              <b>Finish your profile.</b> Add your {gaps.join(", ")} — you&apos;ll need {gaps.length > 1 ? "them" : "it"} to add funds or withdraw.{" "}
              <Link href="/account/profile" className="font-semibold text-lime underline">Complete profile</Link>
            </p>
          )}
          {!user.emailVerified && (
            <p className={gaps.length ? "mt-1" : ""}>
              <b>Verify your email.</b> <span className="text-muted">Email delivery isn&apos;t connected yet.</span>
              {devTools && full.emailVerificationToken && (
                <Link className="ml-2 text-lime underline" href={`/verify?token=${full.emailVerificationToken}`}>DEV: verify now</Link>
              )}
            </p>
          )}
        </div>
      )}

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-700 bg-ink-700 lg:grid-cols-4">
        {[
          ["MX balance", fmtMp(bal.total), `${fmtGbp(bal.winnings)} winnings to withdraw`, "/account/wallet"],
          ["Cards", String(totals.total), `${totals.byCategory.GOLD} Gold · ${totals.byCategory.SILVER} Silver`, "/account/club"],
          ["Points", String(points), `${entries.length} settled match${entries.length === 1 ? "" : "es"}`, "/matches"],
          ["Best finish", best ? `#${best}` : "—", "across all matches", "/matches"],
        ].map(([l, v, s, href]) => (
          <Link key={l} href={href} className="bg-ink-900 p-5 transition hover:bg-ink-850">
            <p className="eyebrow">{l}</p>
            <p className="mt-1 font-display text-4xl font-extrabold italic tabular-nums">{v}</p>
            <p className="text-xs text-faint">{s}</p>
          </Link>
        ))}
      </section>

      <TakeItOnTheGo />

      <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-accent/40 bg-ink-900 p-5">
        <div className="min-w-0 flex-1 basis-72">
          <p className="eyebrow text-lime">Share MATCHX with your friends</p>
          <p className="mt-1 font-semibold">Get a free {rewardName} for every friend who joins with your link and plays a match.</p>
          <p className="text-sm text-muted">Your link is unique to you. Rewards are untradeable and count in challenges, binders and freerolls. No limit.</p>
          <p className="mt-2 text-xs text-faint">
            {referred} friend{referred === 1 ? "" : "s"} joined · {referralPacks} pack{referralPacks === 1 ? "" : "s"} earned
          </p>
        </div>
        <div className="flex w-full max-w-md flex-col gap-2 sm:w-auto">
          <CopyLink value={referLink} />
          <div className="flex gap-2">
            <a className="btn-ghost flex-1 px-3 py-2 text-[11px]" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Join me on MATCHX — free football card game with real players. ${referLink}`)}`}>
              WhatsApp
            </a>
            <a className="btn-ghost flex-1 px-3 py-2 text-[11px]" target="_blank" rel="noreferrer" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referLink)}`}>
              Facebook
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="mb-3 text-2xl">Recent matches</h2>
          <ul className="divide-y divide-ink-700 rounded-2xl border border-ink-700 bg-ink-900 text-sm">
            {entries.map((e) => (
              <li key={e.id}>
                <Link href={`/competitions/${e.competitionId}`} className="flex justify-between px-4 py-3 hover:bg-ink-850">
                  <span>{e.competition.name}</span>
                  <span className="tabular-nums"><b>{e.finalPoints} pts</b> <span className="text-faint">· #{e.rank}</span></span>
                </Link>
              </li>
            ))}
            {!entries.length && <li className="px-4 py-4 text-faint">No settled matches yet. <Link href="/matches" className="text-lime">Enter one →</Link></li>}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-2xl">Shortcuts</h2>
          <ul className="divide-y divide-ink-700 rounded-2xl border border-ink-700 bg-ink-900 text-sm">
            {[
              ["Add funds", "/account/wallet#add"],
              ["Withdraw winnings", "/account/wallet#withdraw"],
              ["My transfers & offers", "/transfers/mine"],
              ["Responsible play & limits", "/account/wallet#limits"],
              ...(canModerate(user.role) ? [["Moderation queue", "/moderation"]] : []),
              ...(user.role === "ADMIN" ? [["Admin", "/admin"]] : []),
            ].map(([l, h]) => (
              <li key={h}>
                <Link href={h} className="flex items-center justify-between px-4 py-3 hover:bg-ink-850">
                  {l} <span className="text-faint">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
