import Link from "next/link";
import { BuyPackButton, ClaimWeeklyButton, CreditPackButton, DevPackButton, OpenPackButton } from "@/components/pack-buttons";
import { weeklyStatus } from "@/server/weekly";
import { balanceMinor, fmtMp } from "@/server/wallet";
import { FOOTBALL_PACKS } from "@/config/packs";
import { advertisedGuarantee, cardCount, parsePackConfig } from "@/domain/packs/config";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { allFlags } from "@/server/flags";
import { fmtDate, gbp, relativeTime } from "@/lib/view";

export const metadata = { title: "Packs" };


export default async function PacksPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const { welcome } = await searchParams;
  const flags = await allFlags();
  const [unopened, skus, history, credit, weekly] = await Promise.all([
    db.packEntitlement.findMany({ where: { userId: user.id, status: "UNOPENED" }, include: { packSku: true }, orderBy: { createdAt: "asc" } }),
    db.packSku.findMany({ where: { active: true, kind: "REGULAR" }, orderBy: [{ priceMinor: "asc" }, { version: "desc" }], distinct: ["code"] }),
    db.packOpening.findMany({ where: { userId: user.id }, include: { packSku: true, _count: { select: { cards: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
    balanceMinor(user.id),
    weeklyStatus(user.id),
  ]);

  return (
    <div className="space-y-10">
      {welcome && (
        <div className="panel border-lime/40 bg-lime/5 p-5">
          <p className="eyebrow">Welcome to COLLECTR</p>
          <p className="mt-1 text-lg font-bold">Your free Starter Pack is waiting — open it to meet your first 11 players.</p>
        </div>
      )}

      <section className="panel flex flex-wrap items-center gap-5 border-lime/40 p-5 sm:p-6">
        <PackArt code="football-weekly" name="Weekly" small />
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-lime">Free every week</p>
          <h2 className="mt-1 text-3xl font-extrabold">Weekly Free Pack</h2>
          <p className="text-sm text-muted">6 extra players for your squad. Untradeable, and they don&apos;t count towards sets.</p>
        </div>
        {weekly.claimed ? (
          <div className="text-right text-sm">
            <div className="font-bold text-mint">Claimed this week ✓</div>
            <div className="text-xs text-faint">Next free pack {relativeTime(weekly.nextAt)}</div>
          </div>
        ) : (
          <ClaimWeeklyButton />
        )}
      </section>

      <section>
        <p className="eyebrow">Ready to open</p>
        <h1 className="mb-4 text-5xl font-extrabold">Your packs</h1>
        {unopened.length === 0 ? (
          <p className="text-muted">No unopened packs right now.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {unopened.map((e) => {
              const cfg = parsePackConfig(e.packSku.config);
              return (
                <div key={e.id} className="panel flex items-center gap-4 p-4">
                  <PackArt code={e.packSku.code} name={e.packSku.name} small />
                  <div className="flex-1">
                    <div className="font-bold">{e.packSku.name}</div>
                    <div className="text-xs text-faint">
                      {cardCount(cfg)} cards · {e.source.toLowerCase().replace("_", " ")}
                    </div>
                    <div className="mt-3">
                      <OpenPackButton entitlementId={e.id} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <p className="eyebrow">Pack shop</p>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="mb-1 text-2xl font-black">Football packs</h2>
          <span className="chip border-lime/40 text-lime">MP credit: {fmtMp(credit)}</span>
        </div>
        {!flags.PAID_PACKS && (
          <p className="mb-4 text-sm text-warn">
            Buying with money isn&apos;t available yet (pending legal and payment-provider review). You can use MP credit earned
            from completing sets.
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-3">
          {skus.map((s) => {
            const cfg = parsePackConfig(s.config);
            const g = advertisedGuarantee(cfg);
            return (
              <div key={s.id} className="panel flex flex-col p-5">
                <PackArt code={s.code} name={s.name} />
                <div className="mt-4 flex items-baseline justify-between">
                  <h3 className="text-lg font-bold">{s.name}</h3>
                  <span className="text-lg font-black">{gbp(s.priceMinor)}</span>
                </div>
                <p className="text-sm text-muted">{FOOTBALL_PACKS.find((p) => p.code === s.code)?.blurb ?? `${cardCount(cfg)} cards`}</p>
                <ul className="mt-3 space-y-1 text-sm">
                  {g.GOLD > 0 && <li>✓ Guaranteed {g.GOLD} Gold</li>}
                  {g.SILVER > 0 && <li>✓ Guaranteed {g.SILVER} Silver or better</li>}
                  {g.SILVER === 0 && <li>✓ {g.BRONZE} Bronze or better</li>}
                </ul>
                <details className="mt-3 text-xs text-muted">
                  <summary className="cursor-pointer text-faint hover:text-fg">Contents &amp; odds</summary>
                  <ul className="mt-2 space-y-1">
                    {cfg.slots.map((slot, i) => (
                      <li key={i}>
                        {slot.count} × {slot.base.toLowerCase()}
                        {slot.filters?.topFlightOnly ? " (top-flight player)" : ""}
                        {slot.upgrades.map((u) => ` · ${(u.chanceBp / 100).toFixed(u.chanceBp % 100 ? 1 : 0)}% chance each of ${u.category.toLowerCase()}`).join("")}
                      </li>
                    ))}
                    <li className="pt-1 text-faint">Player identity is random among eligible cards in circulation. Pack version v{s.version}.</li>
                  </ul>
                </details>
                <div className="mt-auto flex flex-wrap items-start gap-2 pt-5">
                  <CreditPackButton skuCode={s.code} price={fmtMp(s.priceMinor)} affordable={credit >= s.priceMinor} />
                  <BuyPackButton skuCode={s.code} price={gbp(s.priceMinor)} enabled={flags.PAID_PACKS} gold={s.code.includes("gold")} />
                  {flags.DEV_TOOLS && <DevPackButton skuCode={s.code} />}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {history.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Recent openings</h2>
          <div className="panel divide-y divide-ink-700">
            {history.map((h) => (
              <Link key={h.id} href={`/packs/opening/${h.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-ink-850">
                <span>
                  {h.packSku.name} <span className="text-faint">v{h.packSku.version}</span>
                </span>
                <span className="text-faint">
                  {h._count.cards} cards · {fmtDate(h.createdAt)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PackArt({ code, name, small }: { code: string; name: string; small?: boolean }) {
  const foil = code.includes("gold") ? "foil-gold" : code.includes("silver") ? "foil-silver" : code.includes("starter") || code.includes("weekly") ? "" : "foil-bronze";
  return (
    <div
      className={`card-premium ${code.includes("gold") ? "is-gold" : ""} relative flex ${small ? "h-24 w-18 shrink-0" : "h-44 w-full"} items-end overflow-hidden rounded-2xl p-4 ${
        foil || "bg-gradient-to-br from-lime via-lime-dim to-ink-900"
      }`}
    >
      <span className="sheen" aria-hidden="true" />
      {code.includes("gold") && <span className="holo" aria-hidden="true" />}
      <span className="absolute right-4 top-3 font-display text-sm font-extrabold uppercase italic tracking-wide text-black/60">Collectr</span>
      {!small && (
        <span className="relative font-display text-5xl font-extrabold uppercase italic leading-none text-black/75 drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]">
          {name.replace(" Pack", "")}
        </span>
      )}
    </div>
  );
}
