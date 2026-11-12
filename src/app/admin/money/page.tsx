import Link from "next/link";
import { AdminChart } from "@/components/admin-chart";
import { moneyDashboard } from "@/server/money";
import { AdminTitle } from "../_parts/title";
import { ActionButton } from "@/components/action-button";
import { TextSettingForm } from "@/components/admin-forms";
import { sendReportNowAction } from "@/app/actions/economy";
import { reportRecipients } from "@/server/admin-report";
import { TEXT_SETTINGS, getText } from "@/server/settings";

export const metadata = { title: "Admin · Money" };

const gbp = (m: number) => `£${(m / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const mx = (m: number) => `£${(m / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function MoneyPage() {
  const [m, reportTo, extra] = await Promise.all([moneyDashboard(), reportRecipients(), getText("reportEmails")]);
  return (
    <>
      <AdminTitle title="Money" intro="Real card takings through Stripe, what MATCHX owes in £ winnings, and how MX moves round the game. Worked out from the ledger every time you open it." />

      <section className="overflow-x-auto rounded-2xl border border-ink-700">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-ink-850 text-left text-[11px] uppercase tracking-[0.12em] text-faint">
            <tr>
              {["Card payments", "Taken", "Payments", "Packs", "top-up bundles", "Refunded"].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700 bg-ink-900">
            {m.card.map((c) => (
              <tr key={c.label}>
                <td className="px-3 py-2.5 font-semibold">{c.label}</td>
                <td className="px-3 py-2.5 font-display text-lg font-extrabold italic tabular-nums text-lime">{gbp(c.paidMinor)}</td>
                <td className="px-3 py-2.5 tabular-nums">{c.payments}</td>
                <td className="px-3 py-2.5 tabular-nums">{gbp(c.packsMinor)}</td>
                <td className="px-3 py-2.5 tabular-nums">{gbp(c.bundlesMinor)}</td>
                <td className={`px-3 py-2.5 tabular-nums ${c.refundedMinor ? "text-danger" : "text-faint"}`}>{gbp(c.refundedMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-faint">
        Before Stripe&apos;s fees. {m.payers30} paying manager{m.payers30 === 1 ? "" : "s"} in the last 30 days.
        {m.test.count > 0 && ` Test/sandbox payments (not real money, not counted): ${m.test.count} · ${gbp(m.test.minor)}.`}
      </p>

      <section className="panel p-5">
        <AdminChart title="Card takings per day (£, last 30 days)" points={m.daily} format={(v) => `£${v.toLocaleString("en-GB")}`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="mb-3 text-2xl">£ owed to managers</h2>
          <Rows
            rows={[
              ["Winnings not yet withdrawn", gbp(m.owed.winningsMinor), "Match prizes sitting in managers' wallets"],
              ["Withdrawals waiting", `${gbp(m.owed.pendingWithdrawalsMinor)} · ${m.owed.pendingWithdrawals}`, "Requested, not paid yet", "/admin/withdrawals"],
              ["Withdrawals paid · 30 days", gbp(m.owed.paid30Minor)],
              ["Withdrawals paid · all time", gbp(m.owed.paidAllMinor)],
              ["Prizes awarded · 30 days", gbp(m.owed.prizes30Minor), "", "/admin/prizes"],
              ["Prizes awarded · all time", gbp(m.owed.prizesAllMinor)],
            ]}
          />
        </div>
        <div className="panel p-5">
          <h2 className="mb-3 text-2xl">£ credit economy</h2>
          <Rows
            rows={[
              ["Bought credit in wallets", mx(m.mx.boughtMinor), "Not withdrawable"],
              ["Earned credit in wallets", mx(m.mx.earnedMinor), "Rewards, XP swaps and sales"],
              ["Transfer fees · 30 days", mx(m.mx.p2pFeesMinor), `5% of ${mx(m.mx.p2pVolumeMinor)} over ${m.mx.p2pSales} sales — credit taken out of the game, not cash`, "/admin/transfers"],
              ["Player drops sold · 30 days", mx(m.mx.dropsMinor), `${m.mx.drops} drops`, "/admin/players"],
              ["Credit spent on packs · 30 days", mx(m.mx.packsMinor)],
              ["Credit spent on entries · 30 days", mx(m.mx.entriesMinor), "After refunds", "/admin/matches"],
            ]}
          />
        </div>
      </section>

      <section className="panel space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl">Daily report email</h2>
            <p className="mt-1 text-sm text-muted">
              Every morning at 8am: yesterday&apos;s card takings, new sign-ups (with names), packs bought (card, credit, XP) and players sold. Goes to {reportTo.length} address{reportTo.length === 1 ? "" : "es"}: {reportTo.join(", ") || "—"}.
            </p>
          </div>
          <ActionButton action={sendReportNowAction} className="btn-ghost px-4 py-2 text-xs">Send yesterday&apos;s now</ActionButton>
        </div>
        <TextSettingForm settingKey="reportEmails" label={TEXT_SETTINGS.reportEmails.label} help={TEXT_SETTINGS.reportEmails.help} value={extra} placeholder="ian@example.com, accounts@example.com" />
        <p className="text-xs text-faint">
          About the 5% transfer fee: transfers between managers are paid in spend-only credit, so the seller gets 95% as credit and the 5% simply leaves the game. No money moves in Stripe — real money only comes in when managers pay by card (packs and top-ups).
        </p>
      </section>

      <section className="panel p-5">
        <h2 className="mb-1 text-2xl">Biggest card spenders · 30 days</h2>
        <p className="mb-3 text-sm text-muted">For safer play: check in with anyone spending heavily, and whether they&apos;ve set a monthly limit.</p>
        {m.spenders.length === 0 ? (
          <p className="text-sm text-faint">No card payments in the last 30 days.</p>
        ) : (
          <ul className="divide-y divide-ink-700 text-sm">
            {m.spenders.map((s) => (
              <li key={s.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/admin/users?q=${encodeURIComponent(s.name)}`} className="font-semibold hover:text-lime">{s.name}</Link>
                <span className="flex items-center gap-3 tabular-nums">
                  <span className="text-xs text-faint">{s.payments} payment{s.payments === 1 ? "" : "s"} · limit {s.limitMinor != null ? gbp(s.limitMinor) : "none set"}</span>
                  <b>{gbp(s.minor)}</b>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Rows({ rows }: { rows: Array<[string, string, string?, string?]> }) {
  return (
    <dl className="divide-y divide-ink-700 text-sm">
      {rows.map(([label, value, sub, href]) => (
        <div key={label} className="flex items-start justify-between gap-3 py-2.5">
          <dt className="min-w-0">
            {href ? <Link href={href} className="font-semibold hover:text-lime">{label}</Link> : <span className="font-semibold">{label}</span>}
            {sub && <span className="block text-xs text-faint">{sub}</span>}
          </dt>
          <dd className="shrink-0 font-bold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
