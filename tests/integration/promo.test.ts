import { beforeEach, describe, expect, it } from "vitest";
import { db, withTx } from "@/server/db";
import { claimPromo, promoState, releasePromo } from "@/server/promo";
import { balancesFor, buyPackWithCredit, credit } from "@/server/wallet";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
  process.env.FLAG_PACK_SHOP = "true";
});

describe("promo code MATCHX", () => {
  it("takes 50% off one pack, once per manager, and shows until it's used", async () => {
    const { userId } = await makeUser("promouser");
    await withTx((tx) => credit(tx, { userId, amountMinor: 10_000, kind: "DEPOSIT", bucket: "CASH", refId: "dep-promo" }));
    const sku = await db.packSku.findFirstOrThrow({ where: { kind: "REGULAR", priceMinor: { gt: 0 } }, orderBy: { priceMinor: "asc" } });
    expect((await promoState(userId)).status).toBe("none");
    await expect(claimPromo(userId, "NOTACODE")).rejects.toThrow(/isn't valid/);
    await claimPromo(userId, "matchx");
    expect((await promoState(userId)).status).toBe("claimed");

    const before = (await balancesFor(userId)).total;
    await buyPackWithCredit(userId, sku.code, "promo-1");
    expect(before - (await balancesFor(userId)).total).toBe(Math.round(sku.priceMinor / 2));
    expect((await promoState(userId)).status).toBe("used");

    // Next pack is full price, and the code can't be claimed again.
    const mid = (await balancesFor(userId)).total;
    await buyPackWithCredit(userId, sku.code, "promo-2");
    expect(mid - (await balancesFor(userId)).total).toBe(sku.priceMinor);
    await expect(claimPromo(userId, "MATCHX")).rejects.toThrow(/already used/);
  });

  it("a failed card payment gives the code back", async () => {
    const { userId } = await makeUser("promocard");
    await claimPromo(userId, "MATCHX");
    await db.promoClaim.updateMany({ where: { userId }, data: { usedAt: new Date(), usedRef: "order-x" } });
    expect((await promoState(userId)).status).toBe("used");
    await withTx((tx) => releasePromo(tx, "order-x"));
    expect((await promoState(userId)).status).toBe("claimed");
  });
});
