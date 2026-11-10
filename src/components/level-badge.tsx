/** "Lv 5 · League Two" with a progress bar to the next level. */
export function LevelBadge({ level, compact = false }: { level: { level: number; name: string; progress: number; lifetimeXp: number; next: { level: number; name: string; xp: number } | null }; compact?: boolean }) {
  return (
    <div className={compact ? "min-w-0" : "min-w-0 rounded-2xl border border-ink-700 bg-ink-900 p-4"}>
      <div className="flex items-baseline gap-2">
        <span className="rounded-md bg-accent px-1.5 py-0.5 font-display text-sm font-black text-accent-ink">Lv {level.level}</span>
        <span className="truncate font-display text-lg font-extrabold uppercase italic">{level.name}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800" role="progressbar" aria-valuenow={Math.round(level.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to next level">
        <div className="h-full rounded-full bg-[var(--color-chart)]" style={{ width: `${Math.round(level.progress * 100)}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-faint">
        {level.next ? `${level.lifetimeXp.toLocaleString("en-GB")} / ${level.next.xp.toLocaleString("en-GB")} XP to ${level.next.name}` : `${level.lifetimeXp.toLocaleString("en-GB")} XP · top level`}
      </p>
    </div>
  );
}
