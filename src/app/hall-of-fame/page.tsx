import Link from "next/link";
import { seasonArchives } from "@/server/season";
import { ClubCrest } from "@/components/club-crest";
import { Gem } from "@/components/finish-art";
import { EmptyState, PageHeader } from "@/components/page-header";
import { PlayerCard } from "@/components/player-card";
import { fmtDate } from "@/lib/view";
import { hallOfFame } from "@/server/hall-of-fame";

export const metadata = { title: "Hall of Fame" };

type Holder = Awaited<ReturnType<typeof hallOfFame>>["rainbows"][number]["holder"];

function HolderLine({ holder, id }: { holder: Holder; id: string }) {
  if (!holder) return <p className="text-xs text-faint">Back in circulation</p>;
  return (
    <Link href={`/clubs/${encodeURIComponent(holder.name)}`} className="flex items-center justify-center gap-1.5 text-xs hover:underline">
      {holder.crest && <ClubCrest crest={holder.crest} id={id} size={16} />}
      <b className="text-fg">{holder.name}</b>
      {holder.clubName && <span className="truncate text-faint">· {holder.clubName}</span>}
    </Link>
  );
}

export default async function HallOfFamePage() {
  const [{ rainbows, diamonds, counts }, seasons] = await Promise.all([hallOfFame(), seasonArchives()]);
  const n = (v: number) => v.toLocaleString("en-GB");
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="The rarest cards in MATCHX"
        title="Hall of Fame"
        intro="Every player has exactly one Rainbow card: a one of one that can come out of any pack or player drop, Bronze included. Here's every one found so far, and who holds it."
      />

      <section className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-ink-700 bg-ink-700">
        {[
          ["RAINBOW", "Rainbows found", `${n(counts.rainbows)}`, `of ${n(counts.rainbowsTotal)}`],
          ["DIAMOND", "Diamonds found", `${n(counts.diamonds)}`, `of ${n(counts.diamondsTotal)}`],
          ["RUBY", "Rubies found", `${n(counts.rubies)}`, `of ${n(counts.rubiesTotal)}`],
        ].map(([kind, label, v, of]) => (
          <div key={kind} className="flex flex-col items-center gap-1 bg-ink-900 p-4 text-center">
            <Gem kind={kind as "RAINBOW"} id={`hof-${kind}`} size={26} />
            <p className="eyebrow">{label}</p>
            <p className="font-display text-3xl font-black tabular-nums">{v}</p>
            <p className="text-xs text-faint">{of}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="rainbow-name mb-4 text-3xl">Rainbows · one of one</h2>
        {rainbows.length === 0 ? (
          <EmptyState title="None found yet">Every pack and player drop could hold one. The first manager to pull a Rainbow goes straight in here.</EmptyState>
        ) : (
          <ul className="flex flex-wrap justify-center gap-6 sm:justify-start">
            {rainbows.map((r) => (
              <li key={r.card.id} className="flex w-44 flex-col items-center gap-2">
                <Link href={`/cards/${r.card.id}`}>
                  <PlayerCard card={r.card} />
                </Link>
                <HolderLine holder={r.holder} id={`r-${r.card.id}`} />
                <p className="text-[10px] text-faint">Found {fmtDate(r.foundAt, { dateStyle: "medium" })}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {diamonds.length > 0 && (
        <section>
          <h2 className="diamond-name mb-4 text-3xl">Latest Diamonds</h2>
          <ul className="flex flex-wrap justify-center gap-6 sm:justify-start">
            {diamonds.map((d) => (
              <li key={d.card.id} className="flex w-32 flex-col items-center gap-2">
                <Link href={`/cards/${d.card.id}`}>
                  <PlayerCard card={d.card} size="sm" />
                </Link>
                <HolderLine holder={d.holder} id={`d-${d.card.id}`} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {seasons.length > 0 && (
        <section>
          <h2 className="mb-4 text-3xl">Past seasons</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {seasons.map((s) => {
              const top = (s.standings as Array<{ displayName: string; clubName: string | null; points: number; wins: number }>).slice(0, 3);
              return (
                <li key={s.season} className="panel p-4">
                  <p className="eyebrow">Season {s.season}</p>
                  <p className="mt-1 font-display text-2xl font-black uppercase italic">🏆 {s.champion ?? "—"}</p>
                  <ol className="mt-2 space-y-0.5 text-sm text-muted">
                    {top.map((t, i) => (
                      <li key={t.displayName} className="flex justify-between">
                        <span>
                          {i + 1}. <Link href={`/clubs/${encodeURIComponent(t.displayName)}`} className="hover:underline">{t.displayName}</Link>
                        </span>
                        <span className="tabular-nums">{t.points} pts</span>
                      </li>
                    ))}
                  </ol>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
