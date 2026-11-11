import Link from "next/link";
import { notFound } from "next/navigation";
import { ManagerBadge } from "@/components/club-crest";
import { FoundingBadge } from "@/components/founding-badge";
import { PlayerCard } from "@/components/player-card";
import { BOOSTERS, type BoosterKind } from "@/config/boosters";
import type { SelectionResult } from "@/domain/football/scoring";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { posterCards } from "@/server/social";
import { cardViews } from "@/server/views";
import { toCrest } from "@/lib/crest";

export const metadata = { title: "Team" };

/**
 * Another manager's team in a match: their starting seven and subs, each player's points and how
 * they were won, the booster they played and any rare cards. Only once squads have locked, so
 * nobody can copy a squad before the deadline.
 */
export default async function TeamPage({ params }: { params: Promise<{ id: string; entryId: string }> }) {
  const user = await requireUser();
  const { id, entryId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(entryId)) notFound();
  const entry = await db.competitionEntry.findUnique({
    where: { id: entryId },
    include: { competition: { include: { gameweek: true } }, user: { select: { displayName: true, foundingNumber: true, clubName: true, crest: true } }, selections: true },
  });
  if (!entry || entry.competitionId !== id || entry.status !== "ACTIVE") notFound();
  const comp = entry.competition;
  const back = (
    <Link href={`/competitions/${id}`} className="btn-ghost w-fit px-4 py-2 text-xs">
      ← {comp.name}
    </Link>
  );
  if (comp.status === "OPEN" && entry.userId !== user.id) {
    return (
      <div className="space-y-4">
        {back}
        <div className="panel p-6 text-muted">Teams are hidden until squads lock, so nobody can copy one. Check back after the deadline.</div>
      </div>
    );
  }
  const calc = await db.scoreCalculation.findFirst({ where: { entryId }, orderBy: { createdAt: "desc" } });
  const breakdown = calc?.breakdown as { selections: SelectionResult[] } | undefined;
  const [cards, draftFaces] = await Promise.all([
    cardViews({ id: { in: entry.selections.flatMap((s) => (s.cardId ? [s.cardId] : [])) } }),
    posterCards(entry.selections.filter((s) => !s.cardId).map((s) => s.playerId)),
  ]);
  const face = new Map([...cards.map((c) => [c.id, c] as const), ...draftFaces.map((c) => [`draft:${c.playerId}`, c] as const)]);
  const boost = entry.boosterKind && entry.boosterKind in BOOSTERS ? BOOSTERS[entry.boosterKind as BoosterKind] : null;
  // Before any match data, show the squad as picked.
  const rows: Array<SelectionResult | { cardId: string; slot: "STARTER" | "BENCH"; order: number; points: null; items: []; counted: true; boosted?: boolean; captain?: boolean }> =
    breakdown?.selections ??
    entry.selections
      .sort((a, b) => (a.slot === b.slot ? a.order - b.order : a.slot === "STARTER" ? -1 : 1))
      .map((s) => ({ cardId: s.cardId ?? `draft:${s.playerId}`, slot: s.slot, order: s.order, points: null, items: [], counted: true, boosted: s.isBoosted, captain: s.isCaptain }));
  const total = comp.status === "SETTLED" ? entry.finalPoints : entry.provisionalPoints;
  const rare = cards.filter((c) => c.finish).length;
  const cell = (r: (typeof rows)[number]) => {
    const c = face.get(r.cardId);
    if (!c) return null;
    return (
      <div key={r.cardId} className={`flex w-36 flex-col items-center gap-1.5 text-center ${r.counted ? "" : "opacity-50"}`}>
        <div className="rounded-[20px]" style={r.boosted && boost ? { boxShadow: `0 0 0 3px ${boost.color}, 0 0 18px ${boost.color}` } : undefined}>
          <PlayerCard card={c} size="sm" />
        </div>
        <b className={r.counted ? "text-lime" : "text-faint"}>
          {r.points === null ? "–" : `${r.points} pts`}
          {r.captain && <span className="ml-1 rounded bg-accent px-1 text-[10px] text-accent-ink">C</span>}
        </b>
        <span className="text-[10px] leading-snug text-faint">
          {r.items.length ? r.items.map((i) => `${i.event}${i.count > 1 ? ` ×${i.count}` : ""} ${i.points > 0 ? "+" : ""}${i.points}`).join(" · ") : r.points === null ? "" : "no points"}
        </span>
      </div>
    );
  };
  return (
    <div className="space-y-6">
      {back}
      <header className="flex flex-wrap items-center gap-4">
        <ManagerBadge crest={toCrest(entry.user.crest)} name={entry.user.displayName} id={`team-${entry.id}`} size={48} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">
            {comp.name} · GW{comp.gameweek.number}
          </p>
          <h1 className="font-display text-3xl font-black uppercase italic">
            {entry.user.displayName} <FoundingBadge number={entry.user.foundingNumber} compact />
          </h1>
          {entry.user.clubName && <p className="text-sm text-muted">{entry.user.clubName}</p>}
        </div>
        <div className="text-right">
          <div className="text-3xl font-black text-lime">{total ?? "–"}</div>
          <div className="text-xs text-faint">{comp.status === "SETTLED" ? `final · #${entry.rank}` : "provisional"}</div>
        </div>
      </header>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-ink-700 px-3 py-1">Formation 1-{entry.formation}</span>
        {boost && (
          <span className="rounded-full border-2 px-3 py-1 font-semibold" style={{ borderColor: boost.color }}>
            {boost.icon} {boost.name} booster
          </span>
        )}
        {rare > 0 && <span className="rounded-full border border-gold/60 px-3 py-1 font-semibold text-gold">{rare} rare card{rare > 1 ? "s" : ""}</span>}
      </div>
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted">Starting seven</h2>
        <div className="flex flex-wrap justify-center gap-4 sm:justify-start">{rows.filter((r) => r.slot === "STARTER").map(cell)}</div>
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted">Subs</h2>
        <div className="flex flex-wrap justify-center gap-4 sm:justify-start">{rows.filter((r) => r.slot === "BENCH").map(cell)}</div>
      </section>
      <p className="text-xs text-faint">Faded players&apos; points didn&apos;t count: they didn&apos;t play, or were subs who weren&apos;t needed.</p>
    </div>
  );
}
