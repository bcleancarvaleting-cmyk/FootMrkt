/**
 * Prove the Sportmonks connection against real data before switching DATA_PROVIDER=sportmonks.
 * Read-only: it changes nothing in the database. About 15 API calls.
 *
 *   npm run sportmonks:check
 *
 * Checks: the account and leagues, each league's current season and club count, a squad, and the
 * last week's finished matches — every match's player goals (plus own goals) must add up to the
 * final score, starters must have minutes, and each side's keeper must have conceded what the
 * other side scored. Prints a sample match breakdown to eyeball against the real result.
 */
import "dotenv/config";
import { getScoringRules, CURRENT_SCORING_RULES, scorePlayer, toStatLine } from "../src/domain/football/scoring";
import { messagesForFixture } from "../src/providers/football/api-football";
import { FIXTURE_INCLUDES, SPORTMONKS_LEAGUES, type SmFixture, smGet, toSharedFixture } from "../src/providers/football/sportmonks";
import { sportmonksSeasonId } from "../src/server/live-data";

const EXPECTED_CLUBS: Record<string, number> = { EPL: 20, CHA: 24, LG1: 24, LG2: 24 };
let failures = 0;
let warnings = 0;
const ok = (m: string) => console.log(`  ✓ ${m}`);
const warn = (m: string) => (warnings++, console.log(`  ! ${m}`));
const fail = (m: string) => (failures++, console.log(`  ✗ ${m}`));

async function main() {
  console.log("1. Account and leagues");
  // On a plan, "all leagues" lists just the leagues the plan covers.
  const mine = await smGet<{ id: number; name: string }>("/leagues");
  for (const [code, id] of Object.entries(SPORTMONKS_LEAGUES)) {
    if (mine.some((l) => l.id === id)) ok(`${code} (league ${id}) is on the plan`);
    else fail(`${code} (league ${id}) is not on the plan`);
  }

  console.log("2. Seasons, clubs and a squad");
  let sampleTeam: { id: number; name: string } | null = null;
  for (const [code, id] of Object.entries(SPORTMONKS_LEAGUES)) {
    const seasonId = await sportmonksSeasonId(id);
    const teams = await smGet<{ id: number; name: string }>(`/teams/seasons/${seasonId}`);
    if (teams.length === EXPECTED_CLUBS[code]) ok(`${code}: season ${seasonId}, ${teams.length} clubs`);
    else fail(`${code}: season ${seasonId} has ${teams.length} clubs (expected ${EXPECTED_CLUBS[code]})`);
    if (code === "LG2") sampleTeam = teams.find((t) => /gillingham/i.test(t.name)) ?? teams[0];
  }
  if (sampleTeam) {
    const squad = await smGet<{ player_id: number; position_id?: number | null; player?: { display_name?: string } }>(`/squads/teams/${sampleTeam.id}`, { include: "player" });
    if (squad.length >= 18) ok(`${sampleTeam.name} squad: ${squad.length} players (e.g. ${squad.slice(0, 4).map((s) => s.player?.display_name).join(", ")})`);
    else fail(`${sampleTeam.name} squad: only ${squad.length} players`);
    if (squad.some((s) => !s.position_id)) warn(`${squad.filter((s) => !s.position_id).length} squad players have no position`);
  }

  console.log("3. Last week's finished matches");
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const listed = await smGet<SmFixture>(`/fixtures/between/${iso(from)}/${iso(to)}`, { filters: `fixtureLeagues:${Object.values(SPORTMONKS_LEAGUES).join(",")}`, include: "state" });
  const finished = listed.filter((f) => ["FT", "AET", "FT_PEN"].includes(f.state?.developer_name ?? ""));
  if (!finished.length) return fail("no finished matches in the last 7 days to check");
  ok(`${finished.length} finished matches found`);
  const full: SmFixture[] = [];
  for (let i = 0; i < Math.min(finished.length, 50); i += 25) {
    full.push(...(await smGet<SmFixture>(`/fixtures/multi/${finished.slice(i, i + 25).map((f) => f.id).join(",")}`, { include: FIXTURE_INCLUDES })));
  }
  let good = 0;
  const rules = getScoringRules(CURRENT_SCORING_RULES);
  for (const raw of full) {
    const f = toSharedFixture(raw);
    const label = `${f.teams.home.name} ${f.goals.home}-${f.goals.away} ${f.teams.away.name}`;
    const msgs = messagesForFixture(f);
    type Line = { id: number; minutes: number; goals: number; assists: number; ownGoals: number; goalsConceded: number; saves: number; yellowCards: number; redCards: number };
    const lines: Line[] = msgs.filter((m) => m.kind === "PLAYER_STATS").map((m) => ({ ...(m.payload as Omit<Line, "id">), id: Number(m.playerRef) }));
    if (!lines.length) {
      fail(`${label}: no player line-ups/stats`);
      continue;
    }
    const teamOf = new Map(f.players!.flatMap((t) => t.players.map((p) => [p.player.id, t.team.id] as const)));
    const scored = (team: number, other: number) =>
      lines.filter((l) => teamOf.get(l.id) === team).reduce((n, l) => n + l.goals, 0) + lines.filter((l) => teamOf.get(l.id) === other).reduce((n, l) => n + l.ownGoals, 0);
    const problems: string[] = [];
    if (scored(f.teams.home.id, f.teams.away.id) !== f.goals.home) problems.push(`home player goals ${scored(f.teams.home.id, f.teams.away.id)} ≠ ${f.goals.home}`);
    if (scored(f.teams.away.id, f.teams.home.id) !== f.goals.away) problems.push(`away player goals ${scored(f.teams.away.id, f.teams.home.id)} ≠ ${f.goals.away}`);
    const starters = new Set(f.lineups!.flatMap((l) => l.startXI.map((s) => s.player.id)));
    const noMinutes = lines.filter((l) => starters.has(l.id) && !l.minutes).length;
    if (noMinutes) problems.push(`${noMinutes} starters without minutes`);
    for (const [team, against] of [[f.teams.home.id, f.goals.away], [f.teams.away.id, f.goals.home]] as const) {
      const fullGame = lines.filter((l) => teamOf.get(l.id) === team && l.minutes >= 90);
      if (fullGame.length && against !== null && !fullGame.some((l) => l.goalsConceded === against)) problems.push(`no full-game player conceded ${against}`);
    }
    if (problems.length) fail(`${label}: ${problems.join("; ")}`);
    else good++;
    if (raw === full[0]) {
      console.log(`\n  Sample — ${label} (check against the real match):`);
      for (const l of lines.filter((x) => x.minutes > 0).slice(0, 14)) {
        const pos = (f.players!.flatMap((t) => t.players).find((p) => p.player.id === l.id)?.statistics[0]?.games?.position as string) ?? "MID";
        const pts = scorePlayer(rules, (["GK", "DEF", "MID", "ATT"].includes(pos) ? pos : "MID") as "MID", [toStatLine(l)]).points;
        const name = f.players!.flatMap((t) => t.players).find((p) => p.player.id === l.id)?.player.name;
        console.log(`    ${String(name).padEnd(24)} ${String(l.minutes).padStart(3)}' G${l.goals} A${l.assists} conceded ${l.goalsConceded}${l.saves ? ` saves ${l.saves}` : ""}${l.yellowCards ? " YC" : ""}${l.redCards ? " RC" : ""} → ${pts} pts`);
      }
      console.log("");
    }
  }
  ok(`${good} of ${full.length} matches add up exactly`);
}

main()
  .then(() => {
    console.log(`\nResult: ${failures ? `${failures} problem(s)` : "all checks passed"}${warnings ? `, ${warnings} warning(s)` : ""}.`);
    process.exitCode = failures ? 1 : 0;
  })
  .catch((e) => {
    console.error(`\n✗ Could not reach Sportmonks: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  });
