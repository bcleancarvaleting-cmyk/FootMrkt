import { describe, expect, it } from "vitest";
import { tierForValue } from "@/config/tiers";
import { matchPastedValues, parseValueGbp } from "@/domain/market-values";

describe("value parsing", () => {
  it("reads £ / € values with m, k and bn", () => {
    expect(parseValueGbp("£45.00m")).toBe(45_000_000);
    expect(parseValueGbp("£850k")).toBe(850_000);
    expect(parseValueGbp("£1.2bn")).toBe(1_200_000_000);
    expect(parseValueGbp("€10.00m")).toBe(8_500_000);
    expect(parseValueGbp("€800Th.")).toBe(680_000);
    expect(parseValueGbp("no value")).toBeNull();
  });

  it("uses the confirmed boundaries: £20m+ Gold, £2m–£20m Silver, under £2m Bronze", () => {
    expect(tierForValue(20_000_000)).toBe("GOLD");
    expect(tierForValue(19_999_999)).toBe("SILVER");
    expect(tierForValue(2_000_000)).toBe("SILVER");
    expect(tierForValue(1_999_999)).toBe("BRONZE");
  });
});

describe("matching pasted rows", () => {
  const players = [
    { id: "saka", fullName: "Bukayo Saka", clubName: "Arsenal" },
    { id: "rice", fullName: "Declan Rice", clubName: "Arsenal" },
    { id: "ødegaard", fullName: "Martin Ødegaard", clubName: "Arsenal" },
    { id: "james-chelsea", fullName: "Reece James", clubName: "Chelsea" },
    { id: "james-other", fullName: "Reece James", clubName: "Blackpool" },
  ];
  it("handles tab-separated table rows, accents and shared names", () => {
    const pasted = [
      "1\tBukayo Saka\tRight Winger\tArsenal FC\t24\t£120.00m",
      "Martin Odegaard\tAttacking Midfield\tArsenal FC\t€70.00m",
      "Reece James  Right-Back  Chelsea FC  £40.00m",
      "Declan Rice", // no value
      "Somebody Unknown  Liverpool  £10.00m",
      "Bukayo Saka  duplicate  £1.00m",
    ].join("\n");
    const r = matchPastedValues(pasted, players);
    expect(r.matched.map((m) => [m.playerId, m.valueGbp])).toEqual([
      ["saka", 120_000_000],
      ["ødegaard", 59_500_000],
      ["james-chelsea", 40_000_000],
    ]);
    expect(r.unmatched.map((u) => u.reason)).toEqual(["no value found", "player not found"]);
  });
});
