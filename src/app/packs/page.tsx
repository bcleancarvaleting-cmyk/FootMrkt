import Link from "next/link";
import { Countdown } from "@/components/countdown";
import { BuyPackButton, ClaimDropButton, CreditPackButton, DevPackButton, OpenPackButton } from "@/components/pack-buttons";
import { FOOTBALL_PACKS } from "@/config/packs";
import { advertisedGuarantee, cardCount, parsePackConfig } from "@/domain/packs/config";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { dropStatus } from "@/server/drops";
import { allFlags } from "@/server/flags";
import { balancesFor, fmtMp } from "@/server/wallet";
import { fmtDate, gbp } from "@/lib/view";

export const metadata = { title: "Packs" };

const meta = (code: string) => FOOTBALL_PACKS.find((p) => p.code === code);

export default async function PacksPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const { welcome } = await searchParams;
  const [flags, unopened, skus, history, bal, drop] = await Promise.all([
    allFlags(),
    db.packEntitlement.findMany({ where: { userId: user.id, status: "UNOPENED" }, include: { packSku: true }, orderBy: { createdAt: "asc" } }),
    db.packSku.findMany({ where: { active: true, kind: "REGULAR" }, orderBy: [{ code: "asc" }, { version: "desc" }], distinct: ["code"] }),
    db.packOpening.findMany({ where: { userId: user.id }, include: { packSku: true, _count: { select: { cards: true } } }, orderBy: { createdAt: "desc" }, take: 8 }),
    balancesFor(user.id),
    dropStatus(user.id),
  ]);
  const regions = new Map<string, typeof skus>();
  for (const s of skus.sort((a, b) => a.priceMinor - b.priceMinor)) {
    const r = meta(s.code)?.region ?? "All leagues";
    regions.set(r, [...(regions.get(r) ?? []), s]);
  }
  const order = [...regions.keys()].sort((a, b) => (a === "England" ? -1 : b === "England" ? 1 : a.localeCompare(b)));

  return (
    <div className="space-y-10">
      {drop && !drop.opened && (
        <section className="drop-glow flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-accent/70 bg-ink-900 px-4 py-3 sm:flex-nowrap">
          <span className="live-dot shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-lime">Free pack drop</span>
            <span className="block truncate font-display text-lg font-bold uppercase italic leading-tight">{drop.drop.title}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Ends in</span>
            <Countdown to={drop.drop.endsAt.toISOString()} className="font-bold" />
          </span>
          {drop.claimed && drop.entitlementId ? <OpenPackButton entitlementId={drop.entitlementId} label="Open it" /> : <ClaimDropButton dropId={drop.drop.id} />}
        </section>
      )}

      {welcome && (
        <div className="rounded-2xl border border-accent/40 bg-accent/10 p-5">
          <p className="eyebrow text-lime">Welcome to MATCHX</p>
          <p className="mt-1 text-lg font-bold">Your free Starter Pack is waiting — open it to sign your first 11 players.</p>
        </div>
      )}

      {unopened.length > 0 && (
        <section>
          <h1 className="mb-4 text-4xl leading-none sm:text-5xl">Ready to open</h1>
          <ul className="space-y-2">
            {unopened.map((e) => {
              const cfg = parsePackConfig(e.packSku.config);
              return (
                <li key={e.id} className="row-item">
                  <PackArt code={e.packSku.code} small />
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-xl font-bold uppercase italic">{e.packSku.name}</span>
                    <span className="block text-xs text-muted">{cardCount(cfg)} cards · {e.source === "WEEKLY" ? "free drop" : e.source.toLowerCase().replace("_", " ")}</span>
                  </span>
                  <OpenPackButton entitlementId={e.id} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Pack shop</p>
            <h2 className="mt-1 text-4xl leading-none sm:text-5xl">Packs</h2>
            <p className="mt-2 text-sm text-muted">Pay by card, or use MP already in your account — the same price either way. Bonus MP is used first.</p>
          </div>
          <Link href="/account/wallet" className="rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-xs text-muted hover:border-ink-600">
            Balance <b className="ml-1 text-fg tabular-nums">{fmtMp(bal.total)}</b>
          </Link>
        </div>
        {!flags.PAID_PACKS && (
          <p className="mb-5 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">Card payments open once our UK legal and payment-provider review is complete. You can already use MP you&apos;ve earned.</p>
        )}
        <div className="space-y-8">
          {order.map((region) => (
            <div key={region}>
              <h3 className="mb-3 flex items-center gap-3 text-2xl">
                {region}
                {region === "England" && <span className="font-sans text-xs font-semibold not-italic text-faint">Premier League to National League</span>}
              </h3>
              <div className="grid gap-4 md:grid-cols-3">
                {regions.get(region)!.map((s) => {
                  const cfg = parsePackConfig(s.config);
                  const g = advertisedGuarantee(cfg);
                  return (
                    <div key={s.id} className="panel flex flex-col overflow-hidden">
                      <PackArt code={s.code} name={s.name} />
                      <div className="flex flex-1 flex-col p-5">
                        <div className="flex items-baseline justify-between gap-2">
                          <h4 className="font-display text-2xl font-bold uppercase italic">{s.name}</h4>
                          <span className="font-bold tabular-nums">{gbp(s.priceMinor)}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted">{meta(s.code)?.blurb ?? `${cardCount(cfg)} cards`}</p>
                        <ul className="mt-3 space-y-1 text-sm">
                          {g.GOLD > 0 && <li><span className="text-lime">✓</span> {g.GOLD} Gold guaranteed</li>}
                          {g.SILVER > 0 && <li><span className="text-lime">✓</span> {g.SILVER} Silver or better</li>}
                          {g.SILVER === 0 && <li><span className="text-lime">✓</span> {g.BRONZE} Bronze or better</li>}
                        </ul>
                        <details className="mt-3 text-xs text-muted">
                          <summary className="cursor-pointer text-faint hover:text-fg">Contents &amp; odds</summary>
                          <ul className="mt-2 space-y-1">
                            {cfg.slots.map((slot, i) => (
                              <li key={i}>
                                {slot.count} × {slot.base.toLowerCase()}
                                {slot.filters?.topFlightOnly ? " (Premier League)" : ""}
                                {slot.upgrades.map((u) => ` · ${(u.chanceBp / 100).toFixed(u.chanceBp % 100 ? 1 : 0)}% chance each of ${u.category.toLowerCase()}`).join("")}
                              </li>
                            ))}
                            <li className="pt-1 text-faint">Players are random among eligible cards in circulation. Pack version v{s.version}.</li>
                          </ul>
                        </details>
                        <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
                          <BuyPackButton skuCode={s.code} price={gbp(s.priceMinor)} enabled={flags.PAID_PACKS} gold={s.code.includes("gold")} />
                          <CreditPackButton skuCode={s.code} price={fmtMp(s.priceMinor)} affordable={bal.total >= s.priceMinor} />
                          {flags.DEV_TOOLS && <DevPackButton skuCode={s.code} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {history.length > 0 && (
        <section>
          <h2 className="mb-3 text-2xl">Recent openings</h2>
          <ul className="divide-y divide-ink-700 rounded-2xl border border-ink-700 bg-ink-900">
            {history.map((h) => (
              <li key={h.id}>
                <Link href={`/packs/opening/${h.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-ink-850">
                  <span>{h.packSku.name}</span>
                  <span className="text-faint">{h._count.cards} cards · {fmtDate(h.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PackArt({ code, name, small }: { code: string; name?: string; small?: boolean }) {
  const tier = code.includes("gold") ? "gold" : code.includes("silver") ? "silver" : code.includes("bronze") ? "bronze" : null;
  const foil = tier ? `foil-${tier}` : "bg-gradient-to-br from-[#d8ff6a] via-accent to-[#5f8f00]";
  const region = meta(code)?.region;
  return (
    <div className={`card-premium ${tier === "gold" ? "is-gold" : ""} relative flex shrink-0 overflow-hidden ${small ? "h-14 w-11 rounded-lg" : "h-40 w-full items-end p-5"} ${foil}`}>
      <span className="sheen" aria-hidden="true" />
      {tier === "gold" && <span className="holo" aria-hidden="true" />}
      {!small && (
        <>
          <span className="absolute left-5 top-4 font-display text-xs font-extrabold uppercase italic tracking-[0.2em] text-black/55">{region ?? "MATCHX"}</span>
          <span className="absolute right-4 top-3 font-display text-3xl font-extrabold italic text-black/25">X</span>
          <span className="relative font-display text-5xl font-extrabold uppercase italic leading-none text-black/75">{(name ?? "").replace("England ", "").replace(" Pack", "")}</span>
        </>
      )}
    </div>
  );
}
