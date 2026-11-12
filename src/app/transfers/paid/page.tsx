import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { confirmOrderWithProvider } from "@/server/market";
import { fmtMp } from "@/server/wallet";

export const metadata = { title: "Payment" };
export const dynamic = "force-dynamic";

/**
 * Back from paying exactly £x by card: confirm the payment, then show what happened — signed,
 * still confirming (refreshes itself), or someone else got there first (the money's in the balance).
 */
export default async function PaidPage({ searchParams }: { searchParams: Promise<{ paid?: string; cancelled?: string; listing?: string; auction?: string; basket?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  if (sp.cancelled) {
    return (
      <Box title="Payment cancelled" tone="muted">
        Nothing was charged. <Link href="/transfers" className="text-lime underline">Back to Transfers</Link>
      </Box>
    );
  }
  const id = sp.paid && /^[0-9a-f-]{36}$/.test(sp.paid) ? sp.paid : null;
  if (id) await confirmOrderWithProvider(user.id, id).catch(() => null);
  const order = id ? await db.order.findUnique({ where: { id } }) : null;
  if (!order || order.userId !== user.id) return <Box title="Payment not found" tone="muted"><Link href="/transfers" className="text-lime underline">Back to Transfers</Link></Box>;
  if (order.status === "PENDING") {
    return (
      <>
        <meta httpEquiv="refresh" content="3" />
        <Box title="Confirming your payment…" tone="lime">
          This usually takes a few seconds. Your player is signed the moment it&apos;s confirmed.
        </Box>
      </>
    );
  }
  if (order.status !== "PAID") return <Box title="Payment didn't go through" tone="danger">Nothing was charged. <Link href="/transfers" className="text-lime underline">Try again</Link></Box>;

  if (sp.listing) {
    const l = await db.marketListing.findUnique({ where: { id: sp.listing }, select: { id: true, buyerId: true } });
    if (l?.buyerId === user.id) {
      return (
        <Box title="Paid — signing your player" tone="lime">
          <Link href={`/transfers/signed/${l.id}`} className="btn-primary mt-3 inline-flex px-6 py-3 text-sm">See your new player →</Link>
        </Box>
      );
    }
  }
  if (sp.auction) {
    const a = await db.auction.findUnique({ where: { id: sp.auction }, select: { winnerId: true, cardId: true } });
    if (a?.winnerId === user.id) {
      return (
        <Box title="Paid — the player is yours" tone="lime">
          <Link href={`/cards/${a.cardId}`} className="btn-primary mt-3 inline-flex px-6 py-3 text-sm">See your new player →</Link>
        </Box>
      );
    }
  }
  if (sp.basket) {
    return (
      <Box title="Paid — players signed" tone="lime">
        <Link href="/account/club" className="btn-primary mt-3 inline-flex px-6 py-3 text-sm">Go to My Club →</Link>
      </Box>
    );
  }
  return (
    <Box title="Someone else signed them first" tone="warn">
      Your {fmtMp(order.amountMinor)} is safe in your balance — spend it on any other player, pack or match. <Link href="/transfers" className="text-lime underline">Back to Transfers</Link>
    </Box>
  );
}

function Box({ title, tone, children }: { title: string; tone: "lime" | "warn" | "danger" | "muted"; children: React.ReactNode }) {
  const border = tone === "lime" ? "border-lime/50" : tone === "warn" ? "border-warn/50" : tone === "danger" ? "border-danger/50" : "border-ink-700";
  return (
    <div className={`mx-auto mt-8 max-w-md rounded-2xl border ${border} bg-ink-900 p-6 text-center`}>
      <h1 className="text-4xl leading-none">{title}</h1>
      <div className="mt-3 text-sm text-muted">{children}</div>
    </div>
  );
}
