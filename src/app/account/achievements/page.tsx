import { LEVELS } from "@/config/progression";
import { FOOTBALL_PACKS } from "@/config/packs";
import { LevelBadge } from "@/components/level-badge";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth/session";
import { achievementBoard, refreshProgress } from "@/server/progression";
import { fmtDate } from "@/lib/view";

export const metadata = { title: "Achievements" };

const packName = (code: string | null) => (code ? (FOOTBALL_PACKS.find((p) => p.code === code)?.name ?? "Free pack") : "—");

export default async function AchievementsPage() {
  const user = await requireUser();
  await refreshProgress(user.id);
  const board = await achievementBoard(user.id);
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Your career" title="Levels & achievements" intro="Every point your players score earns XP. Level up for free packs, and work through the achievement stages for big XP bonuses." />

      <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <LevelBadge level={board.level} />
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <p className="eyebrow mb-2">Level rewards</p>
          <ol className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {LEVELS.map((l) => (
              <li key={l.level} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 ${l.level <= board.level.level ? "text-fg" : "text-faint"}`}>
                <span className="truncate">
                  <b className="tabular-nums">{l.level}</b> · {l.name}
                </span>
                <span className="shrink-0 text-xs">{l.level <= board.level.level && l.reward ? "✓ " : ""}{packName(l.reward)}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-2xl">
          Achievements · {board.unlocked} of {board.total}
        </h2>
        <p className="mb-4 text-sm text-muted">
          Achievements come in five stages. Finish every achievement in a stage to bank its XP bonus and open the next, harder stage.
        </p>
        <div className="space-y-4">
          {board.stages.map((st) => (
            <details key={st.stage} open={st.open} className={`group rounded-2xl border ${st.complete ? "border-accent/50 bg-accent/5" : st.open ? "border-ink-600 bg-ink-900" : "border-ink-800 bg-ink-900/60"}`}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-lg font-black ${st.complete ? "bg-accent text-accent-ink" : st.open ? "bg-ink-700 text-fg" : "bg-ink-800 text-faint"}`}>
                  {st.complete ? "✓" : st.open ? st.stage : "🔒"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-xl font-extrabold uppercase italic">
                    Stage {st.stage} · {st.name}
                  </span>
                  <span className="block text-xs text-muted">
                    {st.complete ? `Complete${st.completedAt ? ` · ${fmtDate(st.completedAt, { dateStyle: "medium" })}` : ""}` : st.open ? `${st.done} of ${st.total} done` : `Opens when you finish stage ${st.stage - 1}`}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${st.complete ? "bg-accent text-accent-ink" : "border border-lime/40 text-lime"}`}>+{st.bonusXp.toLocaleString("en-GB")} XP bonus</span>
                {st.open && (
                  <span className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
                    <span className="block h-full bg-accent" style={{ width: `${Math.round((st.done / Math.max(1, st.total)) * 100)}%` }} />
                  </span>
                )}
              </summary>
              <ul className="grid gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
                {st.items.map((a) => (
                  <AchievementTile key={a.code} a={a} locked={!st.open && !st.complete && !a.unlockedAt} />
                ))}
              </ul>
            </details>
          ))}
          <div>
            <p className="eyebrow mb-2">Extras · any time</p>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {board.extras.map((a) => (
                <AchievementTile key={a.code} a={a} locked={false} />
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function AchievementTile({ a, locked }: { a: { name: string; description: string; xp: number; unlockedAt: Date | null }; locked: boolean }) {
  return (
    <li className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${a.unlockedAt ? "border-accent/50 bg-accent/5" : "border-ink-700 bg-ink-900"} ${a.unlockedAt ? "" : "opacity-70"}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${a.unlockedAt ? "bg-accent text-accent-ink" : "bg-ink-800 text-faint"}`} aria-hidden="true">
        {a.unlockedAt ? "★" : locked ? "🔒" : "☆"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{a.name}</span>
        <span className="block truncate text-xs text-muted">{a.description}</span>
      </span>
      <span className="shrink-0 text-right text-xs">
        <span className="block font-bold text-lime">+{a.xp} XP</span>
        {a.unlockedAt && <span className="block text-faint">{fmtDate(a.unlockedAt, { dateStyle: "medium" })}</span>}
      </span>
    </li>
  );
}
