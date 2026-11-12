import type { FormGame } from "@/server/top-performers";

/** Last few games as small tiles: opponent, points, and goals / assists / clean sheets. */
export function FormGuide({ form }: { form: { games: FormGame[]; total: number; avg: number | null; hot: boolean } }) {
  const tone = (g: FormGame) => (g.minutes === 0 ? "border-ink-700 text-faint" : g.points >= 8 ? "border-lime/70 bg-lime/10 text-lime" : g.points >= 4 ? "border-ink-600 text-fg" : "border-ink-700 text-muted");
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5" aria-label={`Form: last ${form.games.length} games, ${form.total} points`}>
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">Form</span>
      {form.games.map((g, i) => (
        <span
          key={i}
          title={g.minutes === 0 ? `Didn't play v ${g.opponent}` : `${g.points} pts v ${g.opponent} (${g.home ? "home" : "away"}) · ${g.minutes}′${g.goals ? ` · ${g.goals} goal${g.goals > 1 ? "s" : ""}` : ""}${g.assists ? ` · ${g.assists} assist${g.assists > 1 ? "s" : ""}` : ""}${g.cleanSheet ? " · clean sheet" : ""}`}
          className={`flex min-w-[46px] flex-col items-center rounded-md border px-1.5 py-0.5 leading-tight ${tone(g)}`}
        >
          <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">
            {g.home ? "" : "@"}
            {g.opponent}
          </span>
          <span className="text-xs font-extrabold tabular-nums">{g.minutes === 0 ? "–" : g.points}</span>
          {(g.goals > 0 || g.assists > 0 || g.cleanSheet) && (
            <span className="text-[9px] font-bold">
              {"⚽".repeat(Math.min(g.goals, 3))}
              {g.assists ? `🅰${g.assists > 1 ? g.assists : ""}` : ""}
              {g.cleanSheet ? "🧤" : ""}
            </span>
          )}
        </span>
      ))}
      {form.avg === null ? (
        <span className="ml-1 text-xs font-semibold text-faint">No minutes in the last {form.games.length}</span>
      ) : (
        <span className="ml-1 text-xs font-bold tabular-nums text-fg">
          {form.total} pts<span className="font-semibold text-faint"> · {form.avg} avg</span>
        </span>
      )}
      {form.hot && <span className="rounded bg-[#ff6b2c] px-1.5 text-[10px] font-extrabold uppercase tracking-wider text-white">🔥 In form</span>}
    </div>
  );
}
