import Link from "next/link";
import { moveClubAction, movePlayerAction, startSeasonAction } from "@/app/actions/season";
import { AdminForm, AdminInput } from "@/components/admin-forms";
import { db } from "@/server/db";
import { currentSeason, seasonStandings } from "@/server/season";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Season" };

export default async function SeasonAdmin() {
  const season = await currentSeason();
  const [leagues, standings, unsettled, recent] = await Promise.all([
    db.league.findMany({ orderBy: { tier: "asc" }, include: { clubs: { orderBy: { name: "asc" }, select: { code: true, name: true } } } }),
    seasonStandings(season, 10),
    db.gameweek.count({ where: { season, status: { not: "SETTLED" } } }),
    db.adminAuditLog.findMany({ where: { action: { in: ["club.move", "player.move", "season.start"] } }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const y = Number(season.slice(0, 4)) + 1;
  const next = `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  const clubs = leagues.flatMap((l) => l.clubs.map((c) => ({ ...c, league: l.name })));
  return (
    <>
      <AdminTitle title="Season" intro={`Current season: ${season}. Cards, collections, levels and trophies carry over; the season table is frozen in the Hall of Fame when the next one starts.`} />

      <section className="panel space-y-2 p-5 text-sm text-muted">
        <h2 className="font-display text-xl font-extrabold uppercase italic text-fg">End-of-season checklist</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Settle the last gameweek (<Link href="/admin/matches" className="text-lime underline">Matches &amp; gameweeks</Link>). {unsettled ? <b className="text-warn">{unsettled} still open.</b> : <span className="text-mint">All settled.</span>}</li>
          <li>Move promoted and relegated clubs, and record summer transfers (below).</li>
          <li>Import new player values and re-tier (<Link href="/admin/values" className="text-lime underline">Player values</Link>) — a player whose value jumps becomes Gold.</li>
          <li>Start the new season (below).</li>
          <li>Re-link clubs and players for live data (<Link href="/admin/live-data" className="text-lime underline">Live match data</Link>), then create GW1.</li>
        </ol>
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="font-display text-xl font-extrabold uppercase italic">{season} table so far</h2>
        {standings.length === 0 ? (
          <p className="text-sm text-faint">No settled gameweeks yet.</p>
        ) : (
          <ol className="divide-y divide-ink-800 text-sm">
            {standings.map((s, i) => (
              <li key={s.userId} className="flex justify-between gap-3 py-1.5">
                <span>
                  <b className="mr-2 tabular-nums text-faint">{i + 1}</b>
                  {s.displayName} <span className="text-faint">· {s.wins} wins · {s.gameweeks} GWs</span>
                </span>
                <b className="tabular-nums">{s.points} pts</b>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="font-display text-xl font-extrabold uppercase italic">Promotion &amp; relegation</h2>
        <AdminForm action={moveClubAction} submit="Move club">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="mc-club">Club</label>
            <select id="mc-club" name="club" className="input">
              {clubs.map((c) => (
                <option key={c.code} value={c.code}>{c.name} · {c.league}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="mc-league">To league</label>
            <select id="mc-league" name="league" className="input">
              {leagues.map((l) => (
                <option key={l.code} value={l.code}>{l.name}</option>
              ))}
            </select>
          </div>
        </AdminForm>
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="font-display text-xl font-extrabold uppercase italic">Transfers</h2>
        <p className="text-sm text-muted">Moves a player to a new club. Every card of theirs follows them — owners keep the card, now showing the new club.</p>
        <AdminForm action={movePlayerAction} submit="Record transfer">
          <AdminInput name="player" label="Player (exact name)" required />
          <div className="sm:col-span-2">
            <label className="label" htmlFor="mp-club">New club</label>
            <select id="mp-club" name="club" className="input">
              <option value="LEFT">Left our leagues (cards stay collectable)</option>
              {clubs.map((c) => (
                <option key={c.code} value={c.code}>{c.name} · {c.league}</option>
              ))}
            </select>
          </div>
        </AdminForm>
      </section>

      <section className="panel space-y-3 border-warn/40 p-5">
        <h2 className="font-display text-xl font-extrabold uppercase italic">Start a new season</h2>
        <p className="text-sm text-muted">Freezes the {season} table in the Hall of Fame and restarts gameweek numbers at 1. Can&apos;t be undone.</p>
        <AdminForm action={startSeasonAction} submit="Start season">
          <AdminInput name="season" label="New season" defaultValue={next} required />
          <label className="flex items-center gap-2 self-end pb-3 text-sm text-muted sm:col-span-3">
            <input type="checkbox" name="confirm" className="accent-lime" /> Every {season} gameweek is settled and I&apos;m ready
          </label>
        </AdminForm>
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 text-xl font-bold">Recent changes</h2>
          <ul className="divide-y divide-ink-700 rounded-2xl border border-ink-700 bg-ink-900 text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 px-4 py-2">
                <span>{r.action} · {JSON.stringify(r.before)} → {JSON.stringify(r.after)}</span>
                <span className="text-xs text-faint">{r.createdAt.toLocaleDateString("en-GB")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
