import { describe, expect, it } from "vitest";
import { potTotal, splitPrizePot, projectedWins } from "@/domain/football/prizes";

const rules = [
  { rankFrom: 1, rankTo: 1, cashMinor: 1000 },
  { rankFrom: 2, rankTo: 2, cashMinor: 500 },
  { rankFrom: 3, rankTo: 3, cashMinor: 300 },
];
const s = (...totals: number[]) => totals.map((total, i) => ({ userId: `u${i}`, total }));

describe("prize pots", () => {
  it("pays 1st/2nd/3rd with no ties", () => {
    expect(Object.fromEntries(splitPrizePot(s(50, 40, 30, 20), rules))).toEqual({ u0: 1000, u1: 500, u2: 300 });
    expect(potTotal(rules)).toBe(1800);
  });

  it("ten managers joint top split the whole pot", () => {
    const out = splitPrizePot(s(...Array(10).fill(60), 10), rules);
    expect(out.size).toBe(10);
    expect([...out.values()].every((v) => v === 180)).toBe(true);
  });

  it("joint 2nd share 2nd and 3rd prizes; joint 1st share 1st and 2nd", () => {
    expect(Object.fromEntries(splitPrizePot(s(50, 40, 40, 10), rules))).toEqual({ u0: 1000, u1: 400, u2: 400 });
    expect(Object.fromEntries(splitPrizePot(s(50, 50, 30), rules))).toEqual({ u0: 750, u1: 750, u2: 300 });
  });

  it("rounds down to the penny and never pays more than the pot", () => {
    const out = splitPrizePot(s(9, 9, 9), [{ rankFrom: 1, rankTo: 1, cashMinor: 1000 }]);
    expect([...out.values()]).toEqual([333, 333, 333]);
  });
});

describe("projectedWins (live table: if it ended now)", () => {
  it("shows the whole pot on the leader, split evenly when tied, and a pack for everyone tied on a pack place", () => {
    const rules = [{ rankFrom: 1, rankTo: 1, cashMinor: 2000 }, { rankFrom: 1, rankTo: 1, pack: "Gold pack" }];
    const solo = projectedWins([{ userId: "a", points: 30, rank: 1 }, { userId: "b", points: 20, rank: 2 }], rules);
    expect(solo.get("a")).toEqual({ cashMinor: 2000, packs: ["Gold pack"] });
    expect(solo.has("b")).toBe(false);
    const tied = projectedWins([{ userId: "a", points: 30, rank: 1 }, { userId: "b", points: 30, rank: 1 }, { userId: "c", points: 10, rank: 3 }], rules);
    expect(tied.get("a")).toEqual({ cashMinor: 1000, packs: ["Gold pack"] });
    expect(tied.get("b")).toEqual({ cashMinor: 1000, packs: ["Gold pack"] });
    expect(tied.has("c")).toBe(false);
  });
});
