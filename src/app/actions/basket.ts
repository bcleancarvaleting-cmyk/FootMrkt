"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { addToBasket, checkoutBasket, removeFromBasket } from "@/server/basket";
import { type ActionResult, attempt } from "./result";

const refresh = () => revalidatePath("/transfers", "layout");

export async function addToBasketAction(listingId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await attempt(() => addToBasket(user.id, listingId), "Added to your basket");
  refresh();
  return r;
}

export async function removeFromBasketAction(listingId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await attempt(() => removeFromBasket(user.id, listingId), "Removed");
  refresh();
  return r;
}

export async function checkoutBasketAction(): Promise<ActionResult> {
  const user = await requireUser();
  const r = await attempt(() => checkoutBasket(user.id));
  refresh();
  revalidatePath("/account/club");
  if (!r.ok) return r;
  const { signed, missed } = r.data;
  const q = new URLSearchParams({ signed: signed.join("|").slice(0, 1500), missed: missed.join("|").slice(0, 600) });
  redirect(`/transfers/basket?${q}`);
}

/** "Pay exactly £x by card" for one listing, an auction's buy-it-now, or the whole basket. */
export async function payExactAction(target: { kind: "listing" | "auction" | "basket"; id?: string }, clientKey: string): Promise<ActionResult<{ checkoutUrl: string }>> {
  const user = await requireUser();
  const kind = target.kind === "listing" || target.kind === "auction" || target.kind === "basket" ? target.kind : null;
  if (!kind) return { ok: false, error: "Unknown purchase." };
  return attempt(async () => {
    const r = await (await import("@/server/exact-pay")).startExactPayment(user.id, { kind, id: typeof target.id === "string" ? target.id.slice(0, 40) : undefined }, String(clientKey).slice(0, 64));
    return { checkoutUrl: r.checkoutUrl };
  });
}
