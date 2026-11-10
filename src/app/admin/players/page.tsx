import Link from "next/link";
import { cancelPlayerDropAction } from "@/app/actions/economy";
import { ActionButton } from "@/components/action-button";
import { DropScheduler } from "@/components/drop-scheduler";
import { playerDatabase, upcomingDropsAdmin } from "@/server/player-drops";
import { fmtMp } from "@/server/wallet";
import { fmtDate } from "@/lib/view";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Player database" };

type SP = { q?: string; league?: string; tier?: string; sort?: string };

export default async function PlayersAdmin({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [rows, drops] = await Promise.all([playerDatabase({ ...sp, take: 150 }), upcomingDropsAdmin()]);
  const now = new Date();
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
    return `/admin/players${p.size ? `?${p}` : ""}`;
  };
  return (
    <>
      <AdminTitle title="Player database & drops" intro="Every player's supply in their current tier. Tick players to release them as daily drops: one new copy each, a set price, live from a set time with no end." />
      <form action="/admin/players" className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Search player or club" className="input max-w-xs" />
        {(["EPL", "CHA", "LG1", "LG2", "NL"] as const).map((l) => (
          <Link key={l} href={qs({ league: sp.league === l ? undefined : l })} className={`chip ${sp.league === l ? "border-accent text-fg" : ""}`}>
            {l}
          </Link>
        ))}
        <span className="mx-1 w-px self-stretch bg-ink-700" />
        {(["GOLD", "SILVER", "BRONZE"] as const).map((t) => (
          <Link key={t} href={qs({ tier: sp.tier === t ? undefined : t })} className={`chip ${sp.tier === t ? "border-accent text-fg" : ""}`}>
            {t[0] + t.slice(1).toLowerCase()}
          </Link>
        ))}
        <span className="mx-1 w-px self-stretch bg-ink-700" />
        {[
          ["", "By value"],
          ["pct_asc", "Least circulated"],
          ["pct_desc", "Most circulated"],
          ["name", "A–Z"],
        ].map(([k, l]) => (
          <Link key={l} href={qs({ sort: k || undefined })} className={`chip ${(sp.sort ?? "") === k ? "border-accent text-fg" : ""}`}>
            {l}
          </Link>
        ))}
      </form>
      <DropScheduler rows={rows} />
      <section className="panel p-5">
        <h2 className="mb-3 text-2xl">Scheduled & live drops · {drops.length}</h2>
        <ul className="divide-y divide-ink-700 text-sm">
          {drops.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span>
                <b>{d.card.template.player.displayName}</b>{" "}
                <span className="text-faint">
                  · {d.card.template.player.club?.name} · {d.card.template.category.toLowerCase()} · {fmtMp(d.askingPriceMinor)} · {d.liveAt && d.liveAt > now ? `goes live ${fmtDate(d.liveAt)}` : "live now"}
                </span>
              </span>
              <ActionButton action={cancelPlayerDropAction.bind(null, d.id)} className="btn-ghost px-3 py-1.5 text-[11px]" confirm="Withdraw this drop?">
                Withdraw
              </ActionButton>
            </li>
          ))}
          {!drops.length && <li className="py-2 text-faint">No drops scheduled.</li>}
        </ul>
      </section>
    </>
  );
}
