import Link from "next/link";
import { cancelPlayerDropAction } from "@/app/actions/economy";
import { ActionButton } from "@/components/action-button";
import { DropScheduler } from "@/components/drop-scheduler";
import { playerDatabase, upcomingDropsAdmin } from "@/server/player-drops";
import { type PerformanceWindow, WINDOW_LABEL, performanceTable } from "@/server/top-performers";
import { fmtMp } from "@/server/wallet";
import { fmtDate } from "@/lib/view";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Player database" };

type SP = { q?: string; league?: string; tier?: string; sort?: string; form?: string };

export default async function PlayersAdmin({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const window: PerformanceWindow = sp.form === "last" || sp.form === "season" ? sp.form : "5";
  const byPoints = sp.sort === "points";
  const [dbRows, drops, perf] = await Promise.all([playerDatabase({ ...sp, take: byPoints ? 5000 : 150 }), upcomingDropsAdmin(), performanceTable({ window })]);
  const points = new Map(perf.map((r) => [r.playerId, r.points]));
  // Top performer per league: the best scorer in the window who isn't already on a drop.
  const topIds = new Map<string, string>(); // league -> playerId
  const topCandidates = [...new Set(["EPL", "CHA", "LG1", "LG2"].flatMap((l) => perf.filter((r) => r.league === l).slice(0, 6).map((r) => r.playerId)))];
  const candidateRows = await playerDatabase({ ids: topCandidates, take: 100 });
  for (const r of perf) {
    if (!r.league || topIds.has(r.league)) continue;
    if (candidateRows.some((c) => c.playerId === r.playerId && !c.onDrop)) topIds.set(r.league, r.playerId);
  }
  const topOf = new Map([...topIds].map(([l, id]) => [id, l]));
  const withPoints = <T extends { playerId: string }>(r: T) => ({ ...r, points: points.get(r.playerId) ?? null, topOf: topOf.get(r.playerId) ?? null });
  let rows = dbRows.map(withPoints);
  if (byPoints) rows = rows.sort((a, b) => (b.points ?? -1e9) - (a.points ?? -1e9)).slice(0, 150);
  const tops = ["EPL", "CHA", "LG1", "LG2"].flatMap((l) => candidateRows.filter((c) => c.playerId === topIds.get(l)).map(withPoints));
  const now = new Date();
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
    return `/admin/players${p.size ? `?${p}` : ""}`;
  };
  return (
    <>
      <AdminTitle title="Player database & drops" intro="Every player's supply in their current tier. Tick players to release them as daily drops: one new copy each, a set price, live from a set time with no end." />
      <form action="/admin/players" className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Search player or club" className="input max-w-xs" />
        {(["EPL", "CHA", "LG1", "LG2"] as const).map((l) => (
          <Link key={l} href={qs({ league: sp.league === l ? undefined : l })} className={`chip ${sp.league === l ? "border-accent text-fg" : ""}`}>
            {l}
          </Link>
        ))}
        <span className="mx-1 w-px self-stretch bg-ink-700" />
        {(["GOLD", "SILVER", "BRONZE"] as const).map((t) => (
          <Link key={t} href={qs({ tier: sp.tier === t ? undefined : t })} className={`chip ${sp.tier === t ? "border-accent text-fg" : ""}`}>
            {t[0] + t.slice(1).toLowerCase()}
          </Link>
        ))}
        <span className="mx-1 w-px self-stretch bg-ink-700" />
        {[
          ["", "By value"],
          ["pct_asc", "Least circulated"],
          ["pct_desc", "Most circulated"],
          ["points", "Top performers"],
          ["name", "A–Z"],
        ].map(([k, l]) => (
          <Link key={l} href={qs({ sort: k || undefined })} className={`chip ${(sp.sort ?? "") === k ? "border-accent text-fg" : ""}`}>
            {l}
          </Link>
        ))}
      </form>
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
        Points from
        {(["last", "5", "season"] as const).map((w) => (
          <Link key={w} href={qs({ form: w === "5" ? undefined : w })} className={`chip ${window === w ? "border-accent text-fg" : ""}`}>
            {WINDOW_LABEL[w]}
          </Link>
        ))}
        <span>· ★ = top performer in that league not already on a drop</span>
      </p>
      <DropScheduler rows={rows} tops={tops} pointsLabel={WINDOW_LABEL[window]} />
      <section className="panel p-5">
        <h2 className="mb-3 text-2xl">Scheduled & live drops · {drops.length}</h2>
        <ul className="divide-y divide-ink-700 text-sm">
          {drops.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span>
                <b>{d.card.template.player.displayName}</b>{" "}
                <span className="text-faint">
                  · {d.card.template.player.club?.name} · {d.card.template.category.toLowerCase()} · {fmtMp(d.askingPriceMinor)} · {d.liveAt && d.liveAt > now ? `goes live ${fmtDate(d.liveAt)}` : "live now"}
                </span>
              </span>
              <ActionButton action={cancelPlayerDropAction.bind(null, d.id)} className="btn-ghost px-3 py-1.5 text-[11px]" confirm="Withdraw this drop?">
                Withdraw
              </ActionButton>
            </li>
          ))}
          {!drops.length && <li className="py-2 text-faint">No drops scheduled.</li>}
        </ul>
      </section>
    </>
  );
}
