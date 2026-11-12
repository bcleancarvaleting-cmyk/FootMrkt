import Link from "next/link";
import { releaseMarketAction } from "@/app/actions/economy";
import { ActionButton } from "@/components/action-button";
import { db } from "@/server/db";
import { fmtMp } from "@/server/wallet";
import { fmtDate, hoursAgo } from "@/lib/view";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Transfers" };

/**
 * The two ways cards reach managers after packs:
 * - Player drops: released by MATCHX at a set price, no fee (managed on the player database page).
 * - Transfer list: player-to-player sales in earned credit; the seller pays a 5% fee.
 */
export default async function Page() {
  const week = hoursAgo(7 * 24);
  const [active, offers, all, last7, drops, dropsLast7, legacy, recent] = await Promise.all([
    db.marketListing.count({ where: { house: false, status: "ACTIVE" } }),
    db.marketOffer.count({ where: { status: "PENDING", listing: { house: false } } }),
    db.marketListing.aggregate({ where: { house: false, status: "SOLD" }, _count: true, _sum: { soldPriceMinor: true, feeMinor: true } }),
    db.marketListing.aggregate({ where: { house: false, status: "SOLD", soldAt: { gte: week } }, _count: true, _sum: { soldPriceMinor: true, feeMinor: true } }),
    db.marketListing.aggregate({ where: { house: true, status: "SOLD", card: { packable: false } }, _count: true, _sum: { soldPriceMinor: true } }),
    db.marketListing.aggregate({ where: { house: true, status: "SOLD", card: { packable: false }, soldAt: { gte: week } }, _count: true, _sum: { soldPriceMinor: true } }),
    db.marketListing.count({ where: { house: true, status: "ACTIVE", card: { packable: true } } }),
    db.marketListing.findMany({
      where: { house: false, status: "SOLD" },
      orderBy: { soldAt: "desc" },
      take: 25,
      include: { card: { include: { template: { include: { player: true } } } }, seller: { select: { displayName: true } }, buyer: { select: { displayName: true } } },
    }),
  ]);
  const tiles: Array<[string, string, string]> = [
    ["Transfer list · live", `${active}`, `${offers} pending offers`],
    ["Transfers · 7 days", `${last7._count} sales`, `${fmtMp(last7._sum.soldPriceMinor ?? 0)} traded`],
    ["5% fees · 7 days", fmtMp(last7._sum.feeMinor ?? 0), `${fmtMp(all._sum.feeMinor ?? 0)} all time`],
    ["Player drops · 7 days", `${dropsLast7._count} signed`, `${fmtMp(dropsLast7._sum.soldPriceMinor ?? 0)} · ${fmtMp(drops._sum.soldPriceMinor ?? 0)} all time`],
  ];
  return (
    <>
      <AdminTitle
        title="Transfer listings"
        intro="Two ways cards get out and change hands. Player drops: MATCHX releases players at a set price, no fee, paid from any credit. Transfer list: managers sell to each other in earned credit, and the seller pays a 5% fee."
      />
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-700 bg-ink-700 lg:grid-cols-4">
        {tiles.map(([k, v, s]) => (
          <div key={k} className="bg-ink-900 p-4">
            <p className="eyebrow">{k}</p>
            <p className="mt-1 font-display text-2xl font-extrabold tabular-nums">{v}</p>
            <p className="text-xs text-faint">{s}</p>
          </div>
        ))}
      </section>

      <p className="text-sm text-muted">
        Schedule and withdraw drops on <Link href="/admin/players" className="text-lime underline">Player database &amp; drops</Link>.
      </p>

      <section className="panel space-y-3 p-5">
        <div>
          <h2 className="text-2xl">MATCHX market</h2>
          <p className="mt-1 text-sm text-muted">
            Up to 5 copies of every player at their base tier, on sale from MATCHX at their £ value for 14 days. Each sale makes that player&apos;s remaining copies 2% dearer.
            Unsold copies go back into packs when the batch ends. <b className="text-fg">{legacy.toLocaleString("en-GB")}</b> copies on sale now.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton action={releaseMarketAction.bind(null, true)} className="btn-primary" confirm="Launch the market? Every player is re-priced from scratch (form this season, real-world value, demand and sales; £0.50–£20) and up to 5 copies of each go on sale.">
            Launch market (fresh prices)
          </ActionButton>
          <ActionButton action={releaseMarketAction.bind(null, false)} className="btn-ghost" confirm="Release a new batch? Copies still on sale are re-priced to current values and every player is topped back up to 5.">
            Release a new batch (current prices)
          </ActionButton>
        </div>
        <p className="text-xs text-faint">Managers see it on Transfers → MATCHX market.</p>
      </section>

      <section className="panel p-5">
        <h2 className="mb-3 text-2xl">Recent player-to-player sales</h2>
        <div className="overflow-x-auto">
          <table className="stack w-full text-sm sm:min-w-[640px]">
            <thead className="text-left text-[11px] uppercase tracking-[0.12em] text-faint">
              <tr>
                {["When", "Player", "Seller", "Buyer", "Price", "Fee (5%)"].map((h) => (
                  <th key={h} className="py-2 pr-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700">
              {recent.map((r) => (
                <tr key={r.id}>
                  <td data-label="When" className="py-2 pr-3 text-muted">{r.soldAt ? fmtDate(r.soldAt) : "—"}</td>
                  <td data-label="Player" className="py-2 pr-3 font-semibold">
                    {r.card.template.player.displayName} <span className="text-xs font-normal text-faint">{r.card.template.category.toLowerCase()}</span>
                  </td>
                  <td data-label="Seller" className="py-2 pr-3">{r.seller?.displayName ?? "—"}</td>
                  <td data-label="Buyer" className="py-2 pr-3">{r.buyer?.displayName ?? "—"}</td>
                  <td data-label="Price" className="py-2 pr-3 tabular-nums">{fmtMp(r.soldPriceMinor ?? 0)}</td>
                  <td data-label="Fee (5%)" className="py-2 pr-3 tabular-nums">{fmtMp(r.feeMinor ?? 0)}</td>
                </tr>
              ))}
              {!recent.length && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-faint">
                    No player-to-player sales yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
