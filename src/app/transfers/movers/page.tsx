import Link from "next/link";
import { KitShirt } from "@/components/kit-shirt";
import { PageHeader } from "@/components/page-header";
import type { Kit } from "@/lib/kit";
import { requireUser } from "@/server/auth/session";
import { marketMovers } from "@/server/movers";
import { fmtMp } from "@/server/wallet";

export const metadata = { title: "Market movers" };
export const dynamic = "force-dynamic";

type P = { name: string; position: string; squadNumber: number | null; club: string; kit: Kit };

function Who({ id, p, n }: { id: string; p: P; n: number }) {
  return (
    <Link href={`/players/${id}`} className="flex min-w-0 flex-1 items-center gap-3">
      <span className="w-5 shrink-0 text-center font-display text-base font-black text-faint">{n}</span>
      <KitShirt kit={p.kit} number={p.squadNumber} id={`mv-${id}-${n}`} label={`${p.club} shirt`} className="h-8 w-auto shrink-0" />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{p.name}</span>
        <span className="block truncate text-xs text-muted">
          {p.position} · {p.club}
        </span>
      </span>
    </Link>
  );
}

function Board({ title, sub, children, empty }: { title: string; sub: string; children: React.ReactNode[]; empty: string }) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-ink-700 px-4 py-3">
        <h2 className="font-display text-2xl font-black uppercase italic leading-none">{title}</h2>
        <p className="text-xs text-faint">{sub}</p>
      </div>
      {children.length ? <ol className="divide-y divide-ink-800">{children}</ol> : <p className="px-4 py-5 text-sm text-faint">{empty}</p>}
    </section>
  );
}

export default async function MoversPage() {
  await requireUser();
  const m = await marketMovers();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Transfers" title="Market movers" intro="Who's rising and falling in value this week, who's changing hands most, and the biggest sales ever. Values move with real form and the market." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Board title="▲ Risers" sub="Biggest value gains over the last 7 days" empty="No risers yet — values update after each gameweek.">
          {m.risers.map((r, i) => (
            <li key={`${r.playerId}${r.category}`} className="flex items-center gap-3 px-4 py-2.5">
              <Who id={r.playerId} p={r.player} n={i + 1} />
              <span className="shrink-0 text-right">
                <span className="block font-bold tabular-nums">{r.now} MX</span>
                <span className="block text-xs font-bold tabular-nums text-mint">▲ {r.pct}%</span>
              </span>
            </li>
          ))}
        </Board>
        <Board title="▼ Fallers" sub="Biggest value drops over the last 7 days" empty="No fallers this week.">
          {m.fallers.map((r, i) => (
            <li key={`${r.playerId}${r.category}`} className="flex items-center gap-3 px-4 py-2.5">
              <Who id={r.playerId} p={r.player} n={i + 1} />
              <span className="shrink-0 text-right">
                <span className="block font-bold tabular-nums">{r.now} MX</span>
                <span className="block text-xs font-bold tabular-nums text-danger">▼ {Math.abs(r.pct)}%</span>
              </span>
            </li>
          ))}
        </Board>
        <Board title="🔥 Most traded" sub="Sales on the Transfer list and auctions in the last 7 days" empty="No sales this week yet.">
          {m.traded.map((t, i) => (
            <li key={t.playerId} className="flex items-center gap-3 px-4 py-2.5">
              <Who id={t.playerId} p={t.player} n={i + 1} />
              <span className="shrink-0 text-right">
                <span className="block font-bold tabular-nums">
                  {t.sales} sale{t.sales > 1 ? "s" : ""}
                </span>
                <span className="block text-xs tabular-nums text-muted">avg {fmtMp(t.avgMinor)}</span>
              </span>
            </li>
          ))}
        </Board>
        <Board title="🏆 Record sales" sub="The most ever paid for a card" empty="No sales yet — the first big one goes here.">
          {m.records.map((r, i) => (
            <li key={`${r.playerId}${r.soldAt.toISOString()}`} className="flex items-center gap-3 px-4 py-2.5">
              <Who id={r.playerId} p={r.player} n={i + 1} />
              <span className="shrink-0 text-right">
                <span className="block font-bold tabular-nums text-gold">{fmtMp(r.price)}</span>
                <span className="block text-xs text-muted">
                  {r.finish ? `${r.finish.toLowerCase()} · ` : ""}
                  {r.category.toLowerCase()} #{r.serial}
                </span>
              </span>
            </li>
          ))}
        </Board>
      </div>
    </div>
  );
}
