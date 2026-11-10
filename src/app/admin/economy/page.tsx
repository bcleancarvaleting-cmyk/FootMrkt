import Link from "next/link";
import { cancelAuctionAction, cancelDropAction, processWithdrawalAction, syncPacksAction, toggleChallengeAction } from "@/app/actions/economy";
import { ActionButton } from "@/components/action-button";
import { AuctionForm, ChallengeForm, DropForm, MatchRulesForm } from "@/components/admin-forms";
import { FOOTBALL_PACKS } from "@/config/packs";
import { requireAdmin } from "@/server/auth/session";
import { type Requirements, requirementsSummary } from "@/server/competitions";
import { criteriaSummary } from "@/server/challenges";
import type { ChallengeCriteria } from "@/config/challenges";
import { db } from "@/server/db";
import { upcomingDrops } from "@/server/drops";
import { fmtGbp, fmtMp } from "@/server/wallet";
import { fmtDate } from "@/lib/view";

export const metadata = { title: "Admin · Economy" };

function Section({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <h2 className="text-2xl">{title}</h2>
      {intro && <p className="mb-4 mt-1 text-sm text-muted">{intro}</p>}
      {children}
    </section>
  );
}

export default async function EconomyAdmin() {
  await requireAdmin();
  const [drops, auctions, challenges, comps, withdrawals, fees] = await Promise.all([
    upcomingDrops(),
    db.auction.findMany({ where: { status: { in: ["LIVE", "SCHEDULED"] } }, include: { card: { include: { template: { include: { player: true } } } }, bids: { where: { status: "LEADING" } } }, orderBy: { endsAt: "asc" } }),
    db.challenge.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { completions: true } } } }),
    db.competition.findMany({ where: { status: { in: ["UPCOMING", "OPEN"] } }, include: { gameweek: true, _count: { select: { entries: true } } }, orderBy: { name: "asc" } }),
    db.withdrawal.findMany({ where: { status: "REQUESTED" }, include: { user: { select: { displayName: true, fullName: true, kycStatus: true } } }, orderBy: { createdAt: "asc" } }),
    db.marketListing.aggregate({ where: { status: "SOLD" }, _sum: { feeMinor: true, soldPriceMinor: true }, _count: true }),
  ]);
  const packs = FOOTBALL_PACKS.filter((p) => p.kind === "REGULAR").map((p) => ({ code: p.code, name: p.name }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin" className="text-xs text-faint hover:text-fg">← Admin</Link>
          <h1 className="mt-1 text-5xl">Economy</h1>
          <p className="text-sm text-muted">
            Transfers: {fees._count} sales · {fmtMp(fees._sum.soldPriceMinor ?? 0)} traded · {fmtMp(fees._sum.feeMinor ?? 0)} in 5% fees
          </p>
        </div>
        <ActionButton action={syncPacksAction}>Publish new pack versions</ActionButton>
      </div>

      <Section title="Free pack drops" intro="Pick the days. Each drop shows a slim glowing banner on Packs with a countdown; every manager can claim one untradeable pack.">
        <DropForm />
        <ul className="mt-4 divide-y divide-ink-700 text-sm">
          {drops.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <b>{d.title}</b> <span className="text-faint">· {fmtDate(d.startsAt)} → {fmtDate(d.endsAt)}</span>
                {d.startsAt <= new Date() && <span className="ml-2 tag text-lime">Live</span>}
              </span>
              <ActionButton action={cancelDropAction.bind(null, d.id)} className="btn-ghost px-3 py-1.5 text-[11px]" confirm="Cancel this drop?">
                {d.startsAt <= new Date() ? "End now" : "Cancel"}
              </ActionButton>
            </li>
          ))}
          {!drops.length && <li className="py-2 text-faint">No drops scheduled.</li>}
        </ul>
      </Section>

      <Section title="House auctions" intro="Takes one unowned copy out of the pack pool. Bids hold cash MP; the winner pays their bid to MATCHX. Unsold cards go back into packs.">
        <AuctionForm />
        <ul className="mt-4 divide-y divide-ink-700 text-sm">
          {auctions.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <b>{a.card.template.player.displayName}</b> <span className="text-faint">· {a.card.template.category.toLowerCase()} · ends {fmtDate(a.endsAt)} · top bid {a.bids[0] ? fmtMp(a.bids[0].amountMinor) : "—"}</span>
              </span>
              <ActionButton action={cancelAuctionAction.bind(null, a.id)} className="btn-ghost px-3 py-1.5 text-[11px]" confirm="Cancel and return all bids?">Cancel</ActionButton>
            </li>
          ))}
          {!auctions.length && <li className="py-2 text-faint">No live auctions.</li>}
        </ul>
      </Section>

      <Section title="Challenges" intro="Managers hand in cards that match the rules for bonus MP and/or a pack. Tradeable cards go back into packs.">
        <ChallengeForm packs={packs} />
        <ul className="mt-4 divide-y divide-ink-700 text-sm">
          {challenges.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <b>{c.name}</b> <span className="text-faint">· {criteriaSummary(c.criteria as unknown as ChallengeCriteria)} · {c.rewardMinor ? fmtMp(c.rewardMinor) : ""}{c.rewardPackSku ? ` + ${c.rewardPackSku}` : ""} · {c._count.completions} done</span>
              </span>
              <ActionButton action={toggleChallengeAction.bind(null, c.id, !c.active)} className="btn-ghost px-3 py-1.5 text-[11px]">{c.active ? "Pause" : "Resume"}</ActionButton>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Match entry rules" intro="Entry fees are only charged once PAID_ENTRY is legally cleared — until then paid matches can't be entered. Fees can't change after someone has entered.">
        <div className="space-y-5">
          {comps.map((c) => (
            <div key={c.id} className="border-t border-ink-700 pt-4 first:border-0 first:pt-0">
              <p className="mb-2 text-sm">
                <b>{c.name}</b> <span className="text-faint">· GW{c.gameweek.number} · {c._count.entries} entries · {requirementsSummary((c.requirements ?? {}) as Requirements, c.format)}</span>
              </p>
              <MatchRulesForm id={c.id} fee={c.entryFeeMinor} req={(c.requirements ?? {}) as Requirements} />
            </div>
          ))}
          {!comps.length && <p className="text-sm text-faint">No open matches.</p>}
        </div>
      </Section>

      <Section title="Withdrawals" intro="Check identity and the bank details on file with the payout provider, then mark paid. Rejecting returns the MP to the manager.">
        <ul className="divide-y divide-ink-700 text-sm">
          {withdrawals.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span>
                <b>{fmtGbp(w.amountMinor)}</b> · {w.user.displayName} <span className="text-faint">({w.user.fullName ?? "no name"}, KYC {w.user.kycStatus.toLowerCase()}) · {fmtDate(w.createdAt)}</span>
              </span>
              <span className="flex gap-2">
                <ActionButton action={processWithdrawalAction.bind(null, w.id, "REJECTED")} className="btn-ghost px-3 py-1.5 text-[11px]">Reject</ActionButton>
                <ActionButton action={processWithdrawalAction.bind(null, w.id, "PAID")} className="btn-primary px-3 py-1.5 text-[11px]" confirm="Confirm the payout has been sent?">Mark paid</ActionButton>
              </span>
            </li>
          ))}
          {!withdrawals.length && <li className="py-2 text-faint">No pending withdrawals.</li>}
        </ul>
      </Section>
    </div>
  );
}
