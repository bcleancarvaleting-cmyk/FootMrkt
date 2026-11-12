import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { ManagerBadge } from "@/components/club-crest";
import { FoundingBadge } from "@/components/founding-badge";
import { getCurrentUser } from "@/server/auth/session";
import { megaLeague } from "@/server/mega-league";

export const metadata = { title: "Mega League", description: "Every MATCHX manager on one table: total points over the season." };
export const dynamic = "force-dynamic";

type Row = Awaited<ReturnType<typeof megaLeague>>["rows"][number];

export default async function MegaLeaguePage() {
  const user = await getCurrentUser();
  const t = await megaLeague(user?.id ?? null);
  const meShown = t.me && t.rows.some((r) => r.userId === t.me!.userId);
  return (
    <div className="space-y-6">
      <AutoRefresh when={t.live} />
      <section className="relative overflow-hidden rounded-3xl border border-ink-700 bg-ink-900 p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl" aria-hidden="true" />
        <p className="eyebrow relative text-lime">
          {t.live && <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-danger align-middle" aria-hidden="true" />}
          Season {t.season ?? "—"} · {t.managers.toLocaleString("en-GB")} managers
        </p>
        <h1 className="relative mt-1 text-5xl leading-none sm:text-6xl">Mega League</h1>
        <p className="relative mt-2 max-w-xl text-sm text-muted">
          Every manager on one table. Your best score from each gameweek adds up over the season{t.live ? `, and GW${t.gameweek} is counting live right now` : ""}.
        </p>
        {t.me && (
          <div className="relative mt-5 flex flex-wrap items-end gap-x-8 gap-y-3">
            <Stat label="Your position" value={`#${t.me.rank.toLocaleString("en-GB")}`} tone="text-lime" />
            <Stat label="Season points" value={t.me.total.toLocaleString("en-GB")} />
            <Stat label={`GW${t.gameweek}`} value={t.me.gw == null ? "–" : String(t.me.gw)} />
            <Stat label="Best week" value={String(t.me.best)} />
          </div>
        )}
        {!t.me && user && (
          <p className="relative mt-4 text-sm">
            You&apos;re not on the table yet — <Link href="/matches" className="text-lime underline">enter a match</Link> to get your first points.
          </p>
        )}
      </section>

      {t.rows.length === 0 ? (
        <p className="panel p-5 text-sm text-muted">The table starts once the first gameweek kicks off.</p>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
          <div className="grid grid-cols-[3rem_1fr_3.5rem_4.5rem] items-center gap-2 border-b border-ink-700 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
            <span>#</span>
            <span>Manager</span>
            <span className="text-right">GW{t.gameweek}</span>
            <span className="text-right">Total</span>
          </div>
          <ol>
            {t.rows.map((r) => (
              <TableRow key={r.userId} r={r} me={r.userId === user?.id} />
            ))}
            {t.me && !meShown && (
              <>
                <li className="px-4 py-1 text-center text-faint" aria-hidden="true">⋯</li>
                <TableRow r={t.me} me />
              </>
            )}
          </ol>
        </section>
      )}
      <p className="text-xs text-faint">Top 100 shown. Mini-leagues with your friends are on <Link href="/leagues" className="underline">Mini-leagues</Link>.</p>
    </div>
  );
}

function TableRow({ r, me }: { r: Row; me: boolean }) {
  const medal = r.rank === 1 ? "text-gold" : r.rank === 2 ? "text-silver" : r.rank === 3 ? "text-bronze" : "text-muted";
  return (
    <li className={`grid grid-cols-[3rem_1fr_3.5rem_4.5rem] items-center gap-2 border-b border-ink-800 px-4 py-2.5 last:border-0 ${me ? "bg-accent/10" : ""}`}>
      <span className={`font-display text-xl font-black tabular-nums ${medal}`}>{r.rank}</span>
      <Link href={`/clubs/${encodeURIComponent(r.name)}`} className="flex min-w-0 items-center gap-2 hover:underline">
        <ManagerBadge crest={r.crest} name={r.name} id={`mega-${r.userId}`} size={28} />
        <span className="min-w-0">
          <span className="block truncate font-semibold">
            {r.name} <FoundingBadge number={r.foundingNumber} compact />
            {me && <span className="ml-1 text-xs text-lime">you</span>}
          </span>
          {r.clubName && <span className="block truncate text-xs text-faint">{r.clubName}</span>}
        </span>
      </Link>
      <span className="text-right tabular-nums text-muted">{r.gw ?? "–"}</span>
      <span className="text-right font-display text-xl font-black tabular-nums">{r.total}</span>
    </li>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{label}</p>
      <p className={`font-display text-4xl font-black italic leading-none tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
