import { describe, expect, it } from "vitest";
import { EMPTY_STAT_LINE } from "@/domain/football/scoring";
import { stampsFor } from "@/server/stamps";

const line = (patch: Partial<typeof EMPTY_STAT_LINE>) => ({ ...EMPTY_STAT_LINE, minutes: 90, ...patch });
const base = { position: "ATT", points: 6, captain: false, won: false };

describe("card history stamps", () => {
  it("stamps the big moments", () => {
    expect(stampsFor({ ...base, line: line({ goals: 3 }) })).toContain("HAT_TRICK");
    expect(stampsFor({ ...base, line: line({ goals: 2 }) })).toEqual(["BRACE"]);
    expect(stampsFor({ ...base, line: line({ assists: 2 }) })).toEqual(["PLAYMAKER"]);
    expect(stampsFor({ ...base, position: "DEF", line: line({ goalsConceded: 0 }) })).toEqual(["CLEAN_SHEET"]);
    expect(stampsFor({ ...base, position: "GK", line: line({ penaltySaves: 1, goalsConceded: 1 }) })).toEqual(["PEN_SAVE"]);
    expect(stampsFor({ ...base, points: 18, captain: true, line: line({ goals: 1 }) })).toEqual(["CAPTAIN_HAUL"]);
    expect(stampsFor({ ...base, points: 16, line: line({ goals: 1 }) })).toEqual(["BIG_HAUL"]);
    expect(stampsFor({ ...base, won: true, line: line({}) })).toEqual(["MATCH_WINNER"]);
  });

  it("doesn't stamp ordinary games, short clean sheets, or winners who didn't play", () => {
    expect(stampsFor({ ...base, line: line({ goals: 1 }) })).toEqual([]);
    expect(stampsFor({ ...base, position: "DEF", line: line({ minutes: 30 }) })).toEqual([]);
    expect(stampsFor({ ...base, position: "MID", line: line({}) })).toEqual([]);
    expect(stampsFor({ ...base, won: true, line: line({ minutes: 0 }) })).toEqual([]);
  });
});
