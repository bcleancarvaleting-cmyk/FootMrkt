import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";

/** A manager's receipt for one of their own card payments: redirects to Stripe's receipt page. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user || !/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const order = await db.order.findUnique({ where: { id } });
  if (!order || order.userId !== user.id || order.status !== "PAID" || order.provider !== "stripe" || !order.providerRef) return new Response("Not found", { status: 404 });
  const { stripeReceiptUrl } = await import("@/server/payments/stripe");
  const url = await stripeReceiptUrl(order.providerRef).catch(() => null);
  if (!url) return new Response("Receipt not available yet — try again in a minute.", { status: 404 });
  return Response.redirect(url, 302);
}
