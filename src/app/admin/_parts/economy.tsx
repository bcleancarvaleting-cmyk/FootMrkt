import Link from "next/link";
import { removeMatchAction } from "@/app/actions/admin";
import { backfillFoundersAction, lockHeldCardsAction, cancelAuctionAction, cancelDropAction, clearHouseAction, launchMixAction, processWithdrawalAction, toggleChallengeAction, updateWelcomeGiftAction } from "@/app/actions/economy";
import { ActionButton } from "@/components/action-button";
import { AuctionForm, ChallengeForm, CreateMatchForm, DropForm, HouseStockForm, MatchRulesForm, PinnedListingsForm, WelcomeGiftForm } from "@/components/admin-forms";
import { isEnabled } from "@/server/flags";
import { fmtGbp as gbpFmt } from "@/server/wallet";
import { LAUNCH_MIX } from "@/config/transfers";
import { FOOTBALL_PACKS } from "@/config/packs";
import { type Requirements, prizesSummary, requirementsSummary } from "@/server/competitions";
import { giftPacks, welcomeGiftsForAdmin } from "@/server/welcome";
import { criteriaSummary } from "@/server/challenges";
import type { ChallengeCriteria } from "@/config/challenges";
import { db } from "@/server/db";
import { giftLabel, upcomingDrops } from "@/server/drops";
import { fmtGbp, fmtMp } from "@/server/wallet";
import { fmtDate } from "@/lib/view";


function Section({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <h2 className="text-2xl">{title}</h2>
      {intro && <p className="mb-4 mt-1 text-sm text-muted">{intro}</p>}
      {children}
    </section>
  );
}

export async function EconomySections({ only }: { only: string[] }) {
  const show = (k: string) => only.includes(k);
  const [drops, auctions, challenges, comps, withdrawals, fees, gifts, house, founders, nonFounders, foundingOpen, tradeableHeld, paidPacks] = await Promise.all([
    upcomingDrops(),
    db.auction.findMany({ where: { status: { in: ["LIVE", "SCHEDULED"] } }, include: { card: { include: { template: { include: { player: true } } } }, bids: { where: { status: "LEADING" } } }, orderBy: { endsAt: "asc" } }),
    db.challenge.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { completions: true } } } }),
    db.competition.findMany({ where: { status: { in: ["UPCOMING", "OPEN"] } }, include: { gameweek: true, _count: { select: { entries: true } } }, orderBy: { name: "asc" } }),
    db.withdrawal.findMany({
      where: { status: "REQUESTED" },
      select: {
        id: true, amountMinor: true, source: true, feeMinor: true, createdAt: true,
        payeeName: true, sortCode: true, accountNumber: true, address: true, dateOfBirth: true, idType: true, idNumber: true, idImageType: true,
        user: { select: { displayName: true, fullName: true, email: true, kycStatus: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.marketListing.aggregate({ where: { status: "SOLD" }, _sum: { feeMinor: true, soldPriceMinor: true }, _count: true }),
    welcomeGiftsForAdmin(),
    db.marketListing.groupBy({ by: ["status"], where: { house: true }, _count: { _all: true }, _sum: { soldPriceMinor: true } }),
    db.user.count({ where: { foundingNumber: { not: null } } }),
    db.user.count({ where: { foundingNumber: null } }),
    isEnabled("FOUNDING_SIGNUPS"),
    db.cardInstance.count({ where: { supplyState: "HELD", tradeStatus: "TRADEABLE" } }),
    isEnabled("PAID_PACKS"),
  ]);
  const [leagueRows, openGws, fixtureRows] = show("matchrules")
    ? await Promise.all([
        db.league.findMany({ orderBy: { tier: "asc" }, select: { code: true, name: true } }),
        db.gameweek.findMany({ where: { status: { in: ["UPCOMING", "OPEN"] } }, orderBy: [{ startsAt: "asc" }], select: { id: true, number: true, season: true, simulated: true, startsAt: true } }),
        db.fixture.findMany({
          where: { gameweek: { status: { in: ["UPCOMING", "OPEN"] } }, kickoffAt: { gt: new Date() } },
          orderBy: [{ kickoffAt: "asc" }],
          select: { id: true, kickoffAt: true, gameweek: { select: { number: true, simulated: true } }, homeClub: { select: { name: true, league: { select: { name: true } } } }, awayClub: { select: { name: true } } },
        }),
      ])
    : [[], [], []];
  const fixtureOpts = fixtureRows.map((f) => ({ value: f.id, league: `${f.gameweek.simulated ? "SIM " : "GW"}${f.gameweek.number} · ${f.homeClub.league.name}`, label: `${f.homeClub.name} v ${f.awayClub.name} · ${fmtDate(f.kickoffAt)}` }));
  const leagueOpts = leagueRows.map((l) => ({ value: l.code, label: l.name }));
  const gwOpts = openGws.map((g) => ({ value: g.id, label: g.simulated ? `SIM ${g.number} · simulated, ${fmtDate(g.startsAt)}` : `GW${g.number} · ${g.season}` }));
  const freerolls = comps.filter((c) => ((c.requirements ?? {}) as Requirements).freeCardsOnly && c.entryFeeMinor === 0);
  const houseActive = house.find((h) => h.status === "ACTIVE")?._count._all ?? 0;
  const houseSold = house.find((h) => h.status === "SOLD");
  const packs = FOOTBALL_PACKS.filter((p) => p.kind === "REGULAR").map((p) => ({ code: p.code, name: p.name }));

  return (
    <div className="space-y-6">

      {show("founders") && (
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
      )}

      {show("launch") && (
      <Section title="Launch: untradeable cards" intro="Until paid packs are switched on, every card a manager gets (packs, MATCHX listings, auctions) is untradeable for good. They keep it, play it, use it in sets and challenges, but can't sell it. Handed-in cards go back into packs as tradeable.">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={`tag ${paidPacks ? "text-lime" : "text-warn"}`}>{paidPacks ? "Paid packs live — new cards are tradeable" : "Launch period — new cards are untradeable"}</span>
          <span><b>{tradeableHeld}</b> tradeable card(s) currently held</span>
          {!paidPacks && tradeableHeld > 0 && (
            <ActionButton action={lockHeldCardsAction} className="btn-ghost px-3 py-1.5 text-[11px]" confirm="Make every card managers hold untradeable?">Make them untradeable</ActionButton>
          )}
        </div>
      </Section>
      )}

      {show("welcome") && (
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
      )}

      {show("house") && (
      <Section title="MATCHX listings on Transfers" intro="List cards straight from circulation at buy-now prices (no offers). Unsold cards go back into packs when the listing ends. The money goes to MATCHX.">
        <p className="mb-4 text-sm">
          All transfers: <b>{fees._count}</b> sales · <b>{fmtMp(fees._sum.soldPriceMinor ?? 0)}</b> traded · <b>{fmtMp(fees._sum.feeMinor ?? 0)}</b> in 5% fees ·{" "}
          MATCHX: <b>{houseActive}</b> live · <b>{houseSold?._count._all ?? 0}</b> sold for <b>{fmtMp(houseSold?._sum.soldPriceMinor ?? 0)}</b>
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
      )}

      {show("drops") && (
      <Section title="Gift drops" intro="Give everyone a free pack for a set window, e.g. over Christmas: a slim glowing banner on Packs with a countdown, one claim each. Choose any free pack — including Choice of Gold or a Mixed Pack.">
        <DropForm packs={giftPacks()} />
        <ul className="mt-4 divide-y divide-ink-700 text-sm">
          {drops.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <b>{d.title}</b> <span className="text-lime">· {giftLabel(d)}</span> <span className="text-faint">· {fmtDate(d.startsAt)} → {fmtDate(d.endsAt)}</span>
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
      )}

      {show("auctions") && (
      <Section title="House auctions" intro="Takes one unowned copy out of the pack pool. Bids hold credit; the winner pays their bid to MATCHX. Unsold cards go back into packs.">
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
      )}

      {show("challenges") && (
      <Section title="Challenges" intro="Managers hand in cards that match the rules for bonus credit and/or a pack. Tradeable cards go back into packs.">
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
      )}

      {show("matchrules") && (
      <Section title="Match entry rules" intro="£ prizes are only allowed on free-entry matches with 'Free cards only', so nothing anyone bought can improve their chances of real money. Matches with an entry fee pay £ credit or pack prizes. Entry fees are charged once PAID_ENTRY is cleared; fees can't change after someone has entered.">
        <div className="space-y-5">
          <div className="rounded-xl border border-accent/40 p-4">
            <h3 className="mb-1 font-bold">Create a match</h3>
            <p className="mb-3 text-xs text-muted">Adds an extra match to a gameweek that&apos;s still open, with the same deadline as the others. Only the matches you create here run — none are made automatically. Type a title, set the rules and prizes, and tick the fixtures it covers. For a head to head (e.g. Chelsea v Man Utd) tick one fixture; free draft works best there, as few managers own 11 cards from two clubs.</p>
            {gwOpts.length ? <CreateMatchForm gameweeks={gwOpts} leagues={leagueOpts} fixtures={fixtureOpts} /> : <p className="text-sm text-faint">No gameweek is open for entries right now.</p>}
          </div>
          {comps.map((c) => (
            <div key={c.id} className="border-t border-ink-700 pt-4 first:border-0 first:pt-0">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm">
                  <b>{c.name}</b> <span className="text-faint">· GW{c.gameweek.number} · {c._count.entries} entries · {requirementsSummary((c.requirements ?? {}) as Requirements, c.format)} · {c.entryFeeMinor ? `£${(c.entryFeeMinor / 100).toFixed(2)} entry` : "free entry"} · locks {fmtDate(c.locksAt)}{prizesSummary(c.rewards) ? ` · prizes ${prizesSummary(c.rewards)}` : " · no prizes set"}</span>
                </p>
                <ActionButton
                  action={removeMatchAction.bind(null, c.id)}
                  className="btn-ghost px-3 py-1.5 text-[11px] text-danger"
                  confirm={`Remove "${c.name}"?${c._count.entries ? ` ${c._count.entries} manager${c._count.entries > 1 ? "s have" : " has"} entered — they're refunded, their players freed and they're told.` : ""}`}
                >
                  Remove match
                </ActionButton>
              </div>
              <MatchRulesForm
                id={c.id}
                fee={c.entryFeeMinor}
                req={(c.requirements ?? {}) as Requirements}
                leagues={leagueOpts}
                prizes={(() => {
                  const cash = ((c.rewards as Array<{ rankFrom: number; rankTo: number; cashMinor?: number }>) ?? []).filter((r) => r.cashMinor);
                  if (cash.length === 1 && cash[0].rankFrom === 1 && cash[0].rankTo === 1) return String(cash[0].cashMinor! / 100);
                  return cash.map((r) => `${r.rankFrom === r.rankTo ? r.rankFrom : `${r.rankFrom}-${r.rankTo}`}=${r.cashMinor! / 100}`).join(", ");
                })()}
              />
            </div>
          ))}
          {!comps.length && <p className="text-sm text-faint">No open matches.</p>}
        </div>
      </Section>
      )}

      {show("withdrawals") && (
      <Section title="Withdrawals" intro="Managers can only withdraw £ winnings from match prizes — never spend-only credit. Check the ID and that the bank account name matches the manager, pay it from the MATCHX bank account, then mark paid (they're emailed). Rejecting returns the winnings.">
        <ul className="divide-y divide-ink-700 text-sm">
          {withdrawals.map((w) => {
            const ad = (w.address ?? null) as { line1?: string; line2?: string; city?: string; postcode?: string; country?: string } | null;
            const nameMatch = w.payeeName && w.user.fullName ? w.payeeName.trim().toLowerCase() === w.user.fullName.trim().toLowerCase() : null;
            return (
              <li key={w.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    <b className="text-lg">{fmtGbp(w.amountMinor)}</b>{" "}
                    <span className={`chip ${w.source === "MX" ? "border-accent/60 text-lime" : ""}`}>{w.source === "MX" ? `Credit cash-out · fee ${fmtGbp(w.feeMinor)}` : "Prize winnings"}</span> · {w.user.displayName}{" "}
                    <span className="text-faint">
                      ({w.user.email}, KYC {w.user.kycStatus.toLowerCase()}) · {fmtDate(w.createdAt)}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    <ActionButton action={processWithdrawalAction.bind(null, w.id, "REJECTED")} className="btn-ghost px-3 py-1.5 text-[11px]" confirm="Reject this withdrawal? The winnings go back to the manager.">Reject</ActionButton>
                    <ActionButton action={processWithdrawalAction.bind(null, w.id, "PAID")} className="btn-primary px-3 py-1.5 text-[11px]" confirm="Confirm the payout has been sent to this bank account?">Mark paid</ActionButton>
                  </span>
                </div>
                {w.payeeName ? (
                  <dl className="grid gap-x-6 gap-y-1 rounded-xl border border-ink-700 bg-ink-850 p-3 text-xs sm:grid-cols-2">
                    <div><dt className="inline text-faint">Account name </dt><dd className="inline font-bold">{w.payeeName}</dd>{nameMatch === false && <span className="ml-2 font-bold text-warn">≠ profile name ({w.user.fullName})</span>}</div>
                    <div><dt className="inline text-faint">Sort code · account </dt><dd className="inline font-mono font-bold">{w.sortCode} · {w.accountNumber}</dd></div>
                    <div className="sm:col-span-2"><dt className="inline text-faint">Address </dt><dd className="inline">{ad ? [ad.line1, ad.line2, ad.city, ad.postcode, ad.country].filter(Boolean).join(", ") : "—"}</dd></div>
                    <div><dt className="inline text-faint">Date of birth </dt><dd className="inline">{w.dateOfBirth ? w.dateOfBirth.toLocaleDateString("en-GB", { timeZone: "UTC" }) : "—"}</dd></div>
                    <div>
                      <dt className="inline text-faint">ID </dt>
                      <dd className="inline">{w.idType ? w.idType.replace("_", " ").toLowerCase() : "—"} · <span className="font-mono">{w.idNumber}</span></dd>
                      {w.idImageType && <a href={`/api/admin/withdrawals/${w.id}/id`} target="_blank" rel="noreferrer" className="ml-2 font-bold text-lime underline">View ID</a>}
                    </div>
                  </dl>
                ) : (
                  <p className="text-xs text-warn">Older request — no bank details given. Contact the manager before paying.</p>
                )}
              </li>
            );
          })}
          {!withdrawals.length && <li className="py-2 text-faint">No pending withdrawals.</li>}
        </ul>
      </Section>
      )}
    </div>
  );
}
