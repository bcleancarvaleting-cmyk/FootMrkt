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
