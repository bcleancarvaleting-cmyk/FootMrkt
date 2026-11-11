import Link from "next/link";
import { ManagerBadge } from "@/components/club-crest";
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
import { BOOSTERS, type BoosterKind } from "@/config/boosters";
import { myBoosters } from "@/server/boosters";
import { draftPool, draftPrice } from "@/server/draft";
import { posterCards } from "@/server/social";
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
        ((comp.requirements ?? {}) as Requirements).draftBudgetMx ? (
          <DraftBuilder userId={user.id} competition={comp} entry={entry} />
        ) : (
          <Builder userId={user.id} competition={comp} entry={entry} />
        )
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
              <span className="flex w-7 shrink-0 justify-center">
                <ManagerBadge crest={r.crest} name={r.displayName} id={`lb-${r.entryId}`} size={28} />
              </span>
              <span className="min-w-0 flex-1">
                <Link href={`/clubs/${encodeURIComponent(r.displayName)}`} className="block truncate font-semibold hover:underline">
                  {r.displayName} <FoundingBadge number={r.foundingNumber} compact />
                  {r.userId === user.id && <span className="ml-2 text-xs text-lime">you</span>}
                </Link>
                {r.clubName && <span className="block truncate text-xs text-faint">{r.clubName}</span>}
              </span>
              {r.prizeMinor > 0 && <span className="font-bold text-lime">£{(r.prizeMinor / 100).toFixed(2)}</span>}
              <span className="font-bold">{comp.status === "OPEN" ? "" : `${r.points} pts`}</span>
              {(comp.status !== "OPEN" || r.userId === user.id) && (
                <Link href={`/competitions/${comp.id}/team/${r.entryId}`} className="rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-muted hover:text-fg" aria-label={`See ${r.displayName}'s team`}>
                  Team ›
                </Link>
              )}
            </div>
          ))}
          {!board.length && <div className="px-4 py-6 text-center text-faint">No entries yet. Be the first!</div>}
          {comp.status !== "OPEN" && board.length > 0 && <div className="px-4 py-2 text-xs text-faint">Tap Team to see any manager&apos;s players, points and booster.</div>}
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
  competition: { id: string; gameweekId: string; rosterRules: string; format: "OPEN" | "BRONZE_ONLY" | "SILVER_ONLY" | "GOLD_ONLY"; requirements: unknown; rewards: unknown };
  entry: { id: string; formation: string; selections: Array<{ cardId: string | null; slot: string; position: string; order: number; isCaptain: boolean; isViceCaptain: boolean; isBoosted: boolean }> } | null;
}) {
  const rules = getRosterRules(competition.rosterRules);
  const cards = await cardViews({ ownerId: userId, supplyState: "HELD" }, [{ template: { player: { position: "asc" } } }]);
  const form = await recentForm([...new Set(cards.map((c) => c.playerId))]);
  // A loan with no gameweeks left can still play in a gameweek this manager has already entered.
  const enteredThisGw = (await db.competitionEntry.count({ where: { userId, status: "ACTIVE", competition: { gameweekId: competition.gameweekId } } })) > 0;
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
    const req = (competition.requirements ?? {}) as Requirements;
    const notFree = !!req.freeCardsOnly && c.edition !== "STARTER" && c.edition !== "LOAN";
    const wrongClub = !!req.clubs && !req.clubs.includes(c.clubCode ?? "");
    const loanEnded = !!c.loan && c.loan.left === 0 && !enteredThisGw;
    const available = (c.lock === "NONE" || !!mine) && !notFree && !wrongClub && !loanEnded;
    return {
      ...c,
      available,
      unavailableReason: available ? undefined : loanEnded ? "loan ended" : wrongClub ? "not in this match" : notFree ? "not a free card" : c.lock === "LISTED" ? "listed on market" : "in another squad",
      form: form.get(c.playerId) ?? [],
      fixture: fixtureFor(c.clubCode),
    };
  });
  const initial = entry
    ? {
        formation: entry.formation,
        starters: entry.selections.filter((s) => s.slot === "STARTER" && s.cardId).sort((a, b) => a.order - b.order).map((s) => ({ cardId: s.cardId!, position: s.position as Pos })),
        bench: entry.selections.filter((s) => s.slot === "BENCH" && s.cardId).sort((a, b) => a.order - b.order).map((s) => s.cardId!),
        captain: entry.selections.find((s) => s.isCaptain)?.cardId ?? null,
        viceCaptain: entry.selections.find((s) => s.isViceCaptain)?.cardId ?? null,
        boostedOn: entry.selections.find((s) => s.isBoosted)?.cardId ?? null,
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
      boosters={await boosterChoices(userId, entry?.id ?? null)}
    />
  );
}

/** Free draft: every player in the match's leagues, priced at their current MX value. */
async function DraftBuilder({
  userId,
  competition,
  entry,
}: {
  userId: string;
  competition: { id: string; gameweekId: string; rosterRules: string; requirements: unknown; rewards: unknown };
  entry: { id: string; formation: string; selections: Array<{ playerId: string; slot: string; position: string; order: number; isCaptain: boolean; isViceCaptain: boolean; isBoosted: boolean }> } | null;
}) {
  const req = (competition.requirements ?? {}) as Requirements;
  const rules = getRosterRules(competition.rosterRules);
  const pool = await draftPool(req.leagues);
  const value = new Map(pool.map((p) => [p.playerId, draftPrice(p.valueMp, p.category, p.marketValueGbp)]));
  const [faces, form, fixtures] = await Promise.all([
    posterCards(pool.map((p) => p.playerId)),
    recentForm(pool.map((p) => p.playerId)),
    db.fixture.findMany({ where: { gameweekId: competition.gameweekId }, include: { homeClub: true, awayClub: true } }),
  ]);
  const fixtureFor = (clubCode: string | null) => {
    const f = fixtures.find((x) => x.homeClub.code === clubCode || x.awayClub.code === clubCode);
    if (!f) return null;
    return f.homeClub.code === clubCode ? `vs ${f.awayClub.shortName} (H)` : `vs ${f.homeClub.shortName} (A)`;
  };
  // In draft mode a "card" is the player: id = player id, value = draft price.
  const cards: BuilderCard[] = faces.map((c) => ({
    ...c,
    id: c.playerId,
    valueMp: value.get(c.playerId) ?? 1,
    available: true,
    form: form.get(c.playerId) ?? [],
    fixture: fixtureFor(c.clubCode),
  }));
  const initial = entry
    ? {
        formation: entry.formation,
        starters: entry.selections.filter((s) => s.slot === "STARTER").sort((a, b) => a.order - b.order).map((s) => ({ cardId: s.playerId, position: s.position as Pos })),
        bench: entry.selections.filter((s) => s.slot === "BENCH").sort((a, b) => a.order - b.order).map((s) => s.playerId),
        captain: entry.selections.find((s) => s.isCaptain)?.playerId ?? null,
        viceCaptain: entry.selections.find((s) => s.isViceCaptain)?.playerId ?? null,
        boostedOn: entry.selections.find((s) => s.isBoosted)?.playerId ?? null,
      }
    : null;
  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
        <b>Free draft:</b> pick any {req.leagues?.join("/") ?? ""} players — no cards needed. Your 11 must cost {req.draftBudgetMx} MX or less in total
        {req.maxPerClub ? `, with no more than ${req.maxPerClub} from one club` : ""}. Points earn XP like any match. Like a player? Collect their card in a pack.
      </p>
      <SquadBuilder
        competitionId={competition.id}
        formations={rules.allowedFormations.map((f) => FORMATIONS[f])}
        allowedCategories={["BRONZE", "SILVER", "GOLD"]}
        cards={cards}
        initial={initial}
        hasEntry={!!entry}
        draft={{ budgetMx: req.draftBudgetMx!, maxPerClub: req.maxPerClub }}
        boosters={await boosterChoices(userId, entry?.id ?? null)}
      />
    </div>
  );
}

/** Boosters this manager can play on this entry: opened, not expired, and free or already on it. */
async function boosterChoices(userId: string, entryId: string | null) {
  const mine = (await myBoosters(userId)).filter((b) => b.kind && (!b.usedEntryId || b.usedEntryId === entryId));
  const fmt = (d: Date) => d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
  return {
    available: mine.map((b) => ({ id: b.id, name: BOOSTERS[b.kind!].name, icon: BOOSTERS[b.kind!].icon, description: BOOSTERS[b.kind!].description, color: BOOSTERS[b.kind!].color, benchOnly: BOOSTERS[b.kind!].benchOnly, expires: fmt(b.expiresAt) })),
    current: mine.find((b) => b.usedEntryId === entryId && entryId)?.id ?? null,
  };
}

async function Result({ entryId, settled }: { entryId: string; settled: boolean }) {
  const calc = await db.scoreCalculation.findFirst({ where: { entryId }, orderBy: { createdAt: "desc" } });
  const entry = await db.competitionEntry.findUniqueOrThrow({ where: { id: entryId } });
  const sels = await db.competitionSelection.findMany({ where: { entryId } });
  const [cards, draftFaces] = await Promise.all([
    cardViews({ id: { in: sels.flatMap((s) => (s.cardId ? [s.cardId] : [])) } }),
    posterCards(sels.filter((s) => !s.cardId).map((s) => s.playerId)),
  ]);
  // Breakdown rows are keyed by card id, or "draft:<player id>" for free-draft picks.
  const byId = new Map([...cards.map((c) => [c.id, c] as const), ...draftFaces.map((c) => [`draft:${c.playerId}`, c] as const)]);
  const breakdown = calc?.breakdown as { selections: SelectionResult[]; substitutions: Array<{ off: string; on: string; benchOrder: number }>; formationUsed: string | null } | undefined;
  if (!calc || !breakdown) {
    return (
      <div className="panel p-6 text-muted">
        Squad locked in with formation 1-{entry.formation}. Points will appear here as soon as match data arrives.
      </div>
    );
  }
  const starters = breakdown.selections.filter((s) => s.slot === "STARTER");
  const boost = entry.boosterKind && entry.boosterKind in BOOSTERS ? BOOSTERS[entry.boosterKind as BoosterKind] : null;
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
        {boost && (
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border-2 px-3 py-1 text-xs font-semibold" style={{ borderColor: boost.color }}>
            {boost.icon} {boost.name} booster played{(() => {
              const on = breakdown.selections.find((x) => x.boosted);
              const name = on && byId.get(on.cardId)?.name;
              return name ? ` on ${name}` : "";
            })()}
          </p>
        )}
        <div className="space-y-1.5">
          {[...starters, ...bench].map((s) => {
            const c = byId.get(s.cardId);
            return (
              <details
                key={s.cardId}
                style={s.boosted && boost ? { borderColor: boost.color, borderWidth: 2 } : undefined}
                title={s.boosted && boost ? `${boost.name} booster` : undefined}
                className={`rounded-lg border px-3 py-2 ${s.counted ? "border-ink-700 bg-ink-850" : "border-transparent bg-ink-900/50 opacity-70"}`}>
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
                  <span className={`font-bold ${s.counted ? "text-lime" : "text-faint"}`}>{s.captain && <span className="mr-1 rounded bg-accent px-1 text-[10px] text-accent-ink">C ×{s.boosted && entry.boosterKind === "TRIPLE_CAPTAIN" ? 3 : 2}</span>}
                    {s.viceCaptain && <span className="mr-1 rounded bg-white px-1 text-[10px] text-black">VC ×{s.boosted && entry.boosterKind === "TRIPLE_CAPTAIN" ? 3 : 2}</span>}
                    {s.points}</span>
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
