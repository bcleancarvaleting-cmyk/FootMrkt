import { describe, expect, it } from "vitest";
import { tierForValue } from "@/config/tiers";
import { toKit, ink } from "@/lib/kit";
import { weekKey, weekStart } from "@/lib/week";

describe("market value tiers", () => {
  it("maps values to Gold / Silver / Bronze at the thresholds", () => {
    expect(tierForValue(120_000_000)).toBe("GOLD");
    expect(tierForValue(20_000_000)).toBe("GOLD");
    expect(tierForValue(19_999_999)).toBe("SILVER");
    expect(tierForValue(2_000_000)).toBe("SILVER");
    expect(tierForValue(350_000)).toBe("BRONZE");
  });
});

describe("weekly pack week boundaries (UK time, Monday start)", () => {
  it("groups a whole week under its Monday", () => {
    expect(weekKey(new Date("2026-11-09T00:30:00Z"))).toBe("2026-11-09"); // Monday
    expect(weekKey(new Date("2026-11-15T23:30:00Z"))).toBe("2026-11-09"); // Sunday night
    expect(weekKey(new Date("2026-11-16T00:00:00Z"))).toBe("2026-11-16");
  });
  it("respects British Summer Time", () => {
    // Monday 00:30 BST is still Sunday 23:30 UTC.
    expect(weekKey(new Date("2026-07-05T23:30:00Z"))).toBe("2026-07-06");
    expect(weekStart(new Date("2026-07-08T12:00:00Z")).toISOString()).toBe("2026-07-05T23:00:00.000Z");
  });
});

describe("kit helpers", () => {
  it("falls back to club colours and picks readable ink", () => {
    expect(toKit({}, "#C8102E", "#FFFFFF")).toMatchObject({ body: "#C8102E", pattern: "plain" });
    expect(toKit({ pattern: "stripes", patternColour: "#111111", body: "#FFFFFF" }, "#000000", "#FFFFFF").pattern).toBe("stripes");
    expect(ink("#FFFFFF")).toBe("#111111");
    expect(ink("#14349B")).toBe("#FFFFFF");
  });
});
