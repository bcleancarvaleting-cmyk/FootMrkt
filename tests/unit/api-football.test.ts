import { describe, expect, it } from "vitest";
import { type AfFixture, fixtureStatus, matchPlayer, messagesForFixture } from "@/providers/football/api-football";

const ev = (min: number, team: number, type: string, detail: string, player: number | null, assist: number | null = null) => ({
  time: { elapsed: min, extra: null },
  team: { id: team },
  player: { id: player },
  assist: { id: assist },
  type,
  detail,
});
const stat = (id: number, minutes: number, extra: Record<string, unknown> = {}) => ({ player: { id, name: `P${id}` }, statistics: [{ games: { minutes }, ...extra }] });

// Home (1) 2-1 Away (2): home goal 10', away own goal 30' (filed under away), away goal 70'.
// Home keeper 11 plays 90; home defender 12 subbed off 60' for 13; away 21 sent off 50'.
const fixture: AfFixture = {
  fixture: { id: 999, date: "2026-11-14T15:00:00Z", status: { short: "FT" } },
  teams: { home: { id: 1, name: "Home" }, away: { id: 2, name: "Away" } },
  goals: { home: 2, away: 1 },
  lineups: [
    { team: { id: 1 }, startXI: [{ player: { id: 11 } }, { player: { id: 12 } }] },
    { team: { id: 2 }, startXI: [{ player: { id: 21 } }, { player: { id: 22 } }] },
  ],
  events: [
    ev(10, 1, "Goal", "Normal Goal", 12, 11),
    ev(30, 2, "Goal", "Own Goal", 22),
    ev(50, 2, "Card", "Red Card", 21),
    ev(60, 1, "subst", "Substitution 1", 12, 13),
    ev(70, 2, "Goal", "Normal Goal", 22),
  ],
  players: [
    { team: { id: 1 }, players: [stat(11, 90, { goals: { saves: 3, assists: 1 } }), stat(12, 60, { goals: { total: 1 }, tackles: { total: 4 } }), stat(13, 30)] },
    { team: { id: 2 }, players: [stat(21, 50, { cards: { red: 1 } }), stat(22, 90, { goals: { total: 1 } })] },
  ],
};

describe("API-Football adapter", () => {
  const msgs = messagesForFixture(fixture);
  const line = (id: number) => msgs.find((m) => m.playerRef === String(id))!.payload as Record<string, number>;

  it("reports the result", () => {
    expect(msgs[0]).toMatchObject({ kind: "FIXTURE_RESULT", payload: { status: "FINISHED", home: 2, away: 1 } });
  });
  it("counts goals conceded only while each player was on the pitch", () => {
    expect(line(11).goalsConceded).toBe(1); // the 70' goal
    expect(line(12).goalsConceded).toBe(0); // off at 60'
    expect(line(13).goalsConceded).toBe(1); // on at 60'
    expect(line(21).goalsConceded).toBe(2); // sent off at 50': the 10' goal and the 30' own goal both count
    expect(line(22).goalsConceded).toBe(2);
  });
  it("credits own goals and the other stats", () => {
    expect(line(22).ownGoals).toBe(1);
    expect(line(12)).toMatchObject({ goals: 1, tackles: 4, minutes: 60 });
    expect(line(11)).toMatchObject({ saves: 3, assists: 1 });
    expect(line(21).redCards).toBe(1);
  });
  it("re-polling the same numbers gives the same event ids (ignored as duplicates)", () => {
    const again = messagesForFixture(fixture);
    expect(again.map((m) => m.providerEventId)).toEqual(msgs.map((m) => m.providerEventId));
  });
  it("maps status codes", () => {
    expect(fixtureStatus("NS")).toBe("SCHEDULED");
    expect(fixtureStatus("2H")).toBe("LIVE");
    expect(fixtureStatus("PEN")).toBe("FINISHED");
    expect(fixtureStatus("PST")).toBe("POSTPONED");
    expect(fixtureStatus("ABD")).toBe("ABANDONED");
  });
  it("matches player names across accents and initials", () => {
    const squad = [{ displayName: "Martin Ødegaard" }, { displayName: "Ben White" }, { displayName: "Kieran Tierney" }, { displayName: "Ben Jones" }, { displayName: "Ashley Jones" }];
    expect(matchPlayer("M. Odegaard", squad)?.displayName).toBe("Martin Ødegaard");
    expect(matchPlayer("Ben White", squad)?.displayName).toBe("Ben White");
    expect(matchPlayer("B. Jones", squad)?.displayName).toBe("Ben Jones");
    expect(matchPlayer("C. Jones", squad)).toBeNull();
  });
});
