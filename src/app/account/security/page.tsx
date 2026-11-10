import { signOutOthersAction } from "@/app/actions/security";
import { ActionButton } from "@/components/action-button";
import { ChangePasswordForm, TwoStepManage, TwoStepSetup } from "@/components/security-forms";
import { fmtDate } from "@/lib/view";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata = { title: "Security" };

export default async function SecurityPage() {
  const me = await requireUser();
  const [u, sessions] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: me.id }, select: { totpEnabledAt: true, backupCodeHashes: true, emailVerifiedAt: true, email: true } }),
    db.session.findMany({ where: { userId: me.id, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  return (
    <div className="space-y-6">
      <section className="panel space-y-3 p-5">
        <h2 className="text-2xl">Two-step login</h2>
        <p className="text-sm text-muted">
          Protect your cards and winnings: as well as your password, you&apos;ll type a code from an app on your phone when you log in. Strongly recommended if you own a Ruby, Diamond or
          Rainbow.
        </p>
        {u.totpEnabledAt ? <TwoStepManage codesLeft={u.backupCodeHashes.length} /> : <TwoStepSetup />}
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="text-2xl">Password</h2>
        <p className="text-sm text-muted">At least 10 characters. Changing it logs out your other devices.</p>
        <ChangePasswordForm />
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="text-2xl">Devices</h2>
        <p className="text-sm text-muted">
          You&apos;re logged in on {sessions.length} device{sessions.length === 1 ? "" : "s"}
          {sessions.length > 0 ? ` (most recent login ${fmtDate(sessions[0].createdAt)})` : ""}. If you don&apos;t recognise one, log them all out and change your password.
        </p>
        <ActionButton action={signOutOthersAction} className="btn-ghost px-4 py-2 text-xs" confirm="Log out of every other device?">
          Log out other devices
        </ActionButton>
      </section>

      <section className="panel space-y-1 p-5">
        <h2 className="text-2xl">Email</h2>
        <p className="text-sm text-muted">
          {u.email} · {u.emailVerifiedAt ? <span className="text-mint">confirmed</span> : <span className="text-warn">not confirmed yet — check your inbox for the link</span>}
        </p>
      </section>
    </div>
  );
}
