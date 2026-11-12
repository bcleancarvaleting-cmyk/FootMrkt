import { confirmOrderWithProvider } from "@/server/market";
import Link from "next/link";
import { cardPaymentsReady } from "@/server/payments/config";
import { DepositForm } from "@/components/account-forms";
import { CheckoutButton, RemoveFromBasketButton } from "@/components/basket-buttons";
import { CardRow } from "@/components/card-row";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth/session";
import { basketView } from "@/server/basket";
import { isEnabled } from "@/server/flags";
import { fmtMp } from "@/server/wallet";

export const metadata = { title: "Basket" };
export const dynamic = "force-dynamic";

export default async function BasketPage({ searchParams }: { searchParams: Promise<{ signed?: string; missed?: string; paid?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  if (sp.paid && /^[0-9a-f-]{36}$/.test(sp.paid)) await confirmOrderWithProvider(user.id, sp.paid).catch(() => null);
  const signed = (sp.signed ?? "").split("|").filter(Boolean);
  const missed = (sp.missed ?? "").split("|").filter(Boolean);
  const [v, depositsOn, pay] = await Promise.all([basketView(user.id), isEnabled("DEPOSITS"), cardPaymentsReady()]);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Transfers" title="Basket" intro="Players you've added from MATCHX drops. Pay for them all at once with MX — once paid they're in your club and ready to play. Players aren't held for you: if someone else pays first, they're gone." />
      {signed.length > 0 && (
        <div className="rounded-2xl border border-accent/60 bg-accent/10 p-5">
          <p className="font-display text-2xl font-black uppercase italic text-lime">
            ✓ {signed.length} player{signed.length > 1 ? "s" : ""} signed
          </p>
          <p className="mt-1 text-sm">{signed.join(", ")} {signed.length > 1 ? "are" : "is"} in your club and ready to play in your next match.</p>
          {missed.length > 0 && <p className="mt-1 text-sm text-muted">Already gone before you paid: {missed.join(", ")} — you weren&apos;t charged for {missed.length > 1 ? "them" : "it"}.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/account/club" className="btn-primary">Go to My Club</Link>
            <Link href="/matches" className="btn-ghost">Pick a team</Link>
          </div>
        </div>
      )}
      {v.removed > 0 && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
          {v.removed} player{v.removed > 1 ? "s were" : " was"} signed by someone else and taken out of your basket.
        </p>
      )}
      {v.rows.length === 0 ? (
        signed.length > 0 ? null : <EmptyState title="Your basket is empty" action={<Link href="/transfers/drops" className="btn-primary">Browse player drops</Link>}>
          Tap &ldquo;Add&rdquo; on any MATCHX drop to put them here.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
          <ul className="min-w-0 space-y-2">
            {v.rows.map((r) => (
              <CardRow key={r.listingId} card={r.card} href={`/cards/${r.card.id}`}>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-bold tabular-nums">{fmtMp(r.priceMinor)}</span>
                  <RemoveFromBasketButton listingId={r.listingId} />
                </span>
              </CardRow>
            ))}
          </ul>
          <aside className="panel h-fit min-w-0 space-y-4 p-5 lg:sticky lg:top-20">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">{v.rows.length} player{v.rows.length > 1 ? "s" : ""}</span>
                <b className="tabular-nums">{fmtMp(v.totalMinor)}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Your balance</span>
                <span className="tabular-nums">{fmtMp(v.balanceMinor)}</span>
              </div>
              <p className="text-xs text-faint">No fees on MATCHX drops: you pay exactly the price shown.</p>
            </div>
            {v.shortMinor === 0 ? (
              <CheckoutButton total={fmtMp(v.totalMinor)} count={v.rows.length} />
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-accent/60 bg-accent/10 p-3 text-center">
                  <p className="font-display text-2xl font-black uppercase italic">Top up to enter</p>
                  <p className="text-sm">
                    You&apos;re <b>{fmtMp(v.shortMinor)}</b> short. Top up below, then come back and pay for all.
                  </p>
                </div>
                <DepositForm enabled={depositsOn && pay.ready} initial={v.bundle?.code} returnTo="/transfers/basket" />
                <p className="text-center text-xs text-faint">
                  Or earn credit free: swap XP in your <Link href="/account/wallet#xp" className="underline">wallet</Link>, or sell a player.
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
