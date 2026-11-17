import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { currentSidelined } from "@/server/live-data";
import { realStartGuide } from "@/server/sim-lineups";
import { buildWorld, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("Real-game start guide: injuries and suspensions", () => {
  it("reads Sportmonks' sidelined list: current injury or suspension only", () => {
    const now = new Date("2026-11-17T12:00:00Z");
    expect(currentSidelined([], now)).toBeNull();
    expect(currentSidelined([{ completed: true, type: { name: "Hamstring Injury" } }], now)).toBeNull();
    expect(currentSidelined([{ start_date: "2026-10-01", end_date: "2026-11-01", completed: false, type: { name: "Knee Injury" } }], now)).toBeNull();
    expect(currentSidelined([{ start_date: "2026-11-10", end_date: "2026-12-05", completed: false, type: { name: "Hamstring Injury" } }], now)).toMatchObject({ kind: "INJURY", reason: "Hamstring Injury" });
    expect(currentSidelined([{ start_date: "2026-11-15", end_date: null, completed: false, category: "suspension", type: { name: "Red Card Suspension" } }], now)).toMatchObject({ kind: "SUSPENSION", until: null });
  });

  it("0% while out over the kick-off; back to normal once they're fit", async () => {
    const [a, b] = await db.player.findMany({ take: 2, orderBy: { displayName: "asc" } });
    const kickoff = new Date("2026-11-22T15:00:00Z");
    await db.player.update({ where: { id: a.id }, data: { sidelinedKind: "INJURY", sidelinedReason: "Ankle Injury", sidelinedUntil: new Date("2026-12-01T00:00:00Z") } });
    await db.player.update({ where: { id: b.id }, data: { sidelinedKind: "SUSPENSION", sidelinedReason: "Red Card Suspension", sidelinedUntil: new Date("2026-11-20T00:00:00Z") } });
    const g = await realStartGuide([a.id, b.id], kickoff);
    expect(g.get(a.id)).toMatchObject({ pct: 0, out: { kind: "INJURY", reason: "Ankle Injury" } });
    // The ban ends before kick-off: not ruled out.
    expect(g.get(b.id)?.out).toBeUndefined();
  });
});
