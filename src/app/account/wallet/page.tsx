import { confirmOrderWithProvider, myCardPayments } from "@/server/market";
import Link from "next/link";
import { cardPaymentsReady } from "@/server/payments/config";
import { ConvertXpForm, DepositForm, WithdrawForm } from "@/components/account-forms";
import { GateNotice } from "@/components/page-header";
import { basketCount } from "@/server/basket";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { isEnabled } from "@/server/flags";
import { balancesFor, fmtGbp, fmtMp, profileGaps, walletHistory, xpPerMx } from "@/server/wallet";
import { fmtDate } from "@/lib/view";

export const metadata = { title: "Wallet" };

const KIND_LABEL: Record<string, string> = {
  SET_REWARD: "Set completed",
  CHALLENGE_REWARD: "Challenge reward",
  PACK_PURCHASE: "Pack",
  DEPOSIT: "Added funds",
  WITHDRAWAL_HOLD: "Withdrawal",
  WITHDRAWAL_RELEASE: "Withdrawal returned",
  MARKET_PURCHASE: "Bought",
  MARKET_SALE: "Sold",
  OFFER_HOLD: "Offer held",
  OFFER_RELEASE: "Offer released",
  AUCTION_HOLD: "Bid held",
  AUCTION_RELEASE: "Bid released",
  ENTRY_FEE: "Match entry",
  ENTRY_REFUND: "Entry refund",
  PRIZE: "Match prize",
  XP_EARNED: "XP from a match",
  XP_CONVERT: "XP swapped for MX",
};
const W_TONE: Record<string, string> = { REQUESTED: "text-warn", PAID: "text-mint", REJECTED: "text-danger" };

export default async function WalletPage({ searchParams }: { searchParams: Promise<{ bundle?: string; paid?: string }> }) {
  const user = await requireUser();
  const { bundle, paid } = await searchParams;
  // Back from Stripe: make sure the top-up is credited even if the webhook is slow.
  if (paid && /^[0-9a-f-]{36}$/.test(paid)) await confirmOrderWithProvider(user.id, paid).catch(() => null);
  const [inBasket, payments] = await Promise.all([basketCount(user.id), myCardPayments(user.id)]);
  const cardReady = (await cardPaymentsReady()).ready;
  const XP_PER_MX = await xpPerMx();
  const [u, bal, ledger, withdrawals, depositsOn, withdrawalsOn] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id } }),
    balancesFor(user.id),
    walletHistory(user.id, 40),
    db.withdrawal.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    isEnabled("DEPOSITS"),
    isEnabled("WITHDRAWALS"),
  ]);
  const gaps = profileGaps(u);
  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">My Account</p>
        <h1 className="mt-1 text-4xl leading-none sm:text-5xl">Wallet</h1>
      </div>

      <section className="grid gap-px overflow-hidden rounded-2xl border border-ink-700 bg-ink-700 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-ink-900 p-5">
          <p className="eyebrow">MX balance</p>
          <p className="mt-1 font-display text-5xl font-extrabold italic tabular-nums">{fmtMp(bal.total)}</p>
          <p className="mt-1 text-xs text-faint">MatchX&apos;s in-game currency. Not withdrawable.</p>
        </div>
        <div className="bg-ink-900 p-5">
          <p className="eyebrow">Earned MX</p>
          <p className="mt-1 font-display text-3xl font-extrabold italic tabular-nums text-lime">{fmtMp(bal.earned)}</p>
          <p className="mt-1 text-xs text-faint">From XP, challenges, sets and selling cards. Packs, entries <b className="text-muted">and the Transfer list</b>. Spent first.</p>
        </div>
        <div className="bg-ink-900 p-5">
          <p className="eyebrow">Bought MX</p>
          <p className="mt-1 font-display text-3xl font-extrabold italic tabular-nums">{fmtMp(bal.bought)}</p>
          <p className="mt-1 text-xs text-faint">Added by card. Packs and match entries.</p>
        </div>
        <div className="bg-ink-900 p-5">
          <p className="eyebrow text-lime">Winnings</p>
          <p className="mt-1 font-display text-3xl font-extrabold italic tabular-nums text-lime">{fmtGbp(bal.winnings)}</p>
          <p className="mt-1 text-xs text-faint">£ prizes from free matches. The only balance you can withdraw (min £10).</p>
        </div>
      </section>

      <section id="xp" className="panel scroll-mt-24 flex flex-wrap items-center gap-5 p-5">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">XP</p>
          <p className="mt-1 font-display text-4xl font-extrabold italic tabular-nums">{bal.xp.toLocaleString("en-GB")} XP</p>
          <p className="mt-1 text-sm text-muted">Every point your players score in a match is XP. Swap {XP_PER_MX} XP for 1 earned MX.</p>
        </div>
        <ConvertXpForm xp={bal.xp} perMx={XP_PER_MX} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div id="add" className="panel scroll-mt-24 p-5 lg:col-span-2">
          {inBasket > 0 && (
            <Link href="/transfers/basket" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/60 bg-accent/10 px-4 py-3 text-sm font-semibold">
              <span>{paid ? "Payment received — " : ""}You have {inBasket} player{inBasket > 1 ? "s" : ""} waiting in your basket.</span>
              <span className="text-lime">Pay for them now →</span>
            </Link>
          )}
          <h2 className="mb-1 text-2xl">Add funds</h2>
          <p className="mb-4 text-sm text-muted">Buy MX by card — the bigger bundles come with bonus MX. Packs cost the same in £ or MX; use MX for player drops too.</p>
          {(!depositsOn || !cardReady) && <GateNotice>Coming soon. Adding funds by card opens after the beta, once our payment provider is live.</GateNotice>}
          <DepositForm enabled={depositsOn && cardReady} initial={bundle} />
        </div>
        <div id="withdraw" className="panel scroll-mt-24 p-5">
          <h2 className="mb-1 text-2xl">Withdraw winnings</h2>
          <p className="mb-4 text-sm text-muted">
            Cash out £ you&apos;ve won in matches — minimum £10. You can withdraw up to <b className="text-fg">{fmtGbp(bal.withdrawable)}</b>. MX can&apos;t be withdrawn — it&apos;s for building your club.
          </p>
          {!withdrawalsOn && <GateNotice>Coming soon. Your winnings are safe here; withdrawals open once identity checks and payouts are set up.</GateNotice>}
          {gaps.length > 0 && (
            <p className="mb-3 rounded-xl border border-ink-600 p-3 text-sm">
              Add your {gaps.join(", ")} in <Link href="/account/profile" className="text-lime underline">Profile</Link> first. We check your identity before your first payout.
            </p>
          )}
          <WithdrawForm enabled={withdrawalsOn && gaps.length === 0} maxMinor={bal.withdrawable} />
          {withdrawals.length > 0 && (
            <ul className="mt-4 divide-y divide-ink-700 text-sm">
              {withdrawals.map((w) => (
                <li key={w.id} className="flex justify-between py-2">
                  <span>{fmtGbp(w.amountMinor)} <span className="text-faint">· {fmtDate(w.createdAt)}</span></span>
                  <span className={`text-xs font-bold uppercase tracking-wider ${W_TONE[w.status]}`}>{w.status.toLowerCase()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section id="payments" className="panel scroll-mt-24 p-5">
        <h2 className="mb-1 text-2xl">Card payments</h2>
        <p className="mb-3 text-sm text-muted">Every payment you&apos;ve made by card, with Stripe&apos;s receipt.</p>
        {payments.length === 0 ? (
          <p className="text-sm text-faint">No card payments yet.</p>
        ) : (
          <ul className="divide-y divide-ink-700 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="min-w-0">
                  <span className="block font-semibold">{p.item}</span>
                  <span className="block text-xs text-faint">
                    {fmtDate(p.at)} · ref {p.id.slice(0, 8)}
                    {p.test ? " · test payment" : ""}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-bold tabular-nums">£{(p.amountMinor / 100).toFixed(2)}</span>
                  <span className={`text-[10px] font-extrabold uppercase tracking-[0.14em] ${p.status === "PAID" ? "text-mint" : p.status === "PENDING" ? "text-warn" : "text-danger"}`}>
                    {p.status === "PAID" ? "Paid" : p.status === "PENDING" ? "Pending" : p.status === "REFUNDED" ? "Refunded" : "Not paid"}
                  </span>
                  {p.receipt && (
                    <a href={`/api/receipt/${p.id}`} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-1.5 text-[11px]">
                      Receipt
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="limits" className="panel p-5">
        <h2 className="mb-1 text-2xl">Responsible play</h2>
        <p className="mb-4 text-sm text-muted">
          Spend limits, breaks, self-exclusion, reality checks and your full spend history are all in{" "}
          <Link href="/account/safer-play" className="text-lime underline">Safer play</Link>. Free help:{" "}
          <a href="https://www.begambleaware.org" target="_blank" rel="noreferrer" className="text-lime underline">BeGambleAware</a> · National Gambling Helpline 0808 8020 133.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-2xl">History</h2>
        <ul className="divide-y divide-ink-700 rounded-2xl border border-ink-700 bg-ink-900 text-sm">
          {ledger.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0 truncate">
                <span className="font-semibold">{KIND_LABEL[e.kind] ?? e.kind}</span>
                {e.note && <span className="text-muted"> · {e.note}</span>}
                <span className="text-faint"> · {fmtDate(e.createdAt)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-faint">{e.bucket === "WINNINGS" ? "£ winnings" : e.bucket === "XP" ? "XP" : e.bucket === "BONUS" ? "earned MX" : "bought MX"}</span>
                <b className={`tabular-nums ${e.amountMinor > 0 ? "text-mint" : "text-muted"}`}>
                  {e.amountMinor > 0 ? "+" : ""}
                  {e.bucket === "WINNINGS" ? fmtGbp(e.amountMinor) : e.bucket === "XP" ? `${e.amountMinor} XP` : fmtMp(e.amountMinor)}
                </b>
              </span>
            </li>
          ))}
          {!ledger.length && <li className="px-4 py-4 text-faint">No activity yet. Complete a challenge to earn your first MX.</li>}
        </ul>
      </section>
    </div>
  );
}
