import Link from "next/link";
import { notFound } from "next/navigation";
import { disableTwoStepAction, passwordResetAction, signOutUserAction, unblockUserAction, verifyEmailAction } from "@/app/actions/admin-users";
import { ActionButton } from "@/components/action-button";
import { BlockUserForm } from "@/components/block-user-form";
import { FoundingBadge } from "@/components/founding-badge";
import { fmtDate } from "@/lib/view";
import { adminUserDetail } from "@/server/admin-users";
import { requireAdmin } from "@/server/auth/session";
import { fmtMp } from "@/server/wallet";
import { AdminTitle } from "../../_parts/title";

export const metadata = { title: "Admin · Manager" };

const ACTION_LABEL: Record<string, string> = {
  "user.block": "Blocked",
  "user.unblock": "Unblocked",
  "user.suspend": "Suspended (trade review)",
  "user.password_reset": "Password reset link sent",
  "user.verify_email": "Email confirmed by admin",
  "user.disable_2fa": "Two-step login turned off",
  "user.sign_out": "Signed out everywhere",
};

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const d = await adminUserDetail(id);
  if (!d) notFound();
  const { user: u, balances: b } = d;
  const blocked = u.status === "SUSPENDED";
  const editable = u.id !== me.id && u.role !== "ADMIN";
  const fact = (label: string, value: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink-800 py-1.5 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="min-w-0 truncate text-right">{value}</span>
    </div>
  );
  return (
    <>
      <p>
        <Link href="/admin/users" className="text-xs text-muted hover:text-fg">
          ← All users
        </Link>
      </p>
      <AdminTitle title={u.displayName} intro={u.email} />
      {blocked && <div className="rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">This account is blocked. They can&apos;t log in or trade.</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <p className="eyebrow mb-2">Account</p>
          {fact("Status", blocked ? <span className="font-bold text-danger">Blocked</span> : <span className="text-lime">Active</span>)}
          {fact("Role", u.role.toLowerCase())}
          {fact("Founding member", u.foundingNumber ? <FoundingBadge number={u.foundingNumber} /> : "—")}
          {fact("Joined", fmtDate(u.createdAt, { dateStyle: "medium", timeStyle: "short" }))}
          {fact("Last seen", u.lastSeenAt ? fmtDate(u.lastSeenAt, { dateStyle: "medium", timeStyle: "short" }) : "—")}
          {fact("Email", u.emailVerifiedAt ? <span className="text-lime">Confirmed</span> : <span className="text-warn">Not confirmed</span>)}
          {fact("Two-step login", u.totpEnabledAt ? "On" : "Off")}
          {fact("Signed in on", `${u._count.sessions} device${u._count.sessions === 1 ? "" : "s"}`)}
          {fact("Supports", u.favouriteClub?.name ?? "—")}
          {fact("Referred by", u.referredBy?.displayName ?? "—")}
          {fact("Friends invited", u._count.referrals)}
          {fact("Matches entered", u._count.entries)}
          {fact("Cards", d.cards)}
          {fact("MX", `${fmtMp(b.total)} (bought ${fmtMp(b.total - b.earned)} · earned ${fmtMp(b.earned)})`)}
          {fact("XP", b.xp.toLocaleString("en-GB"))}
        </section>

        <section className="panel space-y-4 p-4">
          <p className="eyebrow">Actions</p>
          {!editable ? (
            <p className="text-sm text-muted">{u.id === me.id ? "This is your own account — use My account → Security." : "Admin accounts can't be changed from here."}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <ActionButton action={passwordResetAction.bind(null, u.id)} confirm={`Send ${u.displayName} a password reset link?`}>
                  Send password reset
                </ActionButton>
                <ActionButton action={signOutUserAction.bind(null, u.id)} confirm="Sign them out of every device?">
                  Sign out everywhere
                </ActionButton>
                {!u.emailVerifiedAt && <ActionButton action={verifyEmailAction.bind(null, u.id)}>Confirm email</ActionButton>}
                {u.totpEnabledAt && (
                  <ActionButton action={disableTwoStepAction.bind(null, u.id)} confirm="Turn off two-step login? Only do this once you're sure it's really them (e.g. they've lost their phone).">
                    Turn off two-step login
                  </ActionButton>
                )}
              </div>
              <div className="border-t border-ink-800 pt-4">
                {blocked ? (
                  <ActionButton action={unblockUserAction.bind(null, u.id)} className="btn-primary" confirm={`Unblock ${u.displayName}?`}>
                    Unblock account
                  </ActionButton>
                ) : (
                  <BlockUserForm userId={u.id} name={u.displayName} />
                )}
                <p className="mt-2 text-xs text-faint">Blocking keeps their cards, balance and history, so unblocking puts everything back as it was.</p>
              </div>
            </>
          )}
        </section>
      </div>

      {d.flags.length > 0 && (
        <section className="panel p-4">
          <p className="eyebrow mb-2">Trade flags</p>
          <ul className="space-y-1 text-sm">
            {d.flags.map((f) => (
              <li key={f.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {f.sellerId === u.id ? "As seller" : "As buyer"} · {f.reasons.join(", ").toLowerCase().replaceAll("_", " ")}
                </span>
                <span className="text-faint">
                  {f.status.toLowerCase()} · {fmtDate(f.createdAt, { dateStyle: "medium" })}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/admin/review" className="mt-2 inline-block text-xs text-lime">
            Open the review queue →
          </Link>
        </section>
      )}

      <section className="panel p-4">
        <p className="eyebrow mb-2">Admin history</p>
        {d.log.length === 0 ? (
          <p className="text-sm text-muted">No admin actions on this account.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {d.log.map((l) => {
              const reason = (l.after as { reason?: string } | null)?.reason;
              return (
                <li key={l.id} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {ACTION_LABEL[l.action] ?? l.action}
                    {reason ? <span className="text-muted"> · “{reason}”</span> : null}
                  </span>
                  <span className="text-faint">
                    {l.actor?.displayName ?? "System"} · {fmtDate(l.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
