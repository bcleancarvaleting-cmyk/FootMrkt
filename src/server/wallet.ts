import { bundleFor } from "@/config/bundles";
import type { WalletBucket, WalletEntryKind } from "@/generated/prisma/client";
import { z } from "zod";
import { audit } from "./audit";
import { type Tx, db, withTx } from "./db";
import { DomainError } from "./errors";
import { requireFlag } from "./flags";
import { grantPack, latestSku } from "./packs";
import { type PaymentProvider, paymentProvider } from "./payments/provider";
import { assertCanSpend } from "./safer-play";

/**
 * Wallet. Amounts are stored in hundredths (1 MX ≈ £1, so hundredths of an MX = pence).
 *
 * Balances (product decisions 10 Nov 2026):
 *  - MX, the in-game currency, in two kinds (the Ultimate Team model):
 *      bought credit (bucket CASH): added by card. Buys packs and pays match entries only.
 *      earned credit (bucket BONUS): from XP, challenges, sets and selling cards. Buys packs, pays
 *      entries AND trades on the Transfer list / auctions. Earned credit is spent first.
 *    MX is never withdrawable.
 *  - XP (bucket XP): your players' match points. Converts into earned credit at XP_PER_MX.
 *  - Winnings (bucket WINNINGS, £): prizes won in gameweek matches. The only money that can be
 *    withdrawn (minimum £10). It can't be spent in the game.
 *
 * The ledger is append-only (DB trigger); balances are sums. Every entry has a unique refId so
 * retries never double-credit or double-spend. Holds (offers, bids, withdrawals) are negative
 * entries released by a matching positive entry, so held money can't be spent twice.
 *
 * LEGAL: adding funds, cash prizes / withdrawals and trading are gated by the DEPOSITS,
 * PAID_ENTRY / WITHDRAWALS and MARKET flags, switchable only once LEGAL_GATES_CLEARED lists them.
 */
export const SET_REWARD_MP_MINOR = 1000; // 10.00 MX ≈ £10
export const MIN_WITHDRAWAL_MINOR = 1000; // £10 of winnings
export const MIN_DEPOSIT_MINOR = 1000; // £10
export const DEPOSIT_PRESETS_GBP = [10, 20, 50, 100] as const;
export const MAX_DEPOSIT_MINOR = 50000; // £500 per deposit
export const TERMS_VERSION = "2026-11-11b";

export async function balancesFor(userId: string, tx: Tx | typeof db = db) {
  const rows = await tx.walletEntry.groupBy({ by: ["bucket"], where: { userId }, _sum: { amountMinor: true } });
  const cash = rows.find((r) => r.bucket === "CASH")?._sum.amountMinor ?? 0;
  const bonus = rows.find((r) => r.bucket === "BONUS")?._sum.amountMinor ?? 0;
  const winnings = rows.find((r) => r.bucket === "WINNINGS")?._sum.amountMinor ?? 0;
  const xp = rows.find((r) => r.bucket === "XP")?._sum.amountMinor ?? 0;
  /** total = spendable MX (bought = cash, earned = bonus); xp = whole XP points; winnings = withdrawable £. */
  return { cash, bonus, bought: cash, earned: bonus, total: cash + bonus, xp, winnings, withdrawable: Math.max(0, winnings) };
}

export async function balanceMinor(userId: string, tx: Tx | typeof db = db): Promise<number> {
  return (await balancesFor(userId, tx)).total;
}

/** Serialise all money movement for a user inside the current transaction. */
export async function lockWallet(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
}

/** Credit inside an existing transaction. Idempotent on refId. */
export async function credit(
  tx: Tx,
  args: { userId: string; amountMinor: number; kind: WalletEntryKind; refId: string; note?: string; bucket?: WalletBucket },
) {
  if (args.amountMinor <= 0) throw new Error("credit amount must be positive");
  await tx.walletEntry.createMany({ data: [{ ...args, bucket: args.bucket ?? "BONUS" }], skipDuplicates: true });
}

/**
 * Spend MX inside a transaction (call lockWallet first). Bonus MX is used before bought credit.
 * Never touches winnings. Writes one entry per bucket used: `${refId}:b` / `${refId}:c`.
 */
export async function debit(
  tx: Tx,
  args: { userId: string; amountMinor: number; kind: WalletEntryKind; refId: string; note?: string; earnedOnly?: boolean },
) {
  if (args.amountMinor <= 0) throw new Error("debit amount must be positive");
  const bal = await balancesFor(args.userId, tx);
  const fromBonus = Math.min(Math.max(0, bal.bonus), args.amountMinor);
  const fromCash = args.amountMinor - fromBonus;
  if (args.earnedOnly && fromCash > 0) {
    throw new DomainError(
      "EARNED_ONLY",
      `Transfers use earned credit only — this needs ${fmtMp(args.amountMinor)} and you have ${fmtMp(Math.max(0, bal.bonus))} earned. Earn credit from XP, challenges and selling cards.`,
    );
  }
  if (fromCash > Math.max(0, bal.cash)) {
    throw new DomainError("INSUFFICIENT_FUNDS", `Not enough credit — this needs ${fmtMp(args.amountMinor)} and your balance is ${fmtMp(Math.max(0, bal.total))}.`, {
      shortMinor: args.amountMinor - Math.max(0, bal.total),
      needMinor: args.amountMinor,
    });
  }
  const rows = [];
  if (fromBonus > 0) rows.push({ userId: args.userId, kind: args.kind, bucket: "BONUS" as const, amountMinor: -fromBonus, refId: `${args.refId}:b`, note: args.note });
  if (fromCash > 0) rows.push({ userId: args.userId, kind: args.kind, bucket: "CASH" as const, amountMinor: -fromCash, refId: `${args.refId}:c`, note: args.note });
  await tx.walletEntry.createMany({ data: rows });
  return { fromBonus, fromCash };
}

// ───────────── XP ─────────────

/** XP needed for 1 MX — admin setting `xpPerMx` (default 500). XP is stored as whole points. */
export async function xpPerMx() {
  const { getSetting } = await import("./settings");
  return getSetting("xpPerMx");
}

/** Credit XP (whole points) inside a transaction. Idempotent on refId. */
export async function creditXp(tx: Tx, args: { userId: string; xp: number; refId: string; note?: string }) {
  if (args.xp <= 0) return;
  await tx.walletEntry.createMany({ data: [{ userId: args.userId, bucket: "XP", kind: "XP_EARNED", amountMinor: Math.round(args.xp), refId: args.refId, note: args.note }], skipDuplicates: true });
}

/** Exchange XP for earned credit at XP_PER_MX; any XP that doesn't make a whole hundredth stays as XP. */
export async function convertXp(userId: string, xp: number) {
  const rate = await xpPerMx();
  if (!Number.isInteger(xp) || xp < rate) throw new DomainError("MIN", `Convert at least ${rate} XP.`);
  return withTx(async (tx) => {
    await lockWallet(tx, userId);
    const bal = await balancesFor(userId, tx);
    if (xp > bal.xp) throw new DomainError("INSUFFICIENT_XP", `You have ${bal.xp} XP.`);
    const minor = Math.floor((xp * 100) / rate);
    const used = Math.ceil((minor * rate) / 100);
    const ref = `xpconvert:${userId}:${Date.now()}`;
    await tx.walletEntry.create({ data: { userId, bucket: "XP", kind: "XP_CONVERT", amountMinor: -used, refId: ref, note: `Converted to ${fmtMp(minor)}` } });
    await credit(tx, { userId, amountMinor: minor, kind: "XP_CONVERT", bucket: "BONUS", refId: `${ref}:mx`, note: `${used} XP converted` });
    return { xpUsed: used, mxMinor: minor };
  });
}

/** Every 1,000 XP turns into credit automatically (1,000 XP = £5 at the default rate of 200 XP per £1). */
export const XP_AUTO_BLOCK = 1000;

/** Convert whole blocks of 1,000 XP into credit. Safe to call any time; returns the XP converted. */
export async function autoConvertXp(userId: string) {
  const bal = await balancesFor(userId);
  const blocks = Math.floor(bal.xp / XP_AUTO_BLOCK);
  if (blocks < 1) return 0;
  const xp = blocks * XP_AUTO_BLOCK;
  const r = await convertXp(userId, xp).catch(() => null);
  if (!r) return 0;
  const { notify } = await import("./notifications");
  await notify(userId, { kind: "XP", title: `⚡ ${xp.toLocaleString("en-GB")} XP → ${fmtMp(r.mxMinor)}`, body: "Your XP turned into credit — spend it on players, packs and matches.", href: "/account/wallet#xp" });
  return r.xpUsed;
}

/** Credit £ winnings (match prizes). Idempotent on refId. */
export async function creditWinnings(tx: Tx, args: { userId: string; amountMinor: number; refId: string; note?: string }) {
  await credit(tx, { ...args, kind: "PRIZE", bucket: "WINNINGS" });
}

/** Undo a debit made with `refId` (returns each bucket exactly as it was taken). Idempotent. */
export async function release(tx: Tx, args: { userId: string; refId: string; kind: WalletEntryKind; note?: string }) {
  const taken = await tx.walletEntry.findMany({ where: { userId: args.userId, refId: { in: [`${args.refId}:b`, `${args.refId}:c`, `${args.refId}:w`] } } });
  for (const t of taken) {
    await credit(tx, { userId: args.userId, amountMinor: -t.amountMinor, kind: args.kind, bucket: t.bucket, refId: `${t.refId}:release`, note: args.note });
  }
}

/** Buy a pack with MX (bonus first, then cash). Idempotent on clientKey. */
export async function buyPackWithCredit(userId: string, skuCode: string, clientKey: string) {
  await requireFlag("PACK_SHOP");
  return withTx(async (tx) => {
    await lockWallet(tx, userId);
    const refId = `packbuy:${userId}:${clientKey}`;
    const done = await tx.packEntitlement.findUnique({ where: { sourceRef: `credit:${refId}` } });
    if (done) return done;
    const sku = await latestSku(skuCode, tx);
    if (sku.kind !== "REGULAR" || sku.priceMinor <= 0) throw new DomainError("NOT_FOR_SALE", "This pack isn't for sale.");
    // A claimed promo code (e.g. MATCHX, 50% off) comes off this pack.
    const promo = await (await import("./promo")).applyPromo(tx, userId, sku.priceMinor, refId);
    await debit(tx, { userId, amountMinor: promo.priceMinor, kind: "PACK_PURCHASE", refId, note: promo.code ? `${sku.name} (${promo.code})` : `${sku.name}` });
    return grantPack(tx, { userId, skuCode, source: "MP_CREDIT", sourceRef: `credit:${refId}` });
  });
}

/** A pack's price in XP at the admin exchange rate (XP per 1 MX), rounded up to whole XP. */
export const xpPriceFor = (priceMinor: number, rate: number) => Math.ceil((priceMinor * rate) / 100);

/** Buy a shop pack with XP at the current exchange rate (Admin → Settings: XP needed for 1 MX). */
export async function buyPackWithXp(userId: string, skuCode: string, clientKey: string) {
  await requireFlag("PACK_SHOP");
  const rate = await xpPerMx();
  return withTx(async (tx) => {
    await lockWallet(tx, userId);
    const refId = `xpbuy:${userId}:${clientKey}`;
    const done = await tx.packEntitlement.findUnique({ where: { sourceRef: `xp:${refId}` } });
    if (done) return done;
    const sku = await latestSku(skuCode, tx);
    if (sku.kind !== "REGULAR" || sku.priceMinor <= 0) throw new DomainError("NOT_FOR_SALE", "This pack isn't for sale.");
    const cost = xpPriceFor(sku.priceMinor, rate);
    const { xp } = await balancesFor(userId, tx);
    if (xp < cost) throw new DomainError("INSUFFICIENT_XP", `This pack costs ${cost.toLocaleString("en-GB")} XP — you have ${xp.toLocaleString("en-GB")} XP.`);
    await tx.walletEntry.create({ data: { userId, bucket: "XP", kind: "PACK_PURCHASE", amountMinor: -cost, refId, note: `${sku.name} (${cost} XP)` } });
    return grantPack(tx, { userId, skuCode, source: "MP_CREDIT", sourceRef: `xp:${refId}` });
  });
}

// ───────────── Adding funds ─────────────

export const DepositSchema = z.object({
  bundle: z.string().refine((c) => !!bundleFor(c), "Choose a bundle"),
  acceptTerms: z.literal(true, { message: "Please accept the terms to continue" }),
  acceptRisk: z.literal(true, { message: "Please confirm you understand card values can go down as well as up" }),
});

/** Start a card top-up: buy a top-up bundle. Credited as MX when the payment provider confirms (verified webhook). */
export async function startDeposit(userId: string, input: z.input<typeof DepositSchema>, clientKey: string, given?: PaymentProvider, returnPath?: string) {
  const back = returnPath && /^\/[A-Za-z0-9/_\-?=&.]*$/.test(returnPath) && !returnPath.startsWith("//") ? returnPath : undefined;
  await requireFlag("DEPOSITS");
  const { requireCardPayments } = await import("./payments/config");
  await requireCardPayments();
  const provider = given ?? paymentProvider();
  const data = DepositSchema.parse(input);
  const bundle = bundleFor(data.bundle)!;
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!isAdult(user.dateOfBirth)) throw new DomainError("AGE", "Add your date of birth in My Account → Profile. You must be 18 or over to add funds.");
  await assertCanSpend(userId, bundle.priceMinor);
  await db.user.update({ where: { id: userId }, data: { termsVersion: TERMS_VERSION, termsAcceptedAt: new Date(), fundsRiskAcceptedAt: new Date() } });
  const idempotencyKey = `deposit:${userId}:${clientKey}`;
  const existing = await db.order.findUnique({ where: { idempotencyKey } });
  const order = existing ?? (await db.order.create({ data: { userId, kind: "DEPOSIT", refId: `bundle:${bundle.code}:${bundle.mxMinor}`, amountMinor: bundle.priceMinor, provider: provider.name, idempotencyKey } }));
  const checkout = await provider.createCheckout({ id: order.id, amountMinor: order.amountMinor, currency: order.currency, returnPath: back, name: `MATCHX · ${bundle.name} bundle · £${(bundle.mxMinor / 100).toFixed(2)} credit` });
  if (!order.providerRef) await db.order.update({ where: { id: order.id }, data: { providerRef: checkout.providerRef } });
  return { orderId: order.id, checkoutUrl: checkout.checkoutUrl };
}

/** Fulfil a paid deposit order (called from the verified payment webhook, inside its transaction). */
export async function fulfilDeposit(tx: Tx, order: { id: string; userId: string; amountMinor: number; refId?: string }) {
  // Bundle orders carry the MX they buy ("bundle:<code>:<mx>"); older orders were £1 = 1 MX.
  const m = /^bundle:([a-z]+):(\d+)$/.exec(order.refId ?? "");
  const mx = m ? Number(m[2]) : order.amountMinor;
  const name = m ? (bundleFor(m[1])?.name ?? "MX") : null;
  // What was paid for is bought credit; a bundle's bonus is credited as earned (reward) MX.
  const bought = Math.min(mx, order.amountMinor);
  const label = (order.refId ?? "").startsWith("buy:") ? `Paid ${fmtMp(order.amountMinor)} by card for your signing` : `${name ? `${name} bundle: ` : ""}${fmtMp(mx)} for £${(order.amountMinor / 100).toFixed(2)} by card`;
  await credit(tx, { userId: order.userId, amountMinor: bought, kind: "DEPOSIT", bucket: "CASH", refId: `deposit:${order.id}`, note: label });
  if (mx > bought) await credit(tx, { userId: order.userId, amountMinor: mx - bought, kind: "DEPOSIT", bucket: "BONUS", refId: `deposit:${order.id}:bonus`, note: `${name ?? "Bundle"} bonus credit` });
}

// ───────────── Withdrawals ─────────────

export function isAdult(dob: Date | null | undefined, now = new Date()) {
  if (!dob) return false;
  const eighteen = new Date(dob);
  eighteen.setFullYear(eighteen.getFullYear() + 18);
  return eighteen <= now;
}

export function profileGaps(u: { fullName: string | null; dateOfBirth: Date | null; addressLine1: string | null; city: string | null; postcode: string | null }) {
  const gaps: string[] = [];
  if (!u.fullName) gaps.push("full name");
  if (!u.dateOfBirth) gaps.push("date of birth");
  if (!u.addressLine1 || !u.city || !u.postcode) gaps.push("address");
  return gaps;
}

export interface PayoutDetails {
  payeeName: string;
  sortCode: string;
  accountNumber: string;
  address: { line1: string; line2?: string; city: string; postcode: string; country: string };
  dateOfBirth: Date;
  idType: "PASSPORT" | "DRIVING_LICENCE" | "ID_CARD";
  idNumber: string;
  idImage: { bytes: Uint8Array; type: string };
}

const ID_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
export const MAX_ID_BYTES = 6 * 1024 * 1024;

/** Check payout details are complete and sensible (UK bank: 6-digit sort code, 8-digit account). */
export function validatePayout(d: PayoutDetails): PayoutDetails {
  const name = d.payeeName.trim();
  if (name.length < 3 || !/\s/.test(name)) throw new DomainError("NAME", "Enter the full name on the bank account.");
  const sort = d.sortCode.replace(/[\s-]/g, "");
  if (!/^\d{6}$/.test(sort)) throw new DomainError("SORT_CODE", "Enter a 6-digit sort code, e.g. 12-34-56.");
  const acc = d.accountNumber.replace(/\s/g, "");
  if (!/^\d{8}$/.test(acc)) throw new DomainError("ACCOUNT", "Enter your 8-digit account number.");
  if (!d.address.line1.trim() || !d.address.city.trim() || !d.address.postcode.trim()) throw new DomainError("ADDRESS", "Enter your full address.");
  if (Number.isNaN(d.dateOfBirth.getTime())) throw new DomainError("DOB", "Enter your date of birth.");
  if (!isAdult(d.dateOfBirth)) throw new DomainError("AGE", "You must be 18 or over to withdraw.");
  if (!["PASSPORT", "DRIVING_LICENCE", "ID_CARD"].includes(d.idType)) throw new DomainError("ID", "Choose your type of ID.");
  if (d.idNumber.trim().length < 5) throw new DomainError("ID", "Enter the number on your ID.");
  if (!d.idImage.bytes.length) throw new DomainError("ID_IMAGE", "Add a photo of your ID.");
  if (d.idImage.bytes.length > MAX_ID_BYTES) throw new DomainError("ID_IMAGE", "That photo is too big — up to 6MB please.");
  if (!ID_TYPES.includes(d.idImage.type)) throw new DomainError("ID_IMAGE", "Your ID photo must be a JPG, PNG, HEIC or PDF.");
  return {
    ...d,
    payeeName: name,
    sortCode: `${sort.slice(0, 2)}-${sort.slice(2, 4)}-${sort.slice(4)}`,
    accountNumber: acc,
    idNumber: d.idNumber.trim().toUpperCase(),
    address: { line1: d.address.line1.trim(), line2: d.address.line2?.trim() || undefined, city: d.address.city.trim(), postcode: d.address.postcode.trim().toUpperCase(), country: d.address.country.trim() || "United Kingdom" },
  };
}

/**
 * Withdraw £ winnings to a bank account (only winnings — spend-only credit can never be withdrawn).
 * The manager gives their bank details, address, date of birth and ID; the winnings are held and the
 * request goes to Admin → Withdrawals to check and pay.
 */
export async function requestWithdrawal(userId: string, amountMinor: number, details?: PayoutDetails) {
  await requireFlag("WITHDRAWALS");
  if (!Number.isInteger(amountMinor) || amountMinor < MIN_WITHDRAWAL_MINOR) throw new DomainError("MIN", "The minimum withdrawal is £10.");
  const d = details ? validatePayout(details) : null;
  return withTx(async (tx) => {
    await lockWallet(tx, userId);
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (!d) {
      const gaps = profileGaps(user);
      if (gaps.length) throw new DomainError("PROFILE", `Add your ${gaps.join(", ")} in My Account → Profile before withdrawing.`);
      if (!isAdult(user.dateOfBirth)) throw new DomainError("AGE", "You must be 18 or over to withdraw.");
    }
    if (user.status !== "ACTIVE") throw new DomainError("NOT_ALLOWED", "Withdrawals aren't available on this account.");
    const { winnings } = await balancesFor(userId, tx);
    if (amountMinor > winnings) throw new DomainError("INSUFFICIENT_FUNDS", `You have ${fmtGbp(Math.max(0, winnings))} of winnings to withdraw.`);
    const w = await tx.withdrawal.create({
      data: {
        userId,
        amountMinor,
        ...(d
          ? {
              payeeName: d.payeeName,
              sortCode: d.sortCode,
              accountNumber: d.accountNumber,
              address: d.address,
              dateOfBirth: d.dateOfBirth,
              idType: d.idType,
              idNumber: d.idNumber,
              idImage: Buffer.from(d.idImage.bytes),
              idImageType: d.idImage.type,
            }
          : {}),
      },
    });
    await tx.walletEntry.create({ data: { userId, kind: "WITHDRAWAL_HOLD", bucket: "WINNINGS", amountMinor: -amountMinor, refId: `withdrawal:${w.id}:w`, note: "Withdrawal requested" } });
    // Fill any gaps in the profile from what they've just given us.
    if (d) {
      await tx.user.update({
        where: { id: userId },
        data: {
          fullName: user.fullName ?? d.payeeName,
          dateOfBirth: user.dateOfBirth ?? d.dateOfBirth,
          addressLine1: user.addressLine1 ?? d.address.line1,
          addressLine2: user.addressLine2 ?? d.address.line2 ?? null,
          city: user.city ?? d.address.city,
          postcode: user.postcode ?? d.address.postcode,
          country: user.country ?? d.address.country,
        },
      });
    }
    if (user.kycStatus === "NONE") await tx.user.update({ where: { id: userId }, data: { kycStatus: "PENDING" } });
    return w;
  });
}

/**
 * Move £ winnings into the spend-only balance (as earned credit — usable for players, packs, entries
 * and the Transfer list). One way: it can't be turned back into withdrawable winnings.
 */
export async function convertWinnings(userId: string, amountMinor: number, ref = crypto.randomUUID()) {
  if (!Number.isInteger(amountMinor) || amountMinor < 1) throw new DomainError("AMOUNT", "Enter an amount to move.");
  return withTx(async (tx) => {
    await lockWallet(tx, userId);
    // Same request twice (a double tap): done already.
    if (await tx.walletEntry.findUnique({ where: { refId: `convert:${ref}:w` } })) return { amountMinor };
    const { winnings } = await balancesFor(userId, tx);
    if (amountMinor > winnings) throw new DomainError("INSUFFICIENT_FUNDS", `You have ${fmtGbp(Math.max(0, winnings))} of winnings.`);
    await tx.walletEntry.create({ data: { userId, kind: "WINNINGS_CONVERT", bucket: "WINNINGS", amountMinor: -amountMinor, refId: `convert:${ref}:w`, note: "Moved to your £ balance" } });
    await credit(tx, { userId, amountMinor, kind: "WINNINGS_CONVERT", bucket: "BONUS", refId: `convert:${ref}:b`, note: "From your winnings" });
    return { amountMinor };
  });
}

/** Admin: mark paid (money leaves; the hold stays) or reject (the hold is released). */
export async function processWithdrawal(adminId: string, withdrawalId: string, decision: "PAID" | "REJECTED", payoutRef?: string, note?: string) {
  const w = await withTx(async (tx) => {
    const [w] = await tx.$queryRaw<Array<{ id: string; userId: string; status: string; amountMinor: number }>>`
      SELECT id, "userId", status, "amountMinor" FROM "Withdrawal" WHERE id = ${withdrawalId}::uuid FOR UPDATE`;
    if (!w) throw new DomainError("NOT_FOUND", "Withdrawal not found.");
    if (w.status !== "REQUESTED") throw new DomainError("DONE", "This withdrawal has already been processed.");
    if (decision === "REJECTED") await release(tx, { userId: w.userId, refId: `withdrawal:${w.id}`, kind: "WITHDRAWAL_RELEASE", note: "Withdrawal rejected — funds returned" });
    await tx.withdrawal.update({ where: { id: w.id }, data: { status: decision, processedAt: new Date(), processedBy: adminId, payoutRef, note } });
    if (decision === "PAID") await tx.user.update({ where: { id: w.userId }, data: { kycStatus: "VERIFIED" } });
    await audit(tx, { actorId: adminId, action: `withdrawal.${decision.toLowerCase()}`, entityType: "Withdrawal", entityId: w.id, after: { amountMinor: w.amountMinor, payoutRef, note } });
    return w;
  });
  const { emailUser } = await import("./email/send");
  await emailUser(w.userId, "withdrawal", { amount: fmtGbp(w.amountMinor), paid: decision === "PAID" }, `withdrawal:${w.id}:${decision}`);
}

export function fmtMp(minor: number): string {
  return `£${(minor / 100).toFixed(2)}`;
}

export function fmtGbp(minor: number): string {
  return `${minor < 0 ? "−" : ""}£${(Math.abs(minor) / 100).toFixed(2)}`;
}

export async function walletHistory(userId: string, take = 30) {
  return db.walletEntry.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
}
