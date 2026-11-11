import Link from "next/link";
import { notFound } from "next/navigation";
import { sandboxPayAction } from "@/app/actions/admin";
import { ActionButton } from "@/components/action-button";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { isEnabled } from "@/server/flags";
import { gbp } from "@/lib/view";

export const metadata = { title: "Sandbox checkout" };

/** DEV ONLY: stands in for a hosted payment page. No card details are ever entered here. */
export default async function SandboxCheckout({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ next?: string }> }) {
  const { next: nextRaw } = await searchParams;
  const next = nextRaw && nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : null;
  const user = await requireUser();
  if (!(await isEnabled("DEV_TOOLS"))) notFound();
  const { id } = await params;
  const order = await db.order.findUnique({ where: { id } });
  if (!order || order.userId !== user.id) notFound();
  const basket = await db.basketItem.count({ where: { userId: user.id } });
  return (
    <div className="mx-auto max-w-sm space-y-4 pt-10 text-center">
      <p className="eyebrow">Sandbox payment provider</p>
      <h1 className="text-2xl font-black">{gbp(order.amountMinor)}</h1>
      <p className="text-sm text-muted">
        {order.kind === "PACK_PURCHASE" ? "Pack purchase" : order.kind === "DEPOSIT" ? "Wallet top-up" : "Transfer Market purchase"} · order {order.id.slice(0, 8)} · {order.status.toLowerCase()}
      </p>
      {order.status === "PENDING" ? (
        <div className="flex flex-col items-center gap-2">
          <ActionButton action={sandboxPayAction.bind(null, order.id, "succeeded")} className="btn-primary px-8 py-3">
            Simulate successful payment
          </ActionButton>
          <ActionButton action={sandboxPayAction.bind(null, order.id, "failed")} className="btn-ghost border-danger/60 px-8 py-3 text-danger">
            Simulate declined payment
          </ActionButton>
        </div>
      ) : (
        <>
          <p className="text-mint">This order is {order.status.toLowerCase()}.</p>
          {order.status === "FAILED" && order.kind === "PACK_PURCHASE" && (
            <Link href={`/packs?paid=${order.id}`} className="btn-ghost inline-flex px-8 py-3">
              Back to packs
            </Link>
          )}
          {order.status === "PAID" && (
            <Link href={order.kind === "DEPOSIT" ? (next ?? (basket ? "/transfers/basket" : "/account/wallet")) : `/packs?paid=${order.id}`} className="btn-primary inline-flex px-8 py-3">
              {order.kind === "DEPOSIT" ? (next?.startsWith("/competitions") ? "Back to the match" : next?.startsWith("/transfers/basket") || (!next && basket) ? "Back to my basket" : "Back to my wallet") : "Open my pack"}
            </Link>
          )}
        </>
      )}
      <p className="text-xs text-faint">No real money moves. This simulates the provider&apos;s signed webhook.</p>
    </div>
  );
}
