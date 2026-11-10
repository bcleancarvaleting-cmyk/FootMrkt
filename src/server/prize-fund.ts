import { DomainError } from "./errors";
import { db } from "./db";
import { updateCompetitionRules } from "./competitions";
import { getSetting } from "./settings";

/**
 * Prize fund (product decision 10 Nov 2026): 50% of last week's card revenue (packs and MX
 * top-ups) goes into the following week's prizes, with a £10 minimum. Internal policy for
 * planning prizes — prizes are always fixed in advance and never pooled from entries.
 */
/** Default share; the live value is the admin setting `prizeFundSharePct`. */
export const PRIZE_FUND_SHARE = 0.5;
export const PRIZE_FUND_MIN_MINOR = 1000;
/** How the fund is split across 1st, 2nd and 3rd when applied to a freeroll. */
export const PRIZE_FUND_SPLIT = [0.5, 0.3, 0.2] as const;

export async function prizeFund(now = new Date()) {
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const rows = await db.order.groupBy({
    by: ["kind"],
    where: { status: "PAID", kind: { in: ["PACK_PURCHASE", "DEPOSIT"] }, createdAt: { gte: since, lt: now } },
    _sum: { amountMinor: true },
  });
  const packs = rows.find((r) => r.kind === "PACK_PURCHASE")?._sum.amountMinor ?? 0;
  const topUps = rows.find((r) => r.kind === "DEPOSIT")?._sum.amountMinor ?? 0;
  const revenue = packs + topUps;
  const share = (await getSetting("prizeFundSharePct")) / 100;
  const fund = Math.max(PRIZE_FUND_MIN_MINOR, Math.floor(revenue * share));
  const split = PRIZE_FUND_SPLIT.map((p) => Math.floor((fund * p) / 100) * 100); // whole pounds
  return { since, packs, topUps, revenue, fund, split };
}

/** Set a free-entry, free-cards-only match's £ prizes from the fund (1st/2nd/3rd). */
export async function applyPrizeFund(adminId: string, competitionId: string) {
  const comp = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  const { split } = await prizeFund();
  const prizes = split.map((m, i) => (m > 0 ? `${i + 1}=${m / 100}` : null)).filter(Boolean).join(", ");
  if (!prizes) throw new DomainError("NO_FUND", "The prize fund is empty.");
  return updateCompetitionRules(adminId, competitionId, { entryFeeMinor: comp.entryFeeMinor, requirements: comp.requirements, prizes });
}
