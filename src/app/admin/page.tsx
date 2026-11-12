import Link from "next/link";
import { supplyWatchedAction } from "@/app/actions/admin";
import { ActionButton } from "@/components/action-button";
import { AdminChart } from "@/components/admin-chart";
import { watchedNotForSale } from "@/server/rare-demand";
import { dashboard, gameHealth } from "@/server/analytics";
import { AdminTitle } from "./_parts/title";

export const metadata = { title: "Admin" };

export default async function Dashboard() {
  const [d, h, gaps] = await Promise.all([dashboard(), gameHealth(), watchedNotForSale()]);
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
    ["Watched, not for sale", gaps.total, "/admin#watched"],
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
      <section id="watched" className="panel scroll-mt-24 p-4">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold">👀 Watched — not for sale</h2>
          <span className="text-xs text-muted">{gaps.total} player{gaps.total === 1 ? "" : "s"}</span>
        </div>
        <p className="mb-3 text-xs text-muted">
          Managers are watching these players but no one is selling them anywhere. Put a copy from the unowned pool on the MATCHX market at its value, or start a 24-hour auction from half its value — everyone watching is told straight away.
        </p>
        {gaps.rows.length === 0 ? (
          <p className="text-sm text-faint">Every watched player is on sale somewhere right now.</p>
        ) : (
          <ul className="divide-y divide-ink-700/60">
            {gaps.rows.map((g) => (
              <li key={g.playerId} className="space-y-2 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0">
                    <Link href={`/players/${g.playerId}`} className="font-bold hover:text-lime">{g.name}</Link>
                    {g.club && <span className="ml-2 text-xs text-faint">{g.club}</span>}
                  </span>
                  <span className="shrink-0 rounded-full bg-warn/15 px-2.5 py-0.5 text-xs font-black text-warn">👁 {g.watchers} watching</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.tiers.map((t) =>
                    t.stock > 0 ? (
                      <span key={t.category} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-ink-700 bg-ink-850 px-2 py-1.5 text-xs">
                        <b className={t.category === "GOLD" ? "text-gold" : t.category === "SILVER" ? "text-silver" : "text-bronze"}>{t.category}</b>
                        <span className="text-faint">{t.stock} in pool{t.valueMinor ? ` · £${(t.valueMinor / 100).toFixed(2)}` : ""}</span>
                        <ActionButton action={supplyWatchedAction.bind(null, g.playerId, t.category, "market")} className="btn-primary px-2.5 py-1 text-[10px]">Add to market</ActionButton>
                        <ActionButton action={supplyWatchedAction.bind(null, g.playerId, t.category, "auction")} className="btn-ghost px-2.5 py-1 text-[10px]">Auction 24h</ActionButton>
                      </span>
                    ) : (
                      <span key={t.category} className="rounded-xl border border-ink-800 px-2 py-1.5 text-xs text-faint">{t.category.toLowerCase()}: none in pool</span>
                    ),
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
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
