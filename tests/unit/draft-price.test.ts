import { describe, expect, it } from "vitest";
import { draftPrice } from "@/domain/football/draft";

describe("draft prices", () => {
  it("uses the card value when there is one", () => {
    expect(draftPrice(17, "GOLD", 100_000_000)).toBe(17);
  });
  it("estimates unvalued players from market value, inside their tier's range", () => {
    expect(draftPrice(null, "GOLD", 0)).toBe(10);
    expect(draftPrice(null, "GOLD", 60_000_000)).toBe(18);
    expect(draftPrice(null, "GOLD", 500_000_000)).toBe(23);
    expect(draftPrice(null, "SILVER", 25_000_000)).toBe(6);
    expect(draftPrice(null, "BRONZE", 5_000_000)).toBe(2);
  });
});
