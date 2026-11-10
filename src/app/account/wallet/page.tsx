import Link from "next/link";
import { DepositForm, LimitForm, WithdrawForm } from "@/components/account-forms";
import { GateNotice } from "@/components/page-header";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { isEnabled } from "@/server/flags";
import { balancesFor, fmtGbp, fmtMp, profileGaps, walletHistory } from "@/server/wallet";
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
};
const W_TONE: Record<string, string> = { REQUESTED: "text-warn", PAID: "text-mint", REJECTED: "text-danger" };

export default async function WalletPage() {
  const user = await requireUser();
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

      <section className="grid gap-px overflow-hidden rounded-2xl border border-ink-700 bg-ink-700 sm:grid-cols-3">
        <div className="bg-ink-900 p-5">
          <p className="eyebrow">Total balance</p>
          <p className="mt-1 font-display text-5xl font-extrabold italic tabular-nums">{fmtMp(bal.total)}</p>
          <p className="text-xs text-faint">1 MP ≈ £1</p>
        </div>
        <div className="bg-ink-900 p-5">
          <p className="eyebrow">Cash MP</p>
          <p className="mt-1 font-display text-3xl font-extrabold italic tabular-nums text-lime">{fmtMp(bal.cash)}</p>
          <p className="text-xs text-faint">From adding funds and selling cards. Buys packs, cards and bids. Withdrawable (min £10).</p>
        </div>
        <div className="bg-ink-900 p-5">
          <p className="eyebrow">Bonus MP</p>
          <p className="mt-1 font-display text-3xl font-extrabold italic tabular-nums">{fmtMp(bal.bonus)}</p>
          <p className="text-xs text-faint">From challenges and sets. Spend on packs (used first) and match entries. Not withdrawable.</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div id="add" className="panel p-5">
          <h2 className="mb-1 text-2xl">Add funds</h2>
          <p className="mb-4 text-sm text-muted">Top up by card. Packs cost £2.99 by card or 2.99 MP from your balance — same price either way.</p>
          {!depositsOn && <GateNotice>Adding funds opens once our payment provider and UK legal review sign off.</GateNotice>}
          <DepositForm enabled={depositsOn} />
        </div>
        <div id="withdraw" className="panel p-5">
          <h2 className="mb-1 text-2xl">Withdraw</h2>
          <p className="mb-4 text-sm text-muted">
            Cash out your cash MP to your bank — minimum £10. You can withdraw up to <b className="text-fg">{fmtGbp(bal.withdrawable)}</b>. Bonus MP can&apos;t be withdrawn.
          </p>
          {!withdrawalsOn && <GateNotice>Withdrawals open once our UK legal, identity-check and payout approvals are in place.</GateNotice>}
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

      <section id="limits" className="panel p-5">
        <h2 className="mb-1 text-2xl">Responsible play</h2>
        <p className="mb-4 text-sm text-muted">
          Set a monthly cap on how much you can add. Lowering it works straight away; raising it takes 24 hours. Need a break? Email support to pause or close your account. Free help:{" "}
          <a href="https://www.begambleaware.org" target="_blank" rel="noreferrer" className="text-lime underline">BeGambleAware</a> · National Gambling Helpline 0808 8020 133.
        </p>
        <LimitForm currentMinor={u.depositLimitMonthlyMinor} />
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
                <span className="text-[10px] font-bold uppercase tracking-wider text-faint">{e.bucket.toLowerCase()}</span>
                <b className={`tabular-nums ${e.amountMinor > 0 ? "text-mint" : "text-muted"}`}>
                  {e.amountMinor > 0 ? "+" : ""}
                  {fmtMp(e.amountMinor)}
                </b>
              </span>
            </li>
          ))}
          {!ledger.length && <li className="px-4 py-4 text-faint">No activity yet. Complete a challenge to earn your first MP.</li>}
        </ul>
      </section>
    </div>
  );
}
