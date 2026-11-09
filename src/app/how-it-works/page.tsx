import { FORMATIONS } from "@/domain/football/rules";
import { CURRENT_SCORING_RULES, getScoringRules } from "@/domain/football/scoring";
import { VALUATION_CONFIG } from "@/domain/valuation/mp";

export const metadata = { title: "How it works" };

export default function HowItWorks() {
  const s = getScoringRules(CURRENT_SCORING_RULES);
  const rows: Array<[string, number | string]> = [
    ["Goal", s.goal],
    ["Assist", s.assist],
    [`Clean sheet (${s.cleanSheet.positions.join("/")}, ${s.cleanSheet.minMinutes}+ minutes)`, s.cleanSheet.points],
    ["Penalty save", s.penaltySave],
    [`Every ${s.saves.per} goalkeeper saves`, s.saves.points],
    [`Every ${s.tackles.per} successful tackles`, s.tackles.points],
    ["Appearance", s.appearance],
    ["Plays 60+ minutes", s.played60],
    ["Yellow card", s.yellowCard],
    ["Red card", s.redCard],
    ["Own goal", s.ownGoal],
    ["Missed penalty", s.penaltyMissed],
    [`Every ${s.goalsConceded.per} goals conceded (GK/DEF)`, s.goalsConceded.points],
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <p className="eyebrow">Rules</p>
        <h1 className="text-4xl font-black">How COLLECTR Football works</h1>
      </div>

      <Section title="1. Collect">
        <p>
          Cards come in three collectible tiers — <b className="text-bronze">Bronze</b>, <b className="text-silver">Silver</b> and{" "}
          <b className="text-gold">Gold</b>. Tiers describe the card, not the player&apos;s ability: there are no ratings. Every card is a
          unique numbered copy with its own ownership history.
        </p>
        <p>
          New managers get a free 11-card Starter Pack, and every manager can claim a <b>free Weekly Pack</b> of 6 extra players. Starter
          and Weekly cards are yours to play with but are permanently locked to your account.
        </p>
        <p>
          Gold Packs always contain at least <b>2 Gold</b> top-flight players — sometimes 3 or 4 — with the rest Bronze or Silver.
          Complete a collection set to earn <b>10 MP credit (≈ £10)</b> to spend on packs and build a stronger squad.
        </p>
      </Section>

      <Section title="2. Pick your squad">
        <p>
          Each gameweek you pick <b>7 starters</b> — 1 goalkeeper, 2 defenders, 2 midfielders and 2 attackers — and <b>4 substitutes</b>{" "}
          in order. You can line up in any of these formations:
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.values(FORMATIONS)
            .filter((f) => f.status === "CONFIRMED")
            .map((f) => (
              <span key={f.id} className="chip">
                1-{f.id}
              </span>
            ))}
        </div>
        <p>
          Squads lock at the deadline and the cards you picked stay locked until the competition settles. A card can only be in one
          squad at a time, so choose where to play your best players.
        </p>
        <p>
          <b>Automatic substitutions:</b> if a starter doesn&apos;t play, Sub 1 comes on if they keep a valid formation (keepers only for
          keepers), otherwise Sub 2, and so on. You never need to make subs yourself.
        </p>
      </Section>

      <Section title="3. Score on real matches">
        <p>Points come from what your players actually do. Draft scoring table (subject to approval):</p>
        <div className="panel divide-y divide-ink-700/60">
          {rows.map(([e, p]) => (
            <div key={e} className="flex justify-between px-4 py-2 text-sm">
              <span>{e}</span>
              <b className={Number(p) < 0 ? "text-danger" : "text-lime"}>{Number(p) > 0 ? `+${p}` : p}</b>
            </div>
          ))}
        </div>
        <p>
          Scores are <b>provisional</b> while matches are being played and data is checked. Once the correction window closes they become{" "}
          <b>final</b>, ranks are set and your cards unlock.
        </p>
      </Section>

      <Section title="4. Indicative value (MP)">
        <p>
          Every card shows whether its value is <b className="text-mint">▲ rising</b> or <b className="text-danger">▼ falling</b>, a value
          graph, and how you got it — <b>Starter</b>, <b>Packed</b>, or what you paid.
        </p>
        <p>
          Each card shows an indicative value in MP, with a money reference ({VALUATION_CONFIG.pencePerMp / 100 === 1 ? "1 MP ≈ £1" : ""}). It
          reflects supply, recent form, league level and eligible completed sales. <b>MP is not cash</b>, cannot be withdrawn or redeemed,
          and is not a promise of what a card could sell for.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 text-muted [&_b]:text-fg">
      <h2 className="text-xl font-bold text-fg">{title}</h2>
      {children}
    </section>
  );
}
