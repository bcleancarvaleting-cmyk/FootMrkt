import { describe, expect, it } from "vitest";
import { messagesForFixture } from "@/providers/football/api-football";
import { type SmFixture, positionOf, stateShort, toSharedFixture } from "@/providers/football/sportmonks";

const t = (developer_name: string) => ({ developer_name });
const d = (name: string, value: number) => ({ type: t(name), data: { value } });

// Home (1) 2-1 Away (2): home goal 10' (12 scores, 11 assists), away own goal 30' (22), away red 50' (21),
// sub 60' (13 on for 12), away goal 70' (22).
function fixture(subOrder: "in-first" | "out-first"): SmFixture {
  return {
    id: 999,
    starting_at: "2026-11-08 15:00:00",
    state: t("FT"),
    participants: [
      { id: 1, name: "Home", meta: { location: "home" } },
      { id: 2, name: "Away", meta: { location: "away" } },
    ],
    scores: [
      { participant_id: 1, description: "1ST_HALF", score: { goals: 2, participant: "home" } },
      { participant_id: 1, description: "CURRENT", score: { goals: 2, participant: "home" } },
      { participant_id: 2, description: "CURRENT", score: { goals: 1, participant: "away" } },
    ],
    lineups: [
      { player_id: 11, team_id: 1, type: t("LINEUP"), details: [d("MINUTES_PLAYED", 90), d("SAVES", 3), d("ASSISTS", 1)] },
      { player_id: 12, team_id: 1, type: t("LINEUP"), details: [d("MINUTES_PLAYED", 60), d("GOALS", 1), d("TACKLES", 4)] },
      { player_id: 13, team_id: 1, type: t("BENCH"), details: [d("MINUTES_PLAYED", 30)] },
      { player_id: 21, team_id: 2, type: t("LINEUP"), details: [d("MINUTES_PLAYED", 50), d("REDCARDS", 1)] },
      { player_id: 22, team_id: 2, type: t("LINEUP"), details: [d("MINUTES_PLAYED", 90), d("GOALS", 1)] },
    ],
    events: [
      { type: t("GOAL"), participant_id: 1, player_id: 12, related_player_id: 11, minute: 10 },
      { type: t("OWNGOAL"), participant_id: 1, player_id: 22, minute: 30 },
      { type: t("REDCARD"), participant_id: 2, player_id: 21, minute: 50 },
      subOrder === "in-first"
        ? { type: t("SUBSTITUTION"), participant_id: 1, player_id: 13, related_player_id: 12, minute: 60 }
        : { type: t("SUBSTITUTION"), participant_id: 1, player_id: 12, related_player_id: 13, minute: 60 },
      { type: t("GOAL"), participant_id: 2, player_id: 22, minute: 70 },
    ],
  };
}

describe("Sportmonks adapter", () => {
  for (const order of ["in-first", "out-first"] as const) {
    it(`scores a match correctly whichever way round the substitution is given (${order})`, () => {
      const msgs = messagesForFixture(toSharedFixture(fixture(order)));
      const line = (id: number) => msgs.find((m) => m.playerRef === String(id))!.payload as Record<string, number>;
      expect(msgs[0]).toMatchObject({ kind: "FIXTURE_RESULT", payload: { status: "FINISHED", home: 2, away: 1 } });
      expect(line(11)).toMatchObject({ minutes: 90, saves: 3, assists: 1, goalsConceded: 1 });
      expect(line(12)).toMatchObject({ minutes: 60, goals: 1, tackles: 4, goalsConceded: 0 });
      expect(line(13)).toMatchObject({ minutes: 30, goalsConceded: 1 });
      expect(line(21)).toMatchObject({ redCards: 1, goalsConceded: 2 });
      expect(line(22)).toMatchObject({ goals: 1, ownGoals: 1, goalsConceded: 2 });
    });
  }

  it("maps match states and positions", () => {
    expect(stateShort({ developer_name: "FT" })).toBe("FT");
    expect(stateShort({ developer_name: "FT_PEN" })).toBe("PEN");
    expect(stateShort({ developer_name: "INPLAY_2ND_HALF" })).toBe("LIVE");
    expect(stateShort({ developer_name: "HT" })).toBe("LIVE");
    expect(stateShort({ developer_name: "POSTPONED" })).toBe("PST");
    expect(stateShort({ developer_name: "NS" })).toBe("NS");
    expect(positionOf({ position_id: 24 })).toBe("GK");
    expect(positionOf({ position: { developer_name: "MIDFIELDER" } })).toBe("MID");
    expect(positionOf({ position_id: 27 })).toBe("ATT");
  });
});
