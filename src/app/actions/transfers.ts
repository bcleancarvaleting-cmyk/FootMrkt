"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { emailUser } from "@/server/email/send";
import { fmtMp } from "@/server/wallet";
import { buyNow, buyNowAuction, createListing, createManagerAuction, makeOffer, placeBid, respondToOffer, withdrawOffer } from "@/server/transfers";
import { type ActionResult, attempt } from "./result";

const mpToMinor = (v: FormDataEntryValue | null) => Math.round(Number(v) * 100);

function refresh(cardId?: string) {
  revalidatePath("/transfers", "layout");
  revalidatePath("/account", "layout");
  if (cardId) revalidatePath(`/cards/${cardId}`);
}

export async function createListingAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const cardId = String(form.get("cardId"));
  const res = await attempt(async () => {
    await createListing(user.id, { cardId, askingPriceMinor: mpToMinor(form.get("price")), days: Number(form.get("days") ?? 7), confirmHigh: form.get("confirmHigh") === "on" });
  }, "Listed on Transfers");
  refresh(cardId);
  return res;
}

export async function buyNowAction(listingId: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    await buyNow(user.id, listingId);
  }, "Signed! The card is in your club.");
  if (res.ok) await saleEmails(listingId);
  refresh();
  return res;
}

export async function makeOfferAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => makeOffer(user.id, String(form.get("listingId")), mpToMinor(form.get("amount"))), "Offer sent — your money is held until the seller responds");
  if (res.ok) {
    const o = await db.marketOffer.findUnique({ where: { id: res.data.id }, include: { buyer: { select: { displayName: true } }, listing: { include: { card: { include: { template: { include: { player: true } } } } } } } });
    if (o?.listing.sellerId) await emailUser(o.listing.sellerId, "offerReceived", { player: o.listing.card.template.player.displayName, amount: fmtMp(o.amountMinor), buyer: o.buyer.displayName }, `offer:${o.id}`);
  }
  refresh();
  return res.ok ? { ok: true, data: undefined, message: res.message } : res;
}

export async function withdrawOfferAction(offerId: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() => withdrawOffer(user.id, offerId), "Offer withdrawn");
  refresh();
  return res;
}

export async function respondToOfferAction(offerId: string, accept: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    await respondToOffer(user.id, offerId, accept);
  }, accept ? "Offer accepted — sold!" : "Offer declined");
  if (res.ok && accept) {
    const o = await db.marketOffer.findUnique({ where: { id: offerId }, include: { listing: { include: { card: { include: { template: { include: { player: true } } } } } } } });
    if (o) {
      await emailUser(o.buyerId, "offerAccepted", { player: o.listing.card.template.player.displayName, amount: fmtMp(o.amountMinor) }, `offer-accepted:${o.id}`);
      await saleEmails(o.listingId, true);
    }
  }
  refresh();
  return res;
}

export async function placeBidAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    await placeBid(user.id, String(form.get("auctionId")), mpToMinor(form.get("amount")));
  }, "Bid placed — you're leading");
  refresh();
  return res;
}

/** Buyer: "You signed X" (skipped when an accepted offer already told them). Seller: "X has been sold". */
async function saleEmails(listingId: string, offerAccepted = false) {
  const l = await db.marketListing.findUnique({
    where: { id: listingId },
    include: { seller: { select: { displayName: true } }, buyer: { select: { displayName: true } }, card: { include: { template: { include: { player: true } } } } },
  });
  if (!l || l.status !== "SOLD" || !l.buyerId) return;
  const player = l.card.template.player.displayName;
  const price = fmtMp(l.soldPriceMinor ?? 0);
  if (!offerAccepted) await emailUser(l.buyerId, "playerSigned", { player, price, from: l.seller?.displayName ?? "MATCHX" }, `signed:${l.id}`);
  if (l.sellerId) await emailUser(l.sellerId, "playerSold", { player, price, youGet: fmtMp((l.soldPriceMinor ?? 0) - (l.feeMinor ?? 0)), buyer: l.buyer?.displayName ?? "A manager" }, `sold:${l.id}`);
}

export async function createAuctionListingAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const cardId = String(form.get("cardId"));
  const buyNowRaw = String(form.get("buyNow") ?? "").trim();
  const reserveRaw = String(form.get("reserve") ?? "").trim();
  const res = await attempt(async () => {
    await createManagerAuction(user.id, {
      cardId,
      startPriceMinor: mpToMinor(form.get("start")),
      buyNowMinor: buyNowRaw ? mpToMinor(buyNowRaw) : undefined,
      reserveMinor: reserveRaw ? mpToMinor(reserveRaw) : undefined,
      hours: Number(form.get("hours")) as 3 | 12 | 24,
    });
  }, "Auction started — it's on Transfers → Auctions");
  refresh(cardId);
  return res;
}

export async function buyNowAuctionAction(auctionId: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    await buyNowAuction(user.id, auctionId);
  }, "Bought — the player is in your club");
  refresh();
  return res;
}

export async function counterOfferAction(offerId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const { counterOffer } = await import("@/server/transfers");
  const minor = Math.round(Number(form.get("counter")) * 100);
  const res = await attempt(() => counterOffer(user.id, offerId, minor), `Counter-offer of ${fmtMp(minor)} sent`);
  refresh();
  return res;
}

export async function answerCounterAction(offerId: string, accept: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const { answerCounter } = await import("@/server/transfers");
  const res = await attempt(async () => {
    await answerCounter(user.id, offerId, accept);
  }, accept ? "Signed! The player is in your club." : "Counter declined — your money is back.");
  refresh();
  return res;
}
