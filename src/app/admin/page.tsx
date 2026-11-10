import Link from "next/link";
import { AdminChart } from "@/components/admin-chart";
import { dashboard } from "@/server/analytics";
import { AdminTitle } from "./_parts/title";

export const metadata = { title: "Admin" };

export default async function Dashboard() {
  const d = await dashboard();
  const k = d.kpis;
  const tiles: Array<[string, string, string, string]> = [
    ["Managers", k.users.toLocaleString("en-GB"), `+${k.newToday} today · +${k.newWeek} this week`, "/admin/users"],
    ["Active this week", k.active7.toLocaleString("en-GB"), `${k.users ? Math.round((k.active7 / k.users) * 100) : 0}% of managers`, "/admin/users"],
    ["App installs", k.installs.toLocaleString("en-GB"), `${k.notif} with notifications on`, "/admin/app"],
    ["Revenue this week", `£${(k.revenueWeekMinor / 100).toFixed(2)}`, "Packs and MX top-ups", "/admin/prizes"],
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
