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
  const groups = [...new Set(board.achievements.map((a) => a.group))];
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Your career" title="Levels & achievements" intro="Every point your players score earns XP. Level up for free packs, and unlock achievements for bonus XP." />

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
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g}>
              <p className="eyebrow mb-2">{g}</p>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {board.achievements
                  .filter((a) => a.group === g)
                  .map((a) => (
                    <li key={a.code} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${a.unlockedAt ? "border-accent/50 bg-accent/5" : "border-ink-700 bg-ink-900 opacity-70"}`}>
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${a.unlockedAt ? "bg-accent text-accent-ink" : "bg-ink-800 text-faint"}`} aria-hidden="true">
                        {a.unlockedAt ? "★" : "☆"}
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
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
