"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { buyNow, cancelListing, createListing, makeOffer, placeBid, respondToOffer, withdrawOffer } from "@/server/transfers";
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
    await createListing(user.id, { cardId, askingPriceMinor: mpToMinor(form.get("price")), days: Number(form.get("days") ?? 7) });
  }, "Listed on Transfers");
  refresh(cardId);
  return res;
}

export async function cancelListingAction(listingId: string, cardId: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() => cancelListing(user.id, listingId), "Listing cancelled");
  refresh(cardId);
  return res;
}

export async function buyNowAction(listingId: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    await buyNow(user.id, listingId);
  }, "Signed! The card is in your club.");
  refresh();
  return res;
}

export async function makeOfferAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    await makeOffer(user.id, String(form.get("listingId")), mpToMinor(form.get("amount")));
  }, "Offer sent — your MP is held until the seller responds");
  refresh();
  return res;
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
