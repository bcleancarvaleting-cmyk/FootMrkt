import Link from "next/link";
import { Sparkline } from "@/components/card-row";
import { KitShirt } from "@/components/kit-shirt";
import { topMovers } from "@/server/movers";

/**
 * "Market movers" on the market pages: tap to open the top 5 movers this week — value graph, value
 * now, 7-day change and expected value — each one tap from buying.
 */
export async function MoversPanel({ n = 5, open = false, guest = false }: { n?: number; open?: boolean; guest?: boolean } = {}) {
  const rows = await topMovers(n).catch(() => []);
  return (
    <details open={open} className="group rounded-2xl border border-ink-700 bg-ink-900">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-xl" aria-hidden="true">📈</span>
        <span className="min-w-0 flex-1">
          <b className="block font-display text-xl font-black uppercase italic leading-none">Market movers</b>
          <span className="text-xs text-muted">Top {n} this week · graphs, prices and expected values</span>
        </span>
        <span className="text-xs font-bold text-lime group-open:hidden">Show ▾</span>
        <span className="hidden text-xs font-bold text-lime group-open:inline">Hide ▴</span>
      </summary>
      {rows.length === 0 ? (
        <p className="border-t border-ink-700 px-4 py-4 text-sm text-faint">No big moves yet — values update after each gameweek.</p>
      ) : (
        <ol className="divide-y divide-ink-800 border-t border-ink-700">
          {rows.map((r, i) => (
            <li key={`${r.playerId}${r.category}`} className="flex items-center gap-3 px-4 py-3">
              <span className="w-4 shrink-0 text-center font-display text-base font-black text-faint">{i + 1}</span>
              <KitShirt kit={r.player.kit} number={r.player.squadNumber} id={`mp-${r.playerId}`} label={`${r.player.club} shirt`} className="h-9 w-auto shrink-0" />
              <span className="min-w-0 flex-1">
                <Link href={guest ? "/register" : `/players/${r.playerId}`} className="line-clamp-2 block font-semibold leading-tight hover:text-lime">{r.player.name}</Link>
                <span className="block truncate text-[11px] text-muted">
                  {r.player.position} · {r.player.club} · {r.category.toLowerCase()}
                </span>
                <span className="mt-1 block sm:hidden">
                  <Sparkline points={r.history} width={120} height={24} />
                </span>
              </span>
              <span className="hidden sm:block">
                <Sparkline points={r.history} width={110} height={30} />
              </span>
              <span className="w-[86px] shrink-0 text-right">
                <span className="block font-bold tabular-nums">£{Number(r.now).toFixed(2)}</span>
                {r.pct !== 0 && <span className={`block text-[11px] font-bold tabular-nums ${r.pct > 0 ? "text-mint" : "text-danger"}`}>{r.pct > 0 ? "▲" : "▼"} {Math.abs(r.pct)}% 7d</span>}
                <span className="block text-[10px] text-faint">{r.expected ? <>expected <b className="text-fg">£{r.expected.value.toFixed(2)}</b></> : "expected —"}</span>
              </span>
              <Link href={guest ? "/register" : `/transfers/find/${r.playerId}`} className="btn-primary shrink-0 px-3 py-2 text-[10px]">Buy</Link>
            </li>
          ))}
        </ol>
      )}
      <div className="border-t border-ink-700 px-4 py-2 text-right">
        <Link href={guest ? "/register" : "/transfers/movers"} className="text-xs font-bold text-lime">{guest ? "Join free to trade →" : "All market movers →"}</Link>
      </div>
    </details>
  );
}
