import { sumStatLines, toStatLine } from "@/domain/football/scoring";
import { db, withTx } from "./db";
import { DomainError } from "./errors";
import { notify } from "./notifications";
import { ukDay } from "./streaks";
import { creditXp } from "./wallet";


/** XP for a right answer. */
export const PREDICTION_XP = 20;

function hashOf(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/**
 * Today's question, created on first ask: "Will <a well-known attacker> score vs <opponent>?" for
 * one of the next real fixtures. Locks at kick-off.
 */
export async function todaysQuestion(now = new Date()) {
  const day = ukDay(now);
  const existing = await db.predictionQuestion.findUnique({ where: { day } });
  if (existing) return existing;
  const fixtures = await db.fixture.findMany({
    where: { status: "SCHEDULED", kickoffAt: { gt: new Date(now.getTime() + 30 * 60_000), lt: new Date(now.getTime() + 8 * 86_400_000) } },
    orderBy: { kickoffAt: "asc" },
    take: 10,
    include: { homeClub: true, awayClub: true },
  });
  if (!fixtures.length) return null;
  const clubIds = fixtures.flatMap((f) => [f.homeClubId, f.awayClubId]);
  const players = await db.player.findMany({
    where: { active: true, clubId: { in: clubIds }, position: { in: ["ATT", "MID"] } },
    orderBy: { marketValueGbp: { sort: "desc", nulls: "last" } },
    take: 12,
  });
  if (!players.length) return null;
  const p = players[hashOf(day) % players.length];
  const f = fixtures.find((x) => x.homeClubId === p.clubId || x.awayClubId === p.clubId)!;
  const opponent = f.homeClubId === p.clubId ? f.awayClub.name : f.homeClub.name;
  await db.predictionQuestion.createMany({
    data: [{ day, kind: "SCORE", question: `Will ${p.displayName} score vs ${opponent}?`, playerId: p.id, fixtureId: f.id, locksAt: new Date(f.kickoffAt.getTime() - 60_000) }],
    skipDuplicates: true,
  });
  return db.predictionQuestion.findUniqueOrThrow({ where: { day } });
}

export async function answerQuestion(userId: string, questionId: string, guess: boolean, now = new Date()) {
  const q = await db.predictionQuestion.findUnique({ where: { id: questionId } });
  if (!q) throw new DomainError("NOT_FOUND", "Question not found.");
  if (now >= q.locksAt) throw new DomainError("LOCKED", "Too late — this one has kicked off.");
  await db.predictionAnswer.upsert({ where: { questionId_userId: { questionId, userId } }, create: { questionId, userId, guess }, update: { guess } });
}

/** Today's question with the manager's answer and the last few results. */
export async function predictionPanel(userId: string) {
  const q = await todaysQuestion();
  const [mine, recent] = await Promise.all([
    q ? db.predictionAnswer.findUnique({ where: { questionId_userId: { questionId: q.id, userId } } }) : null,
    db.predictionAnswer.findMany({ where: { userId, correct: { not: null } }, orderBy: { createdAt: "desc" }, take: 5, include: { question: true } }),
  ]);
  return { question: q, mine, recent };
}

/** Settle any questions whose match has finished: right answers earn XP. Safe to run repeatedly. */
export async function resolvePredictions() {
  const open = await db.predictionQuestion.findMany({ where: { resolvedAt: null, locksAt: { lt: new Date() } } });
  let resolved = 0;
  for (const q of open) {
    const fixture = await db.fixture.findUnique({ where: { id: q.fixtureId } });
    if (!fixture || fixture.status !== "FINISHED") continue;
    const stats = await db.playerMatchStat.findMany({ where: { fixtureId: q.fixtureId, playerId: q.playerId, isCurrent: true } });
    const answer = sumStatLines(stats.map((s) => toStatLine(s.stats))).goals > 0;
    const answers = await db.predictionAnswer.findMany({ where: { questionId: q.id } });
    await withTx(async (tx) => {
      await tx.predictionQuestion.update({ where: { id: q.id }, data: { answer, resolvedAt: new Date() } });
      for (const a of answers) {
        const correct = a.guess === answer;
        await tx.predictionAnswer.update({ where: { id: a.id }, data: { correct } });
        if (correct) await creditXp(tx, { userId: a.userId, xp: PREDICTION_XP, refId: `predict:${q.id}:${a.userId}`, note: "Daily prediction" });
      }
    });
    for (const a of answers.filter((x) => x.guess === answer)) {
      await notify(a.userId, { kind: "prediction", title: "Prediction right!", body: `${q.question} ${answer ? "Yes" : "No"} · +${PREDICTION_XP} XP`, href: "/", dedupeKey: `predict:${q.id}:${a.userId}` });
    }
    resolved++;
  }
  return resolved;
}
