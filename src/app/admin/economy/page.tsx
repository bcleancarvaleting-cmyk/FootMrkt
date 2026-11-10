import Link from "next/link";
import { applyPrizeFundAction, backfillFoundersAction, clubBindersAction, lockHeldCardsAction, cancelAuctionAction, cancelDropAction, clearHouseAction, launchMixAction, processWithdrawalAction, syncPacksAction, toggleChallengeAction, updateWelcomeGiftAction } from "@/app/actions/economy";
import { ActionButton } from "@/components/action-button";
import { AuctionForm, ChallengeForm, DropForm, HouseStockForm, MatchRulesForm, PinnedListingsForm, WelcomeGiftForm } from "@/components/admin-forms";
import { isEnabled } from "@/server/flags";
import { PRIZE_FUND_SHARE, prizeFund } from "@/server/prize-fund";
import { fmtGbp as gbpFmt } from "@/server/wallet";
import { LAUNCH_MIX } from "@/config/transfers";
import { FOOTBALL_PACKS } from "@/config/packs";
import { requireAdmin } from "@/server/auth/session";
import { type Requirements, prizesSummary, requirementsSummary } from "@/server/competitions";
import { giftPacks, welcomeGiftsForAdmin } from "@/server/welcome";
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
  const [drops, auctions, challenges, comps, withdrawals, fees, gifts, house, founders, nonFounders, foundingOpen, tradeableHeld, paidPacks, fund] = await Promise.all([
    upcomingDrops(),
    db.auction.findMany({ where: { status: { in: ["LIVE", "SCHEDULED"] } }, include: { card: { include: { template: { include: { player: true } } } }, bids: { where: { status: "LEADING" } } }, orderBy: { endsAt: "asc" } }),
    db.challenge.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { completions: true } } } }),
    db.competition.findMany({ where: { status: { in: ["UPCOMING", "OPEN"] } }, include: { gameweek: true, _count: { select: { entries: true } } }, orderBy: { name: "asc" } }),
    db.withdrawal.findMany({ where: { status: "REQUESTED" }, include: { user: { select: { displayName: true, fullName: true, kycStatus: true } } }, orderBy: { createdAt: "asc" } }),
    db.marketListing.aggregate({ where: { status: "SOLD" }, _sum: { feeMinor: true, soldPriceMinor: true }, _count: true }),
    welcomeGiftsForAdmin(),
    db.marketListing.groupBy({ by: ["status"], where: { house: true }, _count: { _all: true }, _sum: { soldPriceMinor: true } }),
    db.user.count({ where: { foundingNumber: { not: null } } }),
    db.user.count({ where: { foundingNumber: null } }),
    isEnabled("FOUNDING_SIGNUPS"),
    db.cardInstance.count({ where: { supplyState: "HELD", tradeStatus: "TRADEABLE" } }),
    isEnabled("PAID_PACKS"),
    prizeFund(),
  ]);
  const freerolls = comps.filter((c) => ((c.requirements ?? {}) as Requirements).freeCardsOnly && c.entryFeeMinor === 0);
  const houseActive = house.find((h) => h.status === "ACTIVE")?._count._all ?? 0;
  const houseSold = house.find((h) => h.status === "SOLD");
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
        <span className="flex gap-2">
          <ActionButton action={clubBindersAction}>Create club binders</ActionButton>
          <ActionButton action={syncPacksAction}>Publish new pack versions</ActionButton>
        </span>
      </div>

      <Section title="Prize fund" intro={`${Math.round(PRIZE_FUND_SHARE * 100)}% of the last 7 days' card revenue (packs and MX top-ups) goes into the next prizes, with a £10 minimum. Keep this as internal policy: advertise the prizes, not a share of sales.`}>
        <div className="mb-4 grid gap-px overflow-hidden rounded-xl border border-ink-700 bg-ink-700 sm:grid-cols-4">
          {[
            ["Packs sold", gbpFmt(fund.packs)],
            ["MX top-ups", gbpFmt(fund.topUps)],
            ["Revenue (7 days)", gbpFmt(fund.revenue)],
            ["Prize fund", gbpFmt(fund.fund)],
          ].map(([k, v]) => (
            <div key={k} className="bg-ink-900 p-4">
              <p className="eyebrow">{k}</p>
              <p className="mt-1 font-display text-2xl font-extrabold italic tabular-nums">{v}</p>
            </div>
          ))}
        </div>
        <p className="mb-3 text-sm text-muted">
          Suggested split: 1st {gbpFmt(fund.split[0])} · 2nd {gbpFmt(fund.split[1])} · 3rd {gbpFmt(fund.split[2])} (ties split).
        </p>
        <ul className="divide-y divide-ink-700 text-sm">
          {freerolls.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <b>{c.name}</b> <span className="text-faint">· {prizesSummary(c.rewards) || "no £ prizes yet"}</span>
              </span>
              <ActionButton action={applyPrizeFundAction.bind(null, c.id)} className="btn-primary px-3 py-1.5 text-[11px]" confirm={`Set ${c.name} prizes from the fund?`}>
                Apply fund
              </ActionButton>
            </li>
          ))}
          {!freerolls.length && <li className="py-2 text-faint">No open freerolls this gameweek.</li>}
        </ul>
      </Section>

      <Section title="Founding members" intro="Everyone who signs up while Founding sign-ups is on becomes a numbered Founding Member, with a badge next to their name for good. Use the match rule 'Founding members only' for founders' freerolls.">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span><b>{founders}</b> founding members</span>
          <span className={`tag ${foundingOpen ? "text-lime" : "text-faint"}`}>Founding sign-ups {foundingOpen ? "open" : "closed"}</span>
          <Link href="/admin#flags" className="text-xs text-muted underline">Switch on/off in Feature flags</Link>
          {nonFounders > 0 && (
            <ActionButton action={backfillFoundersAction} className="btn-ghost px-3 py-1.5 text-[11px]">Make the other {nonFounders} account(s) founders</ActionButton>
          )}
        </div>
      </Section>

      <Section title="Launch: untradeable cards" intro="Until paid packs are switched on, every card a manager gets (packs, MATCHX listings, auctions) is untradeable for good. They keep it, play it, use it in sets and challenges, but can't sell it. Handed-in cards go back into packs as tradeable.">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={`tag ${paidPacks ? "text-lime" : "text-warn"}`}>{paidPacks ? "Paid packs live — new cards are tradeable" : "Launch period — new cards are untradeable"}</span>
          <span><b>{tradeableHeld}</b> tradeable card(s) currently held</span>
          {!paidPacks && tradeableHeld > 0 && (
            <ActionButton action={lockHeldCardsAction} className="btn-ghost px-3 py-1.5 text-[11px]" confirm="Make every card managers hold untradeable?">Make them untradeable</ActionButton>
          )}
        </div>
      </Section>

      <Section title="Welcome gifts" intro="Free untradeable packs every new manager gets after the Starter Pack, counted in days from registering. Changes apply to everyone who hasn't received that gift yet.">
        <ul className="mb-4 divide-y divide-ink-700 text-sm">
          {gifts.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span>
                <b>{g.name}</b> <span className="text-faint">· day {g.afterDays} · given {g.given} time{g.given === 1 ? "" : "s"}</span>
                {!g.active && <span className="ml-2 tag text-faint">Paused</span>}
              </span>
              <span className="flex gap-2">
                <ActionButton action={updateWelcomeGiftAction.bind(null, g.id, { afterDays: Math.max(0, g.afterDays - 1) })} className="btn-ghost px-3 py-1.5 text-[11px]">Day −1</ActionButton>
                <ActionButton action={updateWelcomeGiftAction.bind(null, g.id, { afterDays: g.afterDays + 1 })} className="btn-ghost px-3 py-1.5 text-[11px]">Day +1</ActionButton>
                <ActionButton action={updateWelcomeGiftAction.bind(null, g.id, { active: !g.active })} className="btn-ghost px-3 py-1.5 text-[11px]">{g.active ? "Pause" : "Resume"}</ActionButton>
              </span>
            </li>
          ))}
        </ul>
        <WelcomeGiftForm packs={giftPacks()} />
      </Section>

      <Section title="MATCHX listings on Transfers" intro="List cards straight from circulation at buy-now prices (no offers). Unsold cards go back into packs when the listing ends. The MX goes to MATCHX.">
        <p className="mb-4 text-sm">
          <b>{houseActive}</b> live · <b>{houseSold?._count._all ?? 0}</b> sold for <b>{fmtMp(houseSold?._sum.soldPriceMinor ?? 0)}</b>
        </p>
        <div className="mb-5 rounded-xl border border-accent/40 bg-accent/5 p-4">
          <p className="font-semibold">Launch mix</p>
          <p className="mt-1 text-xs text-muted">
            {LAUNCH_MIX.pinned.join(", ")} · {LAUNCH_MIX.bands.map((b) => `${b.count} ${b.tier.toLowerCase()} ${b.leagues.join("/")} ${b.minMp}–${b.maxMp}`).join(" · ")} · {LAUNCH_MIX.days} days. Edit in src/config/transfers.ts.
          </p>
          <div className="mt-3">
            <ActionButton action={launchMixAction} className="btn-primary px-4 py-2 text-xs" confirm="List the launch mix on Transfers?">Stock launch mix</ActionButton>
          </div>
        </div>
        <p className="mb-2 text-sm font-semibold">Named players</p>
        <PinnedListingsForm />
        <p className="mb-2 mt-6 text-sm font-semibold">By tier</p>
        <HouseStockForm />
        {houseActive > 0 && (
          <div className="mt-4">
            <ActionButton action={clearHouseAction} className="btn-ghost px-3 py-1.5 text-[11px]" confirm="Withdraw every live MATCHX listing?">Withdraw all MATCHX listings</ActionButton>
          </div>
        )}
      </Section>

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

      <Section title="House auctions" intro="Takes one unowned copy out of the pack pool. Bids hold cash MX; the winner pays their bid to MATCHX. Unsold cards go back into packs.">
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

      <Section title="Challenges" intro="Managers hand in cards that match the rules for bonus MX and/or a pack. Tradeable cards go back into packs.">
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

      <Section title="Match entry rules" intro="£ prizes are only allowed on free-entry matches with 'Free cards only', so nothing anyone bought can improve their chances of real money. Matches with an MX entry fee pay MX or pack prizes. MX entry fees are charged once PAID_ENTRY is cleared; fees can't change after someone has entered.">
        <div className="space-y-5">
          {comps.map((c) => (
            <div key={c.id} className="border-t border-ink-700 pt-4 first:border-0 first:pt-0">
              <p className="mb-2 text-sm">
                <b>{c.name}</b> <span className="text-faint">· GW{c.gameweek.number} · {c._count.entries} entries · {requirementsSummary((c.requirements ?? {}) as Requirements, c.format)}{prizesSummary(c.rewards) ? ` · prizes ${prizesSummary(c.rewards)}` : ""}</span>
              </p>
              <MatchRulesForm
                id={c.id}
                fee={c.entryFeeMinor}
                req={(c.requirements ?? {}) as Requirements}
                prizes={((c.rewards as Array<{ rankFrom: number; rankTo: number; cashMinor?: number }>) ?? []).filter((r) => r.cashMinor).map((r) => `${r.rankFrom === r.rankTo ? r.rankFrom : `${r.rankFrom}-${r.rankTo}`}=${r.cashMinor! / 100}`).join(", ")}
              />
            </div>
          ))}
          {!comps.length && <p className="text-sm text-faint">No open matches.</p>}
        </div>
      </Section>

      <Section title="Withdrawals" intro="Managers can only withdraw £ winnings from match prizes — never MX. Check identity and bank details with the payout provider, then mark paid. Rejecting returns the winnings.">
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
