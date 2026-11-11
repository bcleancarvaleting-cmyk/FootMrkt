import { createLiveGameweekAction, linkClubsAction, linkPlayerAction, linkPlayersAction, syncLiveAction } from "@/app/actions/live";
import { ActionButton } from "@/components/action-button";
import { AdminForm, AdminInput } from "@/components/admin-forms";
import { fmtDate } from "@/lib/view";
import { API_FOOTBALL_NAME } from "@/providers/football/api-football";
import { db } from "@/server/db";
import { isEnabled } from "@/server/flags";
import { liveCoverage, unlinkedPlayers } from "@/server/live-data";
import { currentSeason, nextGameweekNumber } from "@/server/season";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Live match data" };

export default async function LiveDataAdmin() {
  const [cov, simulated, gameweeks, last, unlinked] = await Promise.all([
    liveCoverage(),
    isEnabled("SIMULATED_DATA"),
    db.gameweek.findMany({
      where: { status: { not: "SETTLED" }, fixtures: { some: { provider: API_FOOTBALL_NAME } } },
      orderBy: [{ season: "asc" }, { number: "asc" }],
      include: { _count: { select: { fixtures: true } }, fixtures: { where: { finalisedAt: { not: null } }, select: { id: true } } },
    }),
    currentSeason().then(async (season) => ({ season, number: (await nextGameweekNumber(season)) - 1 })),
    unlinkedPlayers(40),
  ]);
  const season = last.season;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  return (
    <>
      <AdminTitle
        title="Live match data"
        intro="Real fixtures and player stats from API-Football. Points, prizes and card values then work exactly as they do with the simulator."
      />

      <section className="panel space-y-2 p-5">
        <h2 className="font-display text-xl font-extrabold uppercase italic">Status</h2>
        {cov.configured ? (
          <p className="text-sm text-mint">Connected — API_FOOTBALL_KEY is set.</p>
        ) : (
          <p className="text-sm text-warn">
            Not connected. Sign up at api-football.com (the Pro plan covers all five English leagues), then add <code>API_FOOTBALL_KEY</code> to the server&apos;s environment and restart.
          </p>
        )}
        <p className="text-sm text-muted">
          Clubs linked: <b className="text-fg">{cov.linkedClubs}</b> of {cov.clubs} ({pct(cov.linkedClubs, cov.clubs)}%) · Players linked: <b className="text-fg">{cov.linkedPlayers}</b> of {cov.players} (
          {pct(cov.linkedPlayers, cov.players)}%)
        </p>
        {simulated && <p className="text-sm text-warn">Simulated data is still switched on. Turn off &ldquo;SIMULATED_DATA&rdquo; in Settings &amp; flags before launch.</p>}
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="font-display text-xl font-extrabold uppercase italic">1 · Link clubs</h2>
        <p className="text-sm text-muted">Matches our clubs to the provider&apos;s teams for the season. Run once a season, after promotions and relegations.</p>
        <AdminForm action={linkClubsAction} submit="Link clubs">
          <AdminInput name="season" label="Season" defaultValue={season} required />
        </AdminForm>
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="font-display text-xl font-extrabold uppercase italic">2 · Link players</h2>
        <p className="text-sm text-muted">Matches every linked club&apos;s squad by name. Re-run after the transfer window. One request per club.</p>
        <AdminForm action={linkPlayersAction} submit="Link players">
          <span className="text-xs text-faint sm:col-span-4">Uses {cov.linkedClubs} requests.</span>
        </AdminForm>
        {unlinked.length > 0 && (
          <details className="rounded-xl border border-ink-700 p-3">
            <summary className="cursor-pointer text-sm font-semibold">Not linked yet ({unlinked.length}{unlinked.length === 40 ? "+" : ""}, most valuable first) — link by hand</summary>
            <p className="mt-2 text-xs text-faint">Find the player&apos;s id on api-football.com (it&apos;s in the player URL) and paste it here.</p>
            <ul className="mt-2 divide-y divide-ink-800">
              {unlinked.map((p) => (
                <li key={p.id} className="py-2">
                  <AdminForm action={linkPlayerAction} submit="Link">
                    <input type="hidden" name="playerId" value={p.id} />
                    <p className="self-center text-sm">
                      {p.displayName} <span className="text-faint">· {p.club}</span>
                    </p>
                    <AdminInput name="providerId" label="API-Football id" inputMode="numeric" required />
                  </AdminForm>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="font-display text-xl font-extrabold uppercase italic">3 · Create a gameweek from real fixtures</h2>
        <p className="text-sm text-muted">Every league fixture between the two dates becomes part of the gameweek. Squads lock 10 minutes before the first kick-off.</p>
        <AdminForm action={createLiveGameweekAction} submit="Create gameweek">
          <AdminInput name="season" label="Season" defaultValue={season} required />
          <AdminInput name="number" label="Gameweek number" type="number" defaultValue={last.number + 1} required />
          <AdminInput name="from" label="First day" type="date" required />
          <AdminInput name="to" label="Last day" type="date" required />
        </AdminForm>
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="font-display text-xl font-extrabold uppercase italic">4 · Live gameweeks</h2>
        <p className="text-sm text-muted">Scores update automatically every time the scheduled job runs. You can also pull the latest now. Finalise the gameweek from Matches &amp; gameweeks once every result is in.</p>
        {gameweeks.length === 0 ? (
          <p className="text-sm text-faint">No live-data gameweeks yet.</p>
        ) : (
          <ul className="divide-y divide-ink-800">
            {gameweeks.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="text-sm">
                  <b>GW{g.number}</b> · {g.season} · {g.status.toLowerCase()} · {g.fixtures.length}/{g._count.fixtures} results final · starts {fmtDate(g.startsAt)}
                </span>
                <ActionButton action={syncLiveAction.bind(null, g.id)} className="btn-ghost px-4 py-2 text-xs">
                  Pull latest scores
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
