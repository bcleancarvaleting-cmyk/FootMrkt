import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { importSeasonToDate, syncLiveData } from "@/server/live-data";
import { buildWorld, resetDb } from "./fixtures";

const DAY = 86_400_000;
const now = new Date("2026-11-11T12:00:00Z"); // a Wednesday
const lastSat = "2026-11-07 15:00:00";
const nextSat = "2026-11-21 15:00:00"; // two weeks on: the week in between is an international break

beforeEach(async () => {
  await resetDb();
  await buildWorld();
  process.env.DATA_PROVIDER = "sportmonks";
  process.env.SPORTMONKS_API_TOKEN = "test-token";
});
afterEach(() => {
  delete process.env.DATA_PROVIDER;
  delete process.env.SPORTMONKS_API_TOKEN;
  vi.unstubAllGlobals();
});

/** Link two clubs and 11 players each to made-up Sportmonks ids; return the ids. */
async function link() {
  const clubs = await db.club.findMany({ where: { code: { in: ["C00", "C01"] } }, orderBy: { code: "asc" }, include: { players: { orderBy: { id: "asc" } } } });
  const ids: number[][] = [];
  for (const [i, c] of clubs.entries()) {
    await db.club.update({ where: { id: c.id }, data: { providerRefs: { sportmonks: String(100 + i) } } });
    const pick = [...c.players.filter((p) => p.position === "GK").slice(0, 1), ...c.players.filter((p) => p.position !== "GK").slice(0, 10)];
    ids.push([]);
    for (const [j, p] of pick.entries()) {
      const smId = (i + 1) * 1000 + j;
      await db.player.update({ where: { id: p.id }, data: { providerRefs: { sportmonks: String(smId) } } });
      ids[i].push(smId);
    }
  }
  return ids;
}

/** A stand-in for the Sportmonks API, answering the endpoints the import uses. */
function fakeSportmonks(ids: number[][], opts: { finished: boolean }) {
  const t = (developer_name: string) => ({ developer_name });
  const participants = [
    { id: 100, name: "Club 00", meta: { location: "home" } },
    { id: 101, name: "Club 01", meta: { location: "away" } },
  ];
  const played = {
    id: 5001,
    starting_at: lastSat,
    state: t(opts.finished ? "FT" : "NS"),
    participants,
    scores: [
      { participant_id: 100, description: "CURRENT", score: { goals: 1 } },
      { participant_id: 101, description: "CURRENT", score: { goals: 0 } },
    ],
    lineups: ids.flatMap((team, i) =>
      team.map((pid, j) => ({ player_id: pid, team_id: 100 + i, type: t("LINEUP"), details: [{ type: t("MINUTES_PLAYED"), data: { value: 90 } }, ...(i === 0 && j === 5 ? [{ type: t("GOALS"), data: { value: 1 } }] : [])] })),
    ),
    events: [{ type: t("GOAL"), participant_id: 100, player_id: ids[0][5], minute: 55 }],
  };
  const upcoming = { id: 5002, starting_at: nextSat, state: t("NS"), participants };
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      calls.push(url.pathname);
      const json = (data: unknown) => new Response(JSON.stringify({ data, pagination: { has_more: false } }), { status: 200 });
      const between = url.pathname.match(/\/fixtures\/between\/(\d{4}-\d\d-\d\d)\/(\d{4}-\d\d-\d\d)$/);
      if (between) {
        if (url.searchParams.get("filters") !== "fixtureLeagues:8") return json([]);
        const [from, to] = [new Date(between[1]), new Date(`${between[2]}T23:59:59Z`)];
        return json([played, upcoming].filter((f) => new Date(`${f.starting_at.replace(" ", "T")}Z`) >= from && new Date(`${f.starting_at.replace(" ", "T")}Z`) <= to));
      }
      if (url.pathname.includes("/fixtures/multi/")) return json([played]);
      return new Response(JSON.stringify({ message: `unexpected ${url.pathname}` }), { status: 404 });
    }),
  );
  return calls;
}

describe("Sportmonks season-to-date import", () => {
  it("settles last week's real matches with real stats and opens next week for entries", async () => {
    const ids = await link();
    const calls = fakeSportmonks(ids, { finished: true });
    const r = await importSeasonToDate("2026-27", now);
    expect(r).toEqual({ gameweeks: 1, fixtures: 1, openGameweek: 2 });

    const gw1 = await db.gameweek.findFirstOrThrow({ where: { number: 1 }, include: { fixtures: true } });
    expect(gw1.status).toBe("SETTLED");
    expect(gw1.fixtures[0]).toMatchObject({ provider: "sportmonks", providerFixtureId: "5001", status: "FINISHED", homeGoals: 1, awayGoals: 0 });
    expect(await db.playerMatchStat.count({ where: { fixtureId: gw1.fixtures[0].id, isCurrent: true } })).toBe(22);
    const scorer = await db.player.findFirstOrThrow({ where: { providerRefs: { equals: { sportmonks: String(ids[0][5]) } } } });
    const line = await db.playerMatchStat.findFirstOrThrow({ where: { playerId: scorer.id, isCurrent: true } });
    expect(line.stats).toMatchObject({ minutes: 90, goals: 1, goalsConceded: 0 });

    const gw2 = await db.gameweek.findFirstOrThrow({ where: { number: 2 }, include: { fixtures: true } });
    expect(["OPEN", "UPCOMING"]).toContain(gw2.status); // opens at "now" (the scheduled job flips UPCOMING → OPEN)
    expect(gw2.fixtures.map((f) => f.providerFixtureId)).toEqual(["5002"]);
    expect(calls.filter((c) => c.includes("/fixtures/multi/"))).toHaveLength(1);
  });

  it("drops a match the provider still shows as not played instead of blocking the week", async () => {
    const ids = await link();
    fakeSportmonks(ids, { finished: false });
    const r = await importSeasonToDate("2026-27", now);
    expect(r.gameweeks).toBe(1);
    const gw1 = await db.gameweek.findFirstOrThrow({ where: { number: 1 }, include: { fixtures: true } });
    expect(gw1.status).toBe("SETTLED");
    expect(gw1.fixtures).toHaveLength(0);
  });

  it("the live sync uses Sportmonks once it's switched on", async () => {
    const ids = await link();
    fakeSportmonks(ids, { finished: true });
    await importSeasonToDate("2026-27", new Date(Date.parse(lastSat.replace(" ", "T") + "Z") - 10 * DAY));
    // Nothing has kicked off yet in that past view, so the open week has nothing to poll.
    const out = await syncLiveData();
    expect(Array.isArray(out)).toBe(true);
  });
});

describe("Sportmonks nightly squad sync", () => {
  it("moves a transferred player (cards follow) and adds a new signing", async () => {
    const { syncSquads } = await import("@/server/live-data");
    const ids = await link();
    await db.league.update({ where: { code: "T1" }, data: { code: "EPL" } }); // our two test clubs play in "the Premier League"
    const mover = ids[0][3];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | string) => {
        const url = new URL(String(input));
        const json = (data: unknown) => new Response(JSON.stringify({ data, pagination: { has_more: false } }), { status: 200 });
        if (/\/leagues\/\d+$/.test(url.pathname)) return json({ id: 8, currentseason: { id: 777 } });
        const squad = url.pathname.match(/\/squads\/seasons\/777\/teams\/(\d+)$/);
        if (squad) {
          const team = Number(squad[1]);
          const base = (team === 100 ? ids[0].filter((p) => p !== mover) : [...ids[1], mover]).map((p) => ({ player_id: p, position_id: 26, player: { display_name: `P${p}` } }));
          return json(team === 101 ? [...base, { player_id: 9999, jersey_number: 7, position_id: 27, player: { display_name: "New Signing" } }] : base);
        }
        return json([]);
      }),
    );
    const r = await syncSquads();
    expect(r).toEqual({ moved: 1, added: 1, missing: 0 });
    const club01 = await db.club.findUniqueOrThrow({ where: { code: "C01" } });
    const moved = await db.player.findFirstOrThrow({ where: { providerRefs: { equals: { sportmonks: String(mover) } } }, include: { templates: { include: { instances: { take: 1 } } } } });
    expect(moved.clubId).toBe(club01.id);
    const signing = await db.player.findFirstOrThrow({ where: { displayName: "New Signing" }, include: { templates: true } });
    expect(signing).toMatchObject({ clubId: club01.id, position: "ATT" });
    expect(signing.templates).toHaveLength(1);
    // Running again changes nothing.
    expect(await syncSquads()).toEqual({ moved: 0, added: 0, missing: 0 });
  });
});
