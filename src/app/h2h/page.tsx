import Link from "next/link";
import { respondAction } from "@/app/actions/h2h";
import { ActionButton } from "@/components/action-button";
import { ChallengeForm } from "@/components/h2h-form";
import { requireUser } from "@/server/auth/session";
import { H2H_WIN_XP, myH2H } from "@/server/h2h";

export const metadata = { title: "Head-to-head" };

const STATUS: Record<string, string> = { PENDING: "Waiting for a reply", ACCEPTED: "On — best score this gameweek wins", DECLINED: "Declined", EXPIRED: "Not answered in time" };

export default async function H2HPage() {
  const user = await requireUser();
  const { list, record } = await myH2H(user.id);
  const incoming = list.filter((x) => x.incoming && x.status === "PENDING");
  const rest = list.filter((x) => !incoming.includes(x));
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="eyebrow">Bragging rights</p>
        <h1 className="mt-1 text-5xl font-extrabold">Head-to-head</h1>
        <p className="mt-2 text-muted">
          Challenge any manager for the next gameweek. Whoever has the higher best score across their matches wins {H2H_WIN_XP} bonus XP. No stakes — just the record.
        </p>
        <p className="mt-3 font-display text-3xl font-black tabular-nums">
          <span className="text-lime">{record.W}W</span> · {record.D}D · <span className="text-danger">{record.L}L</span>
        </p>
      </header>

      <section className="panel p-5">
        <h2 className="mb-3 text-2xl">Throw down a challenge</h2>
        <ChallengeForm />
        <p className="mt-2 text-xs text-faint">Tip: you can also challenge someone from their club page or your mini-league table.</p>
      </section>

      {incoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-2xl">You&apos;ve been challenged</h2>
          <ul className="space-y-2">
            {incoming.map((c) => (
              <li key={c.id} className="row-item flex-wrap gap-3">
                <span className="min-w-0 flex-1">
                  <Link href={`/clubs/${encodeURIComponent(c.opponent)}`} className="font-semibold hover:underline">{c.opponent}</Link> wants a head-to-head in GW{c.gameweek}
                </span>
                <ActionButton action={respondAction.bind(null, c.id, true)} className="btn-primary px-4 py-2 text-xs">Accept</ActionButton>
                <ActionButton action={respondAction.bind(null, c.id, false)} className="btn-ghost px-4 py-2 text-xs">Decline</ActionButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-2xl">Your challenges</h2>
        {rest.length === 0 ? (
          <p className="text-sm text-faint">None yet.</p>
        ) : (
          <ul className="divide-y divide-ink-700 rounded-2xl border border-ink-700 bg-ink-900 text-sm">
            {rest.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <span className={`w-7 text-center font-display text-xl font-black ${c.result === "W" ? "text-lime" : c.result === "L" ? "text-danger" : "text-muted"}`}>{c.result ?? "–"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {c.incoming ? "From" : "v"} <Link href={`/clubs/${encodeURIComponent(c.opponent)}`} className="font-semibold hover:underline">{c.opponent}</Link> · GW{c.gameweek}
                  </span>
                  <span className="block text-xs text-faint">{c.status === "SETTLED" ? `${c.myPoints} pts v ${c.theirPoints} pts` : STATUS[c.status]}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
