import { describe, expect, it } from "vitest";
import { CrestSchema, initialsFor, suggestedCrests, toCrest } from "@/lib/crest";

describe("club crests", () => {
  it("makes initials from a club name", () => {
    expect(initialsFor("Hackney Wanderers FC")).toBe("HW");
    expect(initialsFor("AFC Real Madrid Thursday")).toBe("RMT");
    expect(initialsFor("Rovers")).toBe("RO");
  });

  it("offers 8 different, valid starting designs, the same every time for a name", () => {
    const a = suggestedCrests("Hackney Wanderers");
    expect(a).toHaveLength(8);
    expect(a.every((c) => CrestSchema.safeParse(c).success)).toBe(true);
    expect(new Set(a.map((c) => `${c.shape}-${c.pattern}-${c.primary}-${c.emblem}`)).size).toBe(8);
    expect(suggestedCrests("Hackney Wanderers")).toEqual(a);
    expect(suggestedCrests("Peckham Rye")).not.toEqual(a);
  });

  it("rejects designs outside the options, and bad stored data reads as no crest", () => {
    const ok = suggestedCrests("Test")[0];
    expect(CrestSchema.safeParse({ ...ok, primary: "#123456" }).success).toBe(false);
    expect(CrestSchema.safeParse({ ...ok, initials: "ABCD" }).success).toBe(false);
    expect(CrestSchema.parse({ ...ok, initials: "ab" }).initials).toBe("AB");
    expect(toCrest({ shape: "blob" })).toBeNull();
    expect(toCrest(null)).toBeNull();
  });
});
