import { PauseForm, LimitsForm, RealityCheckForm } from "@/components/safer-play-forms";
import { fmtDate } from "@/lib/view";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { EXCLUSIONS, type Limits, spendHistory, TIME_OUTS } from "@/server/safer-play";
import { fmtGbp } from "@/server/wallet";

export const metadata = { title: "Safer play" };

export default async function SaferPlayPage() {
  const me = await requireUser();
  const [u, history] = await Promise.all([db.user.findUniqueOrThrow({ where: { id: me.id } }), spendHistory(me.id)]);
  const pending = u.pendingLimits as Limits | null;
  const lim = (v: number | null) => (v === null ? "No limit" : fmtGbp(v));

  return (
    <div className="space-y-6">
      <section className="panel p-5">
        <h2 className="mb-1 text-2xl">Your spending</h2>
        <p className="mb-4 text-sm text-muted">Money paid by card: wallet top-ups and paid packs.</p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["Today", history.totals.day],
              ["Last 7 days", history.totals.week],
              ["This month", history.totals.month],
              ["All time", history.totals.all],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-xl border border-ink-700 bg-ink-900 p-3">
              <dt className="eyebrow">{k}</dt>
              <dd className="mt-1 font-display text-2xl font-extrabold tabular-nums">{fmtGbp(v)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="text-2xl">Spend limits</h2>
        <p className="text-sm text-muted">
          Caps on card spending across top-ups and packs. Lowering a limit works straight away. Raising or removing one takes 24 hours, so you have time to think it over.
        </p>
        <p className="text-sm">
          Now: <b>{lim(u.limitDailyMinor)}</b> a day · <b>{lim(u.limitWeeklyMinor)}</b> a week · <b>{lim(u.depositLimitMonthlyMinor)}</b> a month
        </p>
        {pending && u.pendingLimitsAt && (
          <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
            From {fmtDate(u.pendingLimitsAt)}: {lim(pending.daily)} a day · {lim(pending.weekly)} a week · {lim(pending.monthly)} a month
          </p>
        )}
        <LimitsForm daily={u.limitDailyMinor} weekly={u.limitWeeklyMinor} monthly={u.depositLimitMonthlyMinor} />
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="text-2xl">Reality check</h2>
        <p className="text-sm text-muted">A reminder of how long you&apos;ve been playing and what you&apos;ve spent this session.</p>
        <RealityCheckForm minutes={u.realityCheckMinutes} />
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="text-2xl">Take a break</h2>
        <p className="text-sm text-muted">Step away for a while. You&apos;ll be logged out and can&apos;t log back in until the break is over. Your cards and wallet are kept safe.</p>
        <PauseForm kind="timeout" options={TIME_OUTS} />
      </section>

      <section className="panel space-y-3 border-danger/40 p-5">
        <h2 className="text-2xl">Self-exclude</h2>
        <p className="text-sm text-muted">
          If playing is becoming a problem, exclude yourself for 6 months or more. It can&apos;t be reversed early. We&apos;ll also stop all marketing. Withdrawable winnings can still be paid out — contact
          support.
        </p>
        <PauseForm kind="exclusion" options={EXCLUSIONS.map(([c, l, d]) => [c, l, d] as const)} />
        <p className="text-sm text-muted">
          Free, confidential help:{" "}
          <a href="https://www.begambleaware.org" target="_blank" rel="noreferrer" className="text-lime underline">
            BeGambleAware
          </a>{" "}
          · National Gambling Helpline <a href="tel:08088020133" className="text-lime underline">0808 8020 133</a> · Block gambling sites on all your devices with{" "}
          <a href="https://www.gamban.com" target="_blank" rel="noreferrer" className="text-lime underline">
            Gamban
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-2xl">Spend history</h2>
        {history.rows.length === 0 ? (
          <p className="text-sm text-faint">Nothing paid by card yet.</p>
        ) : (
          <ul className="divide-y divide-ink-700 rounded-2xl border border-ink-700 bg-ink-900 text-sm">
            {history.rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span>
                  {r.what} <span className="text-faint">· {fmtDate(r.at)}</span>
                </span>
                <span className="tabular-nums">
                  {fmtGbp(r.amountMinor)}
                  {r.status === "REFUNDED" && <span className="ml-2 text-xs font-bold uppercase text-faint">refunded</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
