import Link from "next/link";
import { ClubBadge } from "@/components/club-badge";
import { KitShirt } from "@/components/kit-shirt";
import { EmptyState, PageHeader } from "@/components/page-header";
import type { Position } from "@/generated/prisma/client";
import { type PerformanceWindow, type PerformerRow, WINDOW_LABEL, performanceTable, windowGameweeks } from "@/server/top-performers";

export const metadata = { title: "Top performers" };

type SP = { w?: string; league?: string; pos?: string };
const LEAGUES = [
  ["EPL", "Premier League"],
  ["CHA", "Championship"],
  ["LG1", "League One"],
  ["LG2", "League Two"],
] as const;
const POSITIONS = ["GK", "DEF", "MID", "ATT"] as const;
const TIER_TEXT = { GOLD: "text-gold", SILVER: "text-silver", BRONZE: "text-bronze" } as const;

/** Points per gameweek as small bars: one per gameweek played, negative weeks drop below the line. */
function FormBars({ points, label }: { points: number[]; label: string }) {
  if (!points.length) return null;
  const max = Math.max(1, ...points.map(Math.abs));
  const w = 7;
  const gap = 2;
  const h = 28;
  const mid = points.some((p) => p < 0) ? h / 2 : h;
  return (
    <svg width={points.length * (w + gap)} height={h} role="img" aria-label={label}>
      <title>{label}</title>
      {points.map((p, i) => {
        const bh = Math.max(2, (Math.abs(p) / max) * (mid - 1));
        return <rect key={i} x={i * (w + gap)} y={p >= 0 ? mid - bh : mid} width={w} height={bh} rx={2} fill={p >= 0 ? "var(--color-chart)" : "var(--color-danger)"} />;
      })}
    </svg>
  );
}

function Shirt({ r, size = "h-9" }: { r: PerformerRow; size?: string }) {
  return <KitShirt kit={r.kit} number={r.squadNumber} id={`tp-${r.playerId}`} label={`${r.club ?? "Club"} home shirt`} className={`${size} w-auto`} />;
}

export default async function TopPerformersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const window: PerformanceWindow = sp.w === "last" || sp.w === "season" ? sp.w : "5";
  const league = LEAGUES.some(([c]) => c === sp.league) ? sp.league : undefined;
  const pos = POSITIONS.find((p) => p === sp.pos) as Position | undefined;
  const [rows, gws] = await Promise.all([performanceTable({ window, league, position: pos }), windowGameweeks(window)]);
  const all = league || pos ? await performanceTable({ window }) : rows;
  const leaders = LEAGUES.map(([code, name]) => ({ code, name, top: all.find((r) => r.league === code) })).filter((l) => l.top);
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ w: sp.w, league, pos, ...patch })) if (v) p.set(k, v);
    return `/top-performers${p.size ? `?${p}` : ""}`;
  };
  const span = gws.length ? (gws.length === 1 ? `Gameweek ${gws[0].number}` : `Gameweeks ${gws[gws.length - 1].number}–${gws[0].number}`) : "";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={span ? `${span} · ${gws[0].season}` : "From real match stats"}
        title="Top performers"
        intro="Players ranked by the points they've scored in MATCHX from their real matches: goals, assists, clean sheets, saves and the rest, before any captain bonus. Pick them for your squad and they score for you."
      />

      <nav className="flex flex-wrap items-center gap-2" aria-label="Filters">
        {(["last", "5", "season"] as const).map((w) => (
          <Link key={w} href={qs({ w: w === "5" ? undefined : w })} aria-current={window === w ? "page" : undefined} className={`chip ${window === w ? "border-accent text-fg" : ""}`}>
            {WINDOW_LABEL[w]}
          </Link>
        ))}
        <span className="mx-1 w-px self-stretch bg-ink-700" />
        <Link href={qs({ league: undefined })} className={`chip ${!league ? "border-accent text-fg" : ""}`}>
          All leagues
        </Link>
        {LEAGUES.map(([c, n]) => (
          <Link key={c} href={qs({ league: c })} className={`chip ${league === c ? "border-accent text-fg" : ""}`}>
            {n}
          </Link>
        ))}
        <span className="mx-1 w-px self-stretch bg-ink-700" />
        {POSITIONS.map((p) => (
          <Link key={p} href={qs({ pos: pos === p ? undefined : p })} className={`chip ${pos === p ? "border-accent text-fg" : ""}`}>
            {p}
          </Link>
        ))}
      </nav>

      {leaders.length > 0 && (
        <section>
          <h2 className="mb-3 text-2xl">Best in each league</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {leaders.map(({ code, name, top }) => (
              <li key={code}>
                <Link href={`/players/${top!.playerId}`} className={`panel tier-${top!.tier ?? "BRONZE"} flex h-full flex-col gap-3 p-4 hover:border-accent/60`}>
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-faint">{name}</span>
                  <span className="flex items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-ink-850">
                      <Shirt r={top!} size="h-10" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-display text-lg font-bold uppercase leading-tight">{top!.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {top!.position} · {top!.club}
                      </span>
                    </span>
                  </span>
                  <span className="mt-auto flex items-end justify-between gap-2">
                    <span>
                      <span className="font-display text-3xl font-black tabular-nums">{top!.points}</span>
                      <span className="ml-1 text-xs text-muted">pts</span>
                    </span>
                    <FormBars points={top!.byGameweek} label={`Points per gameweek: ${top!.byGameweek.join(", ")}`} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-2xl">
          Rankings{league ? ` · ${LEAGUES.find(([c]) => c === league)![1]}` : ""}
          {pos ? ` · ${pos}` : ""}
        </h2>
        {rows.length === 0 ? (
          <EmptyState title="No points yet">Rankings appear once the first matches of the season have been scored.</EmptyState>
        ) : (
          <ol className="space-y-2">
            {rows.slice(0, 50).map((r, i) => (
              <li key={r.playerId} className={`row-item tier-${r.tier ?? "BRONZE"} gap-3 sm:gap-4`}>
                <span className={`w-7 shrink-0 text-center font-display text-xl font-black tabular-nums ${i < 3 ? "text-lime" : "text-muted"}`}>{i + 1}</span>
                <Link href={`/players/${r.playerId}`} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-90">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ink-850">
                    <Shirt r={r} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-display text-lg font-bold uppercase leading-tight tracking-wide">{r.name}</span>
                      {r.tier && <span className={`hidden text-[10px] font-extrabold uppercase tracking-[0.16em] sm:inline ${TIER_TEXT[r.tier]}`}>{r.tier}</span>}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                      <ClubBadge short={r.clubShort ?? "?"} primary={r.clubPrimary} secondary={r.clubSecondary} kit={r.kit} size={14} title={r.club ?? undefined} />
                      <span className="truncate">
                        {r.position} · {r.club ?? "Free agent"} <span className="text-faint">{r.league}</span>
                      </span>
                    </span>
                  </span>
                </Link>
                <span className="hidden md:block">
                  <FormBars points={r.byGameweek} label={`Points per gameweek: ${r.byGameweek.join(", ")}`} />
                </span>
                <Stat label="Apps">{r.apps}</Stat>
                <Stat label="G" className="hidden sm:block">{r.goals}</Stat>
                <Stat label="A" className="hidden sm:block">{r.assists}</Stat>
                <span className="w-16 shrink-0 text-right">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Points</span>
                  <span className="font-display text-2xl font-black tabular-nums">{r.points}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Stat({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={`w-10 shrink-0 text-right ${className}`}>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</span>
      <span className="font-bold tabular-nums">{children}</span>
    </span>
  );
}
