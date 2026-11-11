import Link from "next/link";
import { FOOTBALL_PACKS } from "@/config/packs";
import { ELITE_GOLD, FINISHES, MAX_SUPPLY, FINISH_VALUE } from "@/config/tiers";
import { type Category, packOdds, parsePackConfig, slotOdds } from "@/domain/packs/config";
import { gbp } from "@/lib/view";
import { db } from "@/server/db";
import { rollsFinishes } from "@/server/finishes";
import { getSetting } from "@/server/settings";
import { rainbowCount } from "@/server/social";

export const metadata = { title: "Pack odds & rules", description: "The published odds for every MATCHX pack, how cards are drawn and how many of each card exist." };

const TIERS: Category[] = ["BRONZE", "SILVER", "GOLD"];
const pc = (p: number) =>
  p === 0 ? "—" : p >= 0.9995 ? "100%" : `${(p * 100).toLocaleString("en-GB", p < 0.01 ? { maximumSignificantDigits: 2 } : { maximumFractionDigits: p < 0.1 ? 1 : 0 })}%`;

/** Public: the published odds for every pack, generated from the live pack settings (never typed by hand). */
export default async function OddsPage() {
  const [skus, rubyOneIn, diamondOneIn, rainbowOneIn, rainbows] = await Promise.all([
    db.packSku.findMany({ where: { active: true }, orderBy: [{ code: "asc" }, { version: "desc" }], distinct: ["code"] }),
    getSetting("rubyOneIn"),
    getSetting("diamondOneIn"),
    getSetting("rainbowOneIn"),
    rainbowCount(),
  ]);
  const meta = (code: string) => FOOTBALL_PACKS.find((p) => p.code === code);
  const shown = skus.filter((s) => !s.code.endsWith("-pick") && !s.code.includes("loan")).sort((a, b) => a.priceMinor - b.priceMinor || a.name.localeCompare(b.name));
  const oneIn = (n: number) => `1 in ${n.toLocaleString("en-GB")} (${pc(1 / n)})`;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="eyebrow">Fair play</p>
        <h1 className="mt-1 text-5xl font-extrabold">Pack odds &amp; rules</h1>
        <p className="mt-3 text-muted">
          These odds are worked out directly from the settings each pack is opened with, so they&apos;re always the ones in use. Every card is drawn at random by a secure random number
          generator the moment you open a pack, and every draw is logged. Nobody at MATCHX picks, builds or changes what&apos;s inside your pack.
        </p>
      </header>

      <section className="panel p-5">
        <h2 className="mb-3 text-2xl">How a pack is opened</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
          <li>Each card slot rolls its tier using the odds below (for example a Silver slot might upgrade to Gold).</li>
          <li>A player is then drawn at random from every card of that tier still available in the pool. You never get the same player twice in one pack.</li>
          <li>If a tier has run out, the slot falls back to its guaranteed tier — you never get less than the pack promises.</li>
          <li>Gold and Rare packs then roll for a special finish (below). Finishes are cosmetic: the card scores exactly the same points.</li>
        </ol>
      </section>

      <section>
        <h2 className="mb-3 text-2xl">Odds by pack</h2>
        <div className="space-y-4">
          {shown.map((s) => {
            const cfg = parsePackConfig(s.config);
            const odds = packOdds(cfg);
            return (
              <article key={s.id} className="panel overflow-hidden">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-700 px-5 py-3">
                  <h3 className="font-display text-xl font-bold uppercase italic">{s.name}</h3>
                  <span className="text-sm text-muted">
                    {s.priceMinor > 0 ? gbp(s.priceMinor) : "Free"} · {cfg.slots.reduce((n, x) => n + x.count, 0)} cards{meta(s.code)?.region ? ` · ${meta(s.code)!.region} players` : ""} · v{s.version}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead className="text-left text-[11px] uppercase tracking-wider text-faint">
                      <tr>
                        <th className="px-5 py-2 font-semibold">Slot</th>
                        {TIERS.map((t) => (
                          <th key={t} className="px-3 py-2 text-right font-semibold">
                            {t.toLowerCase()}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-800">
                      {cfg.slots.map((slot, i) => {
                        const o = slotOdds(slot);
                        return (
                          <tr key={i}>
                            <td className="px-5 py-2">
                              {slot.count} × {slot.label}
                              {slot.filters?.topFlightOnly ? " (Premier League)" : ""}
                              {slot.finish && <span className="rainbow-name"> · guaranteed special</span>}
                            </td>
                            {TIERS.map((t) => (
                              <td key={t} className="px-3 py-2 text-right tabular-nums">
                                {pc(o[t])}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                      <tr className="bg-ink-900/60">
                        <td className="px-5 py-2 font-semibold">At least one in the pack</td>
                        {TIERS.map((t) => (
                          <td key={t} className="px-3 py-2 text-right font-semibold tabular-nums">
                            {pc(odds.atLeastOne[t])}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                {(rollsFinishes(s.code) || cfg.slots.some((x) => x.finish)) && (
                  <ul className="space-y-1 border-t border-ink-700 px-5 py-3 text-xs text-muted">
                    {cfg.slots
                      .filter((x) => x.finish)
                      .map((x, i) => (
                        <li key={i} className="rainbow-name">
                          Guaranteed special: Ruby {x.finish!.RUBY / 100}% · Diamond {x.finish!.DIAMOND / 100}% · Rainbow {x.finish!.RAINBOW / 100}%
                        </li>
                      ))}
                    {rollsFinishes(s.code) && (
                      <>
                        <li>Any card: Rainbow {oneIn(rainbowOneIn)}</li>
                        <li>Each Gold: Ruby {oneIn(rubyOneIn)} · Diamond {oneIn(diamondOneIn)}</li>
                      </>
                    )}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="mb-3 text-2xl">How many of each card exist</h2>
        <ul className="space-y-1.5 text-sm text-muted">
          <li>
            <b className="text-fg">Gold:</b> {ELITE_GOLD.maxSupply} per player for the {ELITE_GOLD.count} most valuable players, {MAX_SUPPLY.GOLD} for every other Gold player.
          </li>
          <li>
            <b className="text-fg">Silver:</b> {MAX_SUPPLY.SILVER.toLocaleString("en-GB")} per player · <b className="text-fg">Bronze:</b> {MAX_SUPPLY.BRONZE.toLocaleString("en-GB")} per player.
          </li>
          <li>
            <b className="text-[#ff8fa6]">Ruby:</b> {FINISHES.RUBY.perPlayer} per Gold player · <b className="text-[#8fe3ff]">Diamond:</b> {FINISHES.DIAMOND.perPlayer} per Gold player ·{" "}
            <b className="rainbow-name">Rainbow:</b> exactly 1 for every player in the game. {rainbows.found.toLocaleString("en-GB")} of {rainbows.total.toLocaleString("en-GB")} found so far.
          </li>
          <li>
            Value: a Ruby is worth {FINISH_VALUE.RUBY}× the player&apos;s normal card value, a Diamond {FINISH_VALUE.DIAMOND}× and a Rainbow {FINISH_VALUE.RAINBOW}×. They score the same points as any other card of that player.
          </li>
          <li>Every card is numbered (for example No. 37 / 1,000), so you can always see how rare it is.</li>
        </ul>
      </section>

      <section className="panel p-5">
        <h2 className="mb-3 text-2xl">Rules that matter</h2>
        <ul className="space-y-1.5 text-sm text-muted">
          <li>MATCHX is for over-18s only.</li>
          <li>MX is an in-game currency. Only MX you&apos;ve bought by card can be cashed back to £ (after 7 days, less a 10% fee); MX from packs, rewards and sales can&apos;t.</li>
          <li>Cash prizes are only offered on matches that are free to enter and played with free cards, so you never need to pay to win money.</li>
          <li>Card values go up and down with real-world form. A card is a collectible, not an investment.</li>
          <li>Player-to-player transfers carry a 5% fee, paid by the seller.</li>
        </ul>
        <p className="mt-3 text-sm">
          Full details: <Link href="/legal/terms" className="text-lime underline">Terms</Link> · <Link href="/legal/responsible-play" className="text-lime underline">Responsible play</Link> ·{" "}
          <Link href="/how-it-works" className="text-lime underline">How it works</Link>
        </p>
      </section>
    </div>
  );
}
