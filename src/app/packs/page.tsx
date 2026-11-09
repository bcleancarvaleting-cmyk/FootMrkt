import Link from "next/link";
import { BuyPackButton, CreditPackButton, DevPackButton, OpenPackButton } from "@/components/pack-buttons";
import { balanceMinor, fmtMp } from "@/server/wallet";
import { advertisedGuarantee, cardCount, parsePackConfig } from "@/domain/packs/config";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { allFlags } from "@/server/flags";
import { fmtDate, gbp } from "@/lib/view";

export const metadata = { title: "Packs" };

const PACK_ART: Record<string, string> = {
  "football-starter": "from-lime/70 via-lime-dim/40 to-ink-900",
  "football-bronze": "from-bronze via-bronze-deep to-ink-900",
  "football-silver": "from-silver via-silver-deep to-ink-900",
  "football-gold": "from-gold via-gold-deep to-ink-900",
};

export default async function PacksPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const { welcome } = await searchParams;
  const flags = await allFlags();
  const [unopened, skus, history, credit] = await Promise.all([
    db.packEntitlement.findMany({ where: { userId: user.id, status: "UNOPENED" }, include: { packSku: true }, orderBy: { createdAt: "asc" } }),
    db.packSku.findMany({ where: { active: true, kind: "REGULAR" }, orderBy: [{ priceMinor: "asc" }, { version: "desc" }], distinct: ["code"] }),
    db.packOpening.findMany({ where: { userId: user.id }, include: { packSku: true, _count: { select: { cards: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
    balanceMinor(user.id),
  ]);

  return (
    <div className="space-y-10">
      {welcome && (
        <div className="panel border-lime/40 bg-lime/5 p-5">
          <p className="eyebrow">Welcome to COLLECTR</p>
          <p className="mt-1 text-lg font-bold">Your free Starter Pack is waiting — open it to meet your first 11 players.</p>
        </div>
      )}

      <section>
        <p className="eyebrow">Ready to open</p>
        <h1 className="mb-4 text-3xl font-black">Your packs</h1>
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
                <p className="text-sm text-muted">{cardCount(cfg)} cards</p>
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
                  <BuyPackButton skuCode={s.code} price={gbp(s.priceMinor)} enabled={flags.PAID_PACKS} />
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
  return (
    <div
      className={`relative flex ${small ? "h-24 w-18" : "h-40 w-full"} items-end overflow-hidden rounded-xl bg-gradient-to-br ${PACK_ART[code] ?? PACK_ART["football-bronze"]} p-3`}
    >
      <span className="absolute right-3 top-2 text-[10px] font-black tracking-widest text-ink-950/70">COLLECTR</span>
      {!small && <span className="text-2xl font-black text-ink-950/80">{name.replace(" Pack", "")}</span>}
    </div>
  );
}
