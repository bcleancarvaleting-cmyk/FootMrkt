import Link from "next/link";
import { SupportForm } from "@/components/support-form";
import { getCurrentUser } from "@/server/auth/session";
import { SUPPORT_CATEGORIES } from "@/server/support";

export const metadata = { title: "Report a problem" };

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ from?: string; topic?: string }> }) {
  const [user, { from, topic }] = await Promise.all([getCurrentUser(), searchParams]);
  return (
    <div className="mx-auto max-w-xl space-y-6 pt-4">
      <header>
        <p className="eyebrow">Help</p>
        <h1 className="mt-1 text-5xl font-extrabold">Report a problem</h1>
        <p className="mt-2 text-muted">A real person reads every message. We&apos;ll reply to {user ? <b className="text-fg">{user.email}</b> : "your email"}.</p>
      </header>
      <div className="panel p-6">
        <SupportForm email={user?.email ?? null} categories={SUPPORT_CATEGORIES} from={from} preset={SUPPORT_CATEGORIES.some(([c]) => c === topic) ? topic : undefined} />
      </div>
      <p className="text-sm text-muted">
        Worried about how much you&apos;re playing? <Link href="/account/safer-play" className="text-lime underline">Safer play</Link> lets you set limits or take a break straight away. Free,
        confidential help: <a href="https://www.begambleaware.org" className="text-lime underline" target="_blank" rel="noreferrer">BeGambleAware</a> · 0808 8020 133.
      </p>
    </div>
  );
}
