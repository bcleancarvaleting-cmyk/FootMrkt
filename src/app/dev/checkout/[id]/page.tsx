import { notFound } from "next/navigation";
import { sandboxPayAction } from "@/app/actions/admin";
import { ActionButton } from "@/components/action-button";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { isEnabled } from "@/server/flags";
import { gbp } from "@/lib/view";

export const metadata = { title: "Sandbox checkout" };

/** DEV ONLY: stands in for a hosted payment page. No card details are ever entered here. */
export default async function SandboxCheckout({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!(await isEnabled("DEV_TOOLS"))) notFound();
  const { id } = await params;
  const order = await db.order.findUnique({ where: { id } });
  if (!order || order.userId !== user.id) notFound();
  return (
    <div className="mx-auto max-w-sm space-y-4 pt-10 text-center">
      <p className="eyebrow">Sandbox payment provider</p>
      <h1 className="text-2xl font-black">{gbp(order.amountMinor)}</h1>
      <p className="text-sm text-muted">
        {order.kind === "PACK_PURCHASE" ? "Pack purchase" : "Transfer Market purchase"} · order {order.id.slice(0, 8)} · {order.status.toLowerCase()}
      </p>
      {order.status === "PENDING" ? (
        <ActionButton action={sandboxPayAction.bind(null, order.id)} className="btn-primary px-8 py-3">
          Simulate successful payment
        </ActionButton>
      ) : (
        <p className="text-mint">This order is {order.status.toLowerCase()}.</p>
      )}
      <p className="text-xs text-faint">No real money moves. This simulates the provider&apos;s signed webhook.</p>
    </div>
  );
}
