import { SettingForm, TextSettingForm } from "@/components/admin-forms";
import { parsePrizes } from "@/server/competitions";
import { db } from "@/server/db";
import { SETTINGS, TEXT_SETTINGS, getSetting, getText } from "@/server/settings";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Weekly prizes" };

const CUPS = [
  { key: "prizesBronze", code: "bronze", name: "Bronze Cup" },
  { key: "prizesSilver", code: "silver", name: "Silver Cup" },
  { key: "prizesGold", code: "gold", name: "Gold Cup" },
] as const;

/**
 * The weekly £ prize pools. Bronze, Silver and Gold Cups have set amounts that every gameweek
 * uses; raise them as the site grows. Prizes for any other match are set on that match
 * (Matches & gameweeks → Match entry rules).
 */
export default async function WeeklyPrizesPage() {
  const [pools, anyCards, thisWeek] = await Promise.all([
    Promise.all(CUPS.map((c) => getText(c.key))),
    getSetting("cashAnyCards"),
    db.competition.findMany({ where: { status: { in: ["UPCOMING", "OPEN"] }, OR: CUPS.map((c) => ({ code: { endsWith: `-${c.code}` } })) }, select: { name: true, rewards: true } }),
  ]);
  const total = (text: string) => {
    try {
      return parsePrizes(text).reduce((n, r) => n + (r.cashMinor * (r.rankTo - r.rankFrom + 1)), 0) / 100;
    } catch {
      return null;
    }
  };
  return (
    <>
      <AdminTitle
        title="Weekly prizes"
        intro="The Bronze, Silver and Gold Cups pay set £ amounts every gameweek. Increase them here as the site grows; any other match's prizes are set on that match in Matches & gameweeks."
      />
      <section className="panel space-y-4 p-5">
        <div className="grid gap-px overflow-hidden rounded-xl border border-ink-700 bg-ink-700 sm:grid-cols-3">
          {CUPS.map((c, i) => (
            <div key={c.key} className="bg-ink-900 p-4">
              <p className="eyebrow">{c.name}</p>
              <p className="mt-1 font-display text-3xl font-extrabold italic tabular-nums">{total(pools[i]) === null ? "–" : `£${total(pools[i])!.toFixed(2).replace(/\.00$/, "")}`}</p>
              <p className="text-xs text-faint">a week · {pools[i]}</p>
            </div>
          ))}
        </div>
        {CUPS.map((c, i) => (
          <TextSettingForm key={c.key} settingKey={c.key} label={TEXT_SETTINGS[c.key].label} help={TEXT_SETTINGS[c.key].help} value={pools[i]} placeholder="1=10, 2=6, 3=4" />
        ))}
        <p className="text-xs text-faint">
          Write it as position=£ amount, separated by commas: <code>1=10, 2=6, 3=4</code> pays £10, £6 and £4. A range works too: <code>4-10=1</code> pays £1 to 4th–10th. Ties split the prize.
        </p>
      </section>
      <section className="panel p-5">
        <SettingForm
          settingKey="cashAnyCards"
          label="Who can win £ prizes"
          help={SETTINGS.cashAnyCards.help}
          value={anyCards}
          min={0}
          max={1}
          choices={[
            { value: 1, label: "Any cards (bought cards can win cash) — needs your lawyer's sign-off" },
            { value: 0, label: "Free cards only (starters, picks, loans, gifts)" },
          ]}
        />
      </section>
      <section className="panel p-5">
        <h2 className="text-xl">This week&apos;s cups</h2>
        <ul className="mt-2 divide-y divide-ink-700 text-sm">
          {thisWeek.map((c) => {
            const cash = ((c.rewards as Array<{ rankFrom: number; rankTo: number; cashMinor?: number }>) ?? []).filter((r) => r.cashMinor);
            return (
              <li key={c.name} className="flex justify-between gap-3 py-2">
                <b>{c.name}</b>
                <span className="text-muted">{cash.length ? cash.map((r) => `${r.rankFrom === r.rankTo ? r.rankFrom : `${r.rankFrom}–${r.rankTo}`}: £${(r.cashMinor! / 100).toFixed(2)}`).join(" · ") : "no £ prizes"}</span>
              </li>
            );
          })}
          {!thisWeek.length && <li className="py-2 text-faint">No cups open this week.</li>}
        </ul>
      </section>
    </>
  );
}
