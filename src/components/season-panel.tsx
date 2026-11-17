import { playerSeason } from "@/server/player-season";

const RESULT = { W: "bg-mint text-[#04140a]", D: "bg-ink-600 text-fg", L: "bg-danger text-white" } as const;

/**
 * This season (real matches): what scored the player points, their totals, the club's last five
 * results with the minutes they played, and the next game. Shown when you open a card or a player.
 */
export async function SeasonPanel({ playerId }: { playerId: string }) {
  const s = await playerSeason(playerId);
  if (!s) return null;
  const fmt = (d: Date) => d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return (
    <section className="panel space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-2xl">This season</h2>
        <p className="text-xs text-faint">{s.season} · real matches</p>
      </div>

      {s.out && (
        <p className="rounded-xl border border-danger/50 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
          {s.out.kind === "SUSPENSION" ? "⛔ Suspended" : "🚑 Injured"}: {s.out.reason ?? ""}
          {s.out.until ? ` · expected back ${s.out.until.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
        </p>
      )}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-ink-700 bg-ink-700 sm:grid-cols-6">
        {[
          ["Points", s.points, `${s.perGame} a game`],
          ["Apps", s.apps, `${s.minutes} mins`],
          ["Goals", s.goals, ""],
          ["Assists", s.assists, ""],
          ["Clean sheets", s.cleanSheets, ""],
          ["Cards", `${s.yellow}/${s.red}`, "yellow / red"],
        ].map(([l, v, sub]) => (
          <div key={String(l)} className="bg-ink-900 px-3 py-2.5">
            <p className="eyebrow">{l}</p>
            <p className="font-display text-2xl font-black italic tabular-nums">{v}</p>
            {sub ? <p className="text-[10px] text-faint">{sub}</p> : null}
          </div>
        ))}
      </div>

      {s.breakdown.length > 0 && (
        <div>
          <p className="eyebrow mb-1.5">What scored the points</p>
          <ul className="divide-y divide-ink-800 rounded-xl border border-ink-700">
            {s.breakdown.map((b) => (
              <li key={b.event} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>
                  {b.event} <span className="text-faint">×{b.count}</span>
                </span>
                <b className={`tabular-nums ${b.points >= 0 ? "text-lime" : "text-danger"}`}>{b.points > 0 ? `+${b.points}` : b.points}</b>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="eyebrow mb-1.5">Club form · last 5</p>
          {s.form.length ? (
            <ul className="flex flex-wrap gap-2">
              {s.form.map((f) => (
                <li key={f.id} className="flex flex-col items-center gap-1 rounded-lg border border-ink-700 bg-ink-900 px-2 py-1.5 text-center" title={`${f.home ? "v" : "@"} ${f.opponent} ${f.score} · ${f.minutes} mins`}>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-black ${RESULT[f.result]}`}>{f.result}</span>
                  <span className="text-[10px] font-bold">{f.home ? "v" : "@"} {f.opponent}</span>
                  <span className="text-[10px] tabular-nums text-faint">{f.score}</span>
                  <span className={`text-[10px] font-bold tabular-nums ${f.minutes > 0 ? "text-fg" : "text-faint"}`}>{f.minutes}&apos;</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-faint">No results yet this season.</p>
          )}
        </div>
        <div>
          <p className="eyebrow mb-1.5">Next game</p>
          {s.next ? (
            <p className="text-sm">
              <b className="text-fg">{s.next.home ? "v" : "@"} {s.next.opponent.name}</b>
              <span className="block text-xs text-muted">{fmt(s.next.at)}</span>
            </p>
          ) : (
            <p className="text-sm text-faint">No game scheduled yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
