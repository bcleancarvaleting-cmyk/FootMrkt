import Link from "next/link";
import { AdminChart } from "@/components/admin-chart";
import { dashboard, gameHealth } from "@/server/analytics";
import { AdminTitle } from "./_parts/title";

export const metadata = { title: "Admin" };

export default async function Dashboard() {
  const [d, h] = await Promise.all([dashboard(), gameHealth()]);
  const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
  const health: Array<[string, string, string, string]> = [
    ["Packs opened", h.packs.toLocaleString("en-GB"), "last 7 days", "/admin/packs"],
    ["Transfers", h.trades.toLocaleString("en-GB"), `£${(h.tradeVolumeMinor / 100).toLocaleString("en-GB", { maximumFractionDigits: 0 })} traded · 7 days`, "/admin/transfers"],
    [h.gameweek ? `GW${h.gameweek} entries` : "Entries", h.entries.toLocaleString("en-GB"), `${h.draftEntries} in Free Draft`, "/admin/matches"],
    ["Rainbows found", `${h.rainbows}`, `of ${h.players.toLocaleString("en-GB")}`, "/hall-of-fame"],
    ["Referrals that play", pct(h.referralPlayRate), `${h.referred} referred sign-ups`, "/admin/users"],
    ["Week-2 retention", pct(h.week2Retention), `of ${h.cohort} who joined 8–14 days ago`, "/admin/users"],
  ];
  const attention: Array<[string, number, string]> = [
    ["Support messages", h.attention.support, "/admin/support"],
    ["Trades to review", h.attention.flags, "/admin/trade-review"],
    ["Pulls to post", h.attention.pulls, "/admin/social"],
  ];
  const k = d.kpis;
  const tiles: Array<[string, string, string, string]> = [
    ["Managers", k.users.toLocaleString("en-GB"), `+${k.newToday} today · +${k.newWeek} this week`, "/admin/users"],
    ["Active this week", k.active7.toLocaleString("en-GB"), `${k.users ? Math.round((k.active7 / k.users) * 100) : 0}% of managers`, "/admin/users"],
    ["App installs", k.installs.toLocaleString("en-GB"), `${k.notif} with notifications on`, "/admin/app"],
    ["Revenue this week", `£${(k.revenueWeekMinor / 100).toFixed(2)}`, "Packs and top-ups", "/admin/packs"],
    ["Cards in clubs", k.cardsHeld.toLocaleString("en-GB"), "Held by managers now", "/admin/packs"],
  ];
  const top = d.support.slice(0, 12);
  const topMax = Math.max(1, ...top.map((s) => s.count));
  return (
    <>
      <AdminTitle title="Dashboard" intro="The last 12 weeks at a glance." />
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-700 bg-ink-700 lg:grid-cols-5">
        {tiles.map(([label, value, sub, href]) => (
          <Link key={label} href={href} className="bg-ink-900 p-4 transition hover:bg-ink-850">
            <p className="eyebrow">{label}</p>
            <p className="mt-1 font-display text-3xl font-extrabold italic tabular-nums">{value}</p>
            <p className="text-xs text-faint">{sub}</p>
          </Link>
        ))}
      </section>
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-700 bg-ink-700 sm:grid-cols-3 lg:grid-cols-6">
        {health.map(([label, value, sub, href]) => (
          <Link key={label} href={href} className="bg-ink-900 p-4 transition hover:bg-ink-850">
            <p className="eyebrow">{label}</p>
            <p className="mt-1 font-display text-2xl font-extrabold italic tabular-nums">{value}</p>
            <p className="text-xs text-faint">{sub}</p>
          </Link>
        ))}
      </section>
      <section className="flex flex-wrap gap-2">
        {attention.map(([label, n, href]) => (
          <Link key={label} href={href} className={`rounded-full border px-4 py-2 text-sm font-semibold ${n > 0 ? "border-warn/60 bg-warn/10 text-fg" : "border-ink-700 text-faint"}`}>
            {label}: <b className="tabular-nums">{n}</b>
          </Link>
        ))}
        <span className="rounded-full border border-ink-700 px-4 py-2 text-sm text-faint">Phones with push on: {h.push}</span>
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <AdminChart title="Revenue per week (£)" points={d.revenue} format={(v) => `£${v.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`} />
        <AdminChart title="Cards in managers' clubs" points={d.circulation} kind="line" />
        <AdminChart title="New managers per week" points={d.signups} />
        <section className="panel min-w-0 p-4">
          <p className="mb-3 font-semibold">Who our managers support</p>
          {top.length === 0 ? (
            <p className="text-sm text-faint">No favourite clubs yet — new sign-ups pick one.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {top.map((s) => (
                <li key={s.club.id} className="grid grid-cols-[minmax(0,1fr)_120px_36px] items-center gap-3">
                  <span className="truncate">
                    {s.club.name} <span className="text-faint">· {s.club.league.name}</span>
                  </span>
                  <span className="h-2 rounded-full bg-ink-800">
                    <span className="block h-2 rounded-full bg-[var(--color-chart)]" style={{ width: `${(s.count / topMax) * 100}%` }} />
                  </span>
                  <span className="text-right tabular-nums">{s.count}</span>
                </li>
              ))}
            </ul>
          )}
          {d.support.length > top.length && <p className="mt-2 text-xs text-faint">+ {d.support.length - top.length} more clubs — see Users.</p>}
        </section>
      </div>
    </>
  );
}
