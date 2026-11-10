import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { respondInviteAction } from "@/app/actions/moderation";
import { ActionButton } from "@/components/action-button";
import { FoundingBadge } from "@/components/founding-badge";
import { CopyLink } from "@/components/copy-link";
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
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "matchx.app"}`;
  const referLink = `${origin}/register?ref=${encodeURIComponent(user.displayName)}`;
  const [referred, referralPacks] = await Promise.all([
    db.user.count({ where: { referredById: user.id } }),
    db.packEntitlement.count({ where: { userId: user.id, sourceRef: { startsWith: "referral:" } } }),
  ]);
  const points = entries.reduce((s, e) => s + (e.finalPoints ?? 0), 0);
  const best = entries.length ? Math.min(...entries.map((e) => e.rank ?? 999)) : null;

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center gap-5">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent font-display text-3xl font-extrabold uppercase italic text-accent-ink">{user.displayName.slice(0, 1)}</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-4xl leading-none sm:text-5xl">{user.displayName}</h1>
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
          <p className="eyebrow text-lime">Refer a friend</p>
          <p className="mt-1 font-semibold">Get a free 3-player pack for every friend who joins and plays a match.</p>
          <p className="text-sm text-muted">Usually 2 Bronze and a Silver, sometimes a Gold. Untradeable; they count in challenges and freerolls. No limit.</p>
          <p className="mt-2 text-xs text-faint">
            {referred} friend{referred === 1 ? "" : "s"} joined · {referralPacks} pack{referralPacks === 1 ? "" : "s"} earned
          </p>
        </div>
        <CopyLink value={referLink} />
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
