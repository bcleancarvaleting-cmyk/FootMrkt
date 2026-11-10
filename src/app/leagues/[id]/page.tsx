import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { leaveLeagueAction } from "@/app/actions/social";
import { ActionButton } from "@/components/action-button";
import { ManagerBadge } from "@/components/club-crest";
import { CopyLink } from "@/components/copy-link";
import { FoundingBadge } from "@/components/founding-badge";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth/session";
import { DomainError } from "@/server/errors";
import { leagueTable } from "@/server/leagues";

export const metadata = { title: "Mini-league" };

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await leagueTable(user.id, id).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "matchx.app"}`;
  const invite = `${origin}/leagues/join/${t.league.code}`;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Mini-league · ${t.rows.length} manager${t.rows.length === 1 ? "" : "s"}`} title={t.league.name} intro={t.season ? `${t.season} season · each manager's best score per gameweek counts.` : "The table fills in once the first matches are played."}>
        <Link href="/leagues" className="btn-ghost px-4 py-2 text-xs">
          All leagues
        </Link>
      </PageHeader>

      <section className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Invite friends</p>
          <p className="text-sm text-muted">
            Code <b className="tracking-[0.3em] text-fg">{t.league.code}</b> · or send the link:
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-96">
          <CopyLink value={invite} />
          <a className="btn-ghost px-3 py-2 text-[11px]" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Join my MATCHX league "${t.league.name}": ${invite}`)}`}>
            Share on WhatsApp
          </a>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
        <div className="grid grid-cols-[2.5rem_1fr_3.5rem_4rem] items-center gap-2 border-b border-ink-700 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
          <span>#</span>
          <span>Manager</span>
          <span className="text-right">{t.gameweek ? `GW${t.gameweek}` : "GW"}</span>
          <span className="text-right">Total</span>
        </div>
        <ol>
          {t.rows.map((r) => (
            <li key={r.userId} className={`grid grid-cols-[2.5rem_1fr_3.5rem_4rem] items-center gap-2 border-b border-ink-800 px-4 py-2.5 last:border-0 ${r.userId === user.id ? "bg-accent/5" : ""}`}>
              <span className={`font-display text-xl font-black tabular-nums ${r.rank === 1 ? "text-gold" : "text-muted"}`}>{r.rank}</span>
              <Link href={`/clubs/${encodeURIComponent(r.name)}`} className="flex min-w-0 items-center gap-2 hover:underline">
                <ManagerBadge crest={r.crest} name={r.name} id={`lg-${r.userId}`} size={28} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {r.name} <FoundingBadge number={r.foundingNumber} compact />
                    {r.userId === user.id && <span className="ml-1 text-xs text-lime">you</span>}
                  </span>
                  {r.clubName && <span className="block truncate text-xs text-faint">{r.clubName}</span>}
                </span>
              </Link>
              <span className="text-right tabular-nums text-muted">{r.gw ?? "–"}</span>
              <span className="text-right font-display text-xl font-black tabular-nums">{r.total}</span>
            </li>
          ))}
        </ol>
      </section>

      {!t.isOwner && (
        <ActionButton action={leaveLeagueAction.bind(null, t.league.id)} className="btn-ghost px-4 py-2 text-xs" confirm={`Leave ${t.league.name}?`}>
          Leave league
        </ActionButton>
      )}
    </div>
  );
}
