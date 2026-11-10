import Link from "next/link";
import { FoundingBadge } from "@/components/founding-badge";
import { type Requirements, requirementsSummary } from "@/server/competitions";
import { fmtMp } from "@/server/wallet";
import { notFound } from "next/navigation";
import { type BuilderCard, SquadBuilder } from "@/components/squad-builder";
import { FORMATIONS, categoriesForFormat, getRosterRules } from "@/domain/football/rules";
import type { SelectionResult } from "@/domain/football/scoring";
import { getScoringRules } from "@/domain/football/scoring";
import { requireUser } from "@/server/auth/session";
import { leaderboard } from "@/server/competitions";
import { db } from "@/server/db";
import { recentForm } from "@/server/form";
import { cardViews } from "@/server/views";
import { type Pos, fmtDate, relativeTime } from "@/lib/view";

export const metadata = { title: "Competition" };

export default async function CompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const comp = await db.competition.findUnique({ where: { id }, include: { gameweek: true } });
  if (!comp) notFound();
  const entry = await db.competitionEntry.findUnique({
    where: { competitionId_userId: { competitionId: id, userId: user.id } },
    include: { selections: true },
  });
  const rules = getRosterRules(comp.rosterRules);
  const scoring = getScoringRules(comp.scoringRules);
  const board = await leaderboard(id);
  const open = comp.status === "OPEN" && comp.locksAt > new Date();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/matches" className="text-xs text-faint hover:text-fg">
            ← Gameweek {comp.gameweek.number}
          </Link>
          <h1 className="mt-1 text-5xl font-extrabold">{comp.name}</h1>
          <p className="text-sm text-muted">
            {requirementsSummary((comp.requirements ?? {}) as Requirements, comp.format)} · {comp.entryFeeMinor > 0 ? `${fmtMp(comp.entryFeeMinor)} entry` : "free entry"} · 7 starters + 4 subs ·{" "}
            {open ? `locks ${relativeTime(comp.locksAt)} (${fmtDate(comp.locksAt)})` : comp.status.toLowerCase()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="chip">Roster: {rules.id}</span>
          <span className={`chip ${scoring.status === "DRAFT" ? "border-warn/50 text-warn" : ""}`}>
            Scoring: {scoring.id}
            {scoring.status === "DRAFT" && " (draft)"}
          </span>
        </div>
      </div>

      {open ? (
        <Builder userId={user.id} competition={comp} entry={entry} />
      ) : entry ? (
        <Result entryId={entry.id} settled={comp.status === "SETTLED"} />
      ) : (
        <div className="panel p-6 text-muted">You didn&apos;t enter this competition.</div>
      )}

      <section>
        <h2 className="mb-3 text-xl font-bold">
          Leaderboard{" "}
          <span className="text-sm font-normal text-faint">{comp.status === "SETTLED" ? "· final" : comp.status === "OPEN" ? "· entries so far" : "· provisional"}</span>
        </h2>
        <div className="panel divide-y divide-ink-700/60">
          {board.map((r) => (
            <div key={r.entryId} className={`flex items-center gap-4 px-4 py-2.5 text-sm ${r.userId === user.id ? "bg-lime/5" : ""}`}>
              <span className="w-8 font-mono text-faint">{comp.status === "OPEN" ? "–" : `#${r.rank}`}</span>
              <span className="flex-1 font-semibold">
                {r.displayName} <FoundingBadge number={r.foundingNumber} compact />
                {r.userId === user.id && <span className="ml-2 text-xs text-lime">you</span>}
              </span>
              <span className="font-bold">{comp.status === "OPEN" ? "" : `${r.points} pts`}</span>
            </div>
          ))}
          {!board.length && <div className="px-4 py-6 text-center text-faint">No entries yet. Be the first!</div>}
        </div>
      </section>
    </div>
  );
}

async function Builder({
  userId,
  competition,
  entry,
}: {
  userId: string;
  competition: { id: string; gameweekId: string; rosterRules: string; format: "OPEN" | "BRONZE_ONLY" | "SILVER_ONLY" | "GOLD_ONLY" };
  entry: { id: string; formation: string; selections: Array<{ cardId: string; slot: string; position: string; order: number }> } | null;
}) {
  const rules = getRosterRules(competition.rosterRules);
  const cards = await cardViews({ ownerId: userId, supplyState: "HELD" }, [{ template: { player: { position: "asc" } } }]);
  const form = await recentForm([...new Set(cards.map((c) => c.playerId))]);
  const fixtures = await db.fixture.findMany({
    where: { gameweekId: competition.gameweekId },
    include: { homeClub: true, awayClub: true },
  });
  const fixtureFor = (clubCode: string | null) => {
    const f = fixtures.find((x) => x.homeClub.code === clubCode || x.awayClub.code === clubCode);
    if (!f) return null;
    return f.homeClub.code === clubCode ? `vs ${f.awayClub.shortName} (H)` : `vs ${f.homeClub.shortName} (A)`;
  };
  const builderCards: BuilderCard[] = cards.map((c) => {
    const mine = c.lock === "COMPETITION" && entry && c.lockRef === entry.id;
    const available = c.lock === "NONE" || !!mine;
    return {
      ...c,
      available,
      unavailableReason: available ? undefined : c.lock === "LISTED" ? "listed on market" : "in another squad",
      form: form.get(c.playerId) ?? [],
      fixture: fixtureFor(c.clubCode),
    };
  });
  const initial = entry
    ? {
        formation: entry.formation,
        starters: entry.selections.filter((s) => s.slot === "STARTER").sort((a, b) => a.order - b.order).map((s) => ({ cardId: s.cardId, position: s.position as Pos })),
        bench: entry.selections.filter((s) => s.slot === "BENCH").sort((a, b) => a.order - b.order).map((s) => s.cardId),
      }
    : null;
  return (
    <SquadBuilder
      competitionId={competition.id}
      formations={rules.allowedFormations.map((f) => FORMATIONS[f])}
      allowedCategories={categoriesForFormat(competition.format)}
      cards={builderCards}
      initial={initial}
      hasEntry={!!entry}
    />
  );
}

async function Result({ entryId, settled }: { entryId: string; settled: boolean }) {
  const calc = await db.scoreCalculation.findFirst({ where: { entryId }, orderBy: { createdAt: "desc" } });
  const entry = await db.competitionEntry.findUniqueOrThrow({ where: { id: entryId } });
  const cards = await cardViews({ id: { in: (await db.competitionSelection.findMany({ where: { entryId } })).map((s) => s.cardId) } });
  const byId = new Map(cards.map((c) => [c.id, c]));
  const breakdown = calc?.breakdown as { selections: SelectionResult[]; substitutions: Array<{ off: string; on: string; benchOrder: number }>; formationUsed: string | null } | undefined;
  if (!calc || !breakdown) {
    return (
      <div className="panel p-6 text-muted">
        Squad locked in with formation 1-{entry.formation}. Points will appear here as soon as match data arrives.
      </div>
    );
  }
  const starters = breakdown.selections.filter((s) => s.slot === "STARTER");
  const bench = breakdown.selections.filter((s) => s.slot === "BENCH");
  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="panel p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-bold">Your squad</h2>
          <div className="text-right">
            <div className="text-3xl font-black text-lime">{calc.totalPoints}</div>
            <div className="text-xs text-faint">{settled ? `final · rank #${entry.rank}` : "provisional"}</div>
          </div>
        </div>
        <div className="space-y-1.5">
          {[...starters, ...bench].map((s) => {
            const c = byId.get(s.cardId);
            return (
              <details key={s.cardId} className={`rounded-lg border px-3 py-2 ${s.counted ? "border-ink-700 bg-ink-850" : "border-transparent bg-ink-900/50 opacity-70"}`}>
                <summary className="flex cursor-pointer items-center gap-3 text-sm">
                  <span className="w-12 text-[11px] text-faint">{s.slot === "BENCH" ? `Sub ${s.order}` : s.position}</span>
                  <span className="flex-1 font-semibold">
                    {c?.name}
                    {s.subbedOffFor && <span className="ml-2 text-[11px] text-danger">↓ off (didn&apos;t play)</span>}
                    {s.slot === "STARTER" && !s.subbedOffFor && s.appearance === "DID_NOT_PLAY" && (
                      <span className="ml-2 text-[11px] text-danger">didn&apos;t play · no compatible sub</span>
                    )}
                    {s.subbedOnFor && <span className="ml-2 text-[11px] text-mint">↑ auto-sub on</span>}
                    {s.appearance === "PENDING" && <span className="ml-2 text-[11px] text-faint">yet to play</span>}
                  </span>
                  <span className={`font-bold ${s.counted ? "text-lime" : "text-faint"}`}>{s.points}</span>
                </summary>
                <ul className="mt-2 space-y-0.5 pl-12 text-xs text-muted">
                  {s.items.map((i) => (
                    <li key={i.event} className="flex justify-between">
                      <span>
                        {i.event}
                        {i.count > 1 ? ` ×${i.count}` : ""}
                      </span>
                      <span>{i.points > 0 ? `+${i.points}` : i.points}</span>
                    </li>
                  ))}
                  {!s.items.length && <li>No points</li>}
                  {!s.counted && s.slot === "BENCH" && <li className="text-faint">Bench points don&apos;t count unless subbed on</li>}
                </ul>
              </details>
            );
          })}
        </div>
      </div>
      <aside className="panel space-y-3 p-5 text-sm">
        <h3 className="font-bold">Match report</h3>
        <p className="text-muted">
          Formation fielded: <b className="text-fg">1-{breakdown.formationUsed ?? entry.formation}</b>
        </p>
        <p className="text-muted">
          {breakdown.substitutions.length
            ? `${breakdown.substitutions.length} automatic substitution${breakdown.substitutions.length > 1 ? "s" : ""} made in bench order.`
            : "No substitutions needed."}
        </p>
        <p className="text-xs text-faint">
          Calculated with {calc.ruleVersion} at {fmtDate(calc.createdAt)}. Scores can be recalculated from the stored match events.
          {!settled && " Provisional — stat corrections may still change these numbers."}
        </p>
      </aside>
    </section>
  );
}
