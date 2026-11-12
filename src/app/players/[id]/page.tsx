import Link from "next/link";
import { notFound } from "next/navigation";
import { WatchButton } from "@/components/watch-button";
import { isWatching, watcherCounts } from "@/server/watchlist";
import { WatchedBy } from "@/components/watch-button";
import { requireUser } from "@/server/auth/session";
import { playerProfile } from "@/server/binder";
import { DomainError } from "@/server/errors";
import { POSITION_LABEL, ageFrom, fmtDate } from "@/lib/view";

export const metadata = { title: "Player" };

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { player, matches, values, issued, diamonds, rubies, rainbowFound } = await playerProfile(id).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  const played = matches.filter((m) => m.line.minutes > 0);
  const total = played.reduce((s, m) => s + m.points.points, 0);
  const age = ageFrom(player.dateOfBirth);
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">{POSITION_LABEL[player.position]}</p>
        <h1 className="text-5xl font-extrabold">
          {player.firstName} {player.lastName}
        </h1>
        <p className="text-muted">
          {player.squadNumber ? `#${player.squadNumber} · ` : ""}
          {player.club?.name ?? "Free agent"} · {player.club?.league.name} · {player.nationality}
          {age !== null && ` · ${age}`}
        </p>
        {player.rightsStatus === "PLACEHOLDER" && <p className="mt-1 text-xs text-warn">Placeholder player for development — not a real person.</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link href={`/transfers/find/${player.id}`} className="btn-primary px-4 py-2 text-xs">🔍 Find to buy</Link>
          <WatchButton playerId={player.id} initial={await isWatching(user.id, player.id)} />
          <WatchedBy count={(await watcherCounts([player.id])).get(player.id) ?? 0} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi label="Apps (last 20)" value={played.length} />
        <Kpi label="Goals" value={played.reduce((s, m) => s + m.line.goals, 0)} />
        <Kpi label="Assists" value={played.reduce((s, m) => s + m.line.assists, 0)} />
        <Kpi label="Avg points" value={played.length ? (total / played.length).toFixed(1) : "—"} />
      </div>

      <div className="flex flex-wrap gap-3">
        {player.templates.map((t) => {
          const mp = values.get(`${player.id}:${t.category}`);
          return (
            <span key={t.id} className="chip">
              {t.category} card · {mp ? `£${mp.toFixed(2)}` : "no value yet"}
              {t.maxSupply ? ` · ${(issued.get(t.id) ?? 0).toLocaleString("en-GB")} of ${t.maxSupply.toLocaleString("en-GB")} issued` : ""}
            </span>
          );
        })}
        <span className="chip border-white/40">
          <span className="rainbow-name font-bold">Rainbow 1 of 1 · {rainbowFound ? "found" : "still out there"}</span>
        </span>
        {player.templates.some((t) => t.category === "GOLD") && (
          <>
            <span className="chip border-[#ff2d55]/50 text-[#ff8fa6]">Rubies · {rubies} of 10 found</span>
            <span className="chip border-[#8fe3ff]/50 text-[#8fe3ff]">Diamonds · {diamonds} of 5 found</span>
          </>
        )}
      </div>

      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-faint">
            <tr className="table-row">
              {["GW", "Match", "Min", "G", "A", "Saves", "Tkl", "Cards", "Pts"].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matches.map(({ stat, line, points }) => {
              const f = stat.fixture;
              const home = f.homeClubId === player.clubId;
              return (
                <tr key={stat.id} className="table-row">
                  <td className="px-3 py-2 text-faint">{f.gameweek.number}</td>
                  <td className="px-3 py-2">
                    {home ? "vs" : "@"} {home ? f.awayClub.shortName : f.homeClub.shortName}{" "}
                    <span className="text-faint">
                      {f.homeGoals ?? "-"}–{f.awayGoals ?? "-"} · {fmtDate(f.kickoffAt, { dateStyle: "short" })}
                    </span>
                    {stat.revision > 1 && <span className="ml-1 text-[10px] text-warn">corrected r{stat.revision}</span>}
                  </td>
                  <td className="px-3 py-2">{line.minutes}</td>
                  <td className="px-3 py-2">{line.goals || ""}</td>
                  <td className="px-3 py-2">{line.assists || ""}</td>
                  <td className="px-3 py-2">{line.saves || ""}</td>
                  <td className="px-3 py-2">{line.tackles || ""}</td>
                  <td className="px-3 py-2">
                    {"🟨".repeat(line.yellowCards)}
                    {"🟥".repeat(line.redCards)}
                  </td>
                  <td className="px-3 py-2 font-bold text-lime" title={points.items.map((i) => `${i.event}: ${i.points}`).join("\n")}>
                    {line.minutes ? points.points : "–"}
                  </td>
                </tr>
              );
            })}
            {!matches.length && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-faint">
                  No match data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="label">{label}</div>
      <div className="text-2xl font-black">{value}</div>
    </div>
  );
}
