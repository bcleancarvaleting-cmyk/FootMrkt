import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { isEnabled } from "@/server/flags";
import { fmtDate, gbp } from "@/lib/view";
import { balanceMinor, fmtMp, walletHistory } from "@/server/wallet";
import { respondInviteAction } from "@/app/actions/moderation";
import { ActionButton } from "@/components/action-button";
import { pendingInvite } from "@/server/moderation";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const [orders, entries, devTools, credit, ledger, invite] = await Promise.all([
    db.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.competitionEntry.findMany({
      where: { userId: user.id, finalPoints: { not: null } },
      include: { competition: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    isEnabled("DEV_TOOLS"),
    balanceMinor(user.id),
    walletHistory(user.id),
    pendingInvite(user.id),
  ]);
  const seasonPoints = entries.reduce((s, e) => s + (e.finalPoints ?? 0), 0);
  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Manager profile</p>
        <h1 className="text-5xl font-extrabold">{user.displayName}</h1>
        <p className="text-sm text-muted">
          {user.email} · joined {fmtDate(user.createdAt, { dateStyle: "long" })}
        </p>
      </div>

      {invite && (
        <div className="panel flex flex-wrap items-center justify-between gap-4 border-gold/50 p-5">
          <div>
            <p className="eyebrow">Invitation</p>
            <p className="font-bold">{invite.invitedBy.displayName} has invited you to be a chat moderator.</p>
            <p className="text-sm text-muted">Moderators review reported messages and can remove them. Please follow the community rules.</p>
          </div>
          <div className="flex gap-2">
            <ActionButton action={respondInviteAction.bind(null, invite.id, true)} className="btn-gold">
              Accept
            </ActionButton>
            <ActionButton action={respondInviteAction.bind(null, invite.id, false)} className="btn-ghost">
              Decline
            </ActionButton>
          </div>
        </div>
      )}

      {!user.emailVerified && (
        <div className="panel border-warn/40 p-4 text-sm">
          <b className="text-warn">Verify your email.</b> <span className="text-muted">Email delivery isn&apos;t connected yet.</span>
          {devTools && user.emailVerificationToken && (
            <>
              {" "}
              <Link className="text-lime underline" href={`/verify?token=${user.emailVerificationToken}`}>
                DEV: verify now
              </Link>
            </>
          )}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="panel p-4">
          <div className="label">Settled competitions</div>
          <div className="text-2xl font-black">{entries.length}</div>
        </div>
        <div className="panel p-4">
          <div className="label">Total points</div>
          <div className="text-2xl font-black text-lime">{seasonPoints}</div>
        </div>
        <div className="panel p-4">
          <div className="label">Best finish</div>
          <div className="text-2xl font-black">{entries.length ? `#${Math.min(...entries.map((e) => e.rank ?? 999))}` : "—"}</div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">Competition history</h2>
        <div className="panel divide-y divide-ink-700 text-sm">
          {entries.map((e) => (
            <Link key={e.id} href={`/competitions/${e.competitionId}`} className="flex justify-between px-4 py-2 hover:bg-ink-850">
              <span>{e.competition.name}</span>
              <span>
                <b>{e.finalPoints} pts</b> <span className="text-faint">· #{e.rank}</span>
              </span>
            </Link>
          ))}
          {!entries.length && <p className="px-4 py-4 text-faint">No settled competitions yet.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">
          MP credit <span className="text-lime">{fmtMp(credit)}</span>
        </h2>
        <p className="mb-2 text-xs text-faint">Promotional credit for packs. It can&apos;t be withdrawn or exchanged for cash.</p>
        <div className="panel divide-y divide-ink-700 text-sm">
          {ledger.map((e) => (
            <div key={e.id} className="flex justify-between px-4 py-2">
              <span>
                {e.kind === "SET_REWARD" ? `Set completed: ${e.note}` : e.kind === "PACK_PURCHASE" ? `Bought ${e.note}` : e.note ?? "Adjustment"}
                <span className="text-faint"> · {fmtDate(e.createdAt)}</span>
              </span>
              <b className={e.amountMinor > 0 ? "text-mint" : "text-muted"}>
                {e.amountMinor > 0 ? "+" : ""}
                {fmtMp(e.amountMinor)}
              </b>
            </div>
          ))}
          {!ledger.length && <p className="px-4 py-4 text-faint">Complete a set to earn 10 MP credit.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-bold">Orders</h2>
        <div className="panel divide-y divide-ink-700 text-sm">
          {orders.map((o) => (
            <div key={o.id} className="flex justify-between px-4 py-2">
              <span>
                {o.kind === "PACK_PURCHASE" ? "Pack purchase" : "Market purchase"} <span className="text-faint">· {fmtDate(o.createdAt)}</span>
              </span>
              <span>
                {gbp(o.amountMinor)} <span className="text-faint">· {o.status.toLowerCase()}</span>
              </span>
            </div>
          ))}
          {!orders.length && <p className="px-4 py-4 text-faint">No orders.</p>}
        </div>
      </section>
    </div>
  );
}
