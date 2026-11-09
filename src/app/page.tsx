import Link from "next/link";
import { PlayerCard } from "@/components/player-card";
import { getCurrentUser } from "@/server/auth/session";
import { binderTotals } from "@/server/binder";
import { db } from "@/server/db";
import { currentGameweek } from "@/server/gameweeks";
import { cardViews } from "@/server/views";
import { fmtDate, relativeTime } from "@/lib/view";

export default async function Home() {
  const user = await getCurrentUser();
  return user ? <Dashboard userId={user.id} name={user.displayName} /> : <Landing />;
}

async function Landing() {
  const showcase = await cardViews({ template: { category: "GOLD", edition: "STANDARD" }, supplyState: { in: ["AVAILABLE", "RECIRCULATING"] } }, [{ serial: "asc" }]);
  const picks = [showcase[0], showcase[7], showcase[13]].filter(Boolean);
  return (
    <div className="space-y-16 pt-6">
      <section className="grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          <p className="eyebrow">Collect · Trade · Compete</p>
          <h1 className="text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl">
            Manage a squad of <span className="text-lime">real players.</span> Score on real matches.
          </h1>
          <p className="max-w-lg text-lg text-muted">
            Open packs to build your collection, pick a seven-a-side squad each gameweek, and earn points from what your
            players actually do on the pitch — goals, assists, clean sheets, saves and tackles.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/register" className="btn-primary px-6 py-3 text-base">
              Claim your free 11-player squad
            </Link>
            <Link href="/how-it-works" className="btn-ghost px-6 py-3 text-base">
              How it works
            </Link>
          </div>
        </div>
        <div className="relative flex h-80 items-center justify-center overflow-hidden sm:overflow-visible">
          {picks.map((c, i) => (
            <div key={c.id} className="absolute" style={{ transform: `translateX(${(i - 1) * 110}px) rotate(${(i - 1) * 8}deg)`, zIndex: i === 1 ? 2 : 1 }}>
              <PlayerCard card={c} size={i === 1 ? "lg" : "md"} />
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["Collect", "Bronze, Silver and Gold cards of players from across the pyramid. Every card is a unique, numbered copy."],
          ["Compete", "1 GK, 2 DEF, 2 MID, 2 ATT plus four subs. If a starter doesn't play, your bench comes on automatically."],
          ["Real stats", "Points come from real match events, shown provisionally during the gameweek and settled once data is final."],
        ].map(([t, d]) => (
          <div key={t} className="panel p-5">
            <h3 className="text-lg font-bold text-lime">{t}</h3>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

async function Dashboard({ userId, name }: { userId: string; name: string }) {
  const [gw, totals, unopened, recent] = await Promise.all([
    currentGameweek(),
    binderTotals(userId),
    db.packEntitlement.findMany({ where: { userId, status: "UNOPENED" }, include: { packSku: true } }),
    cardViews({ ownerId: userId, supplyState: "HELD" }, [{ updatedAt: "desc" }]),
  ]);
  const comps = gw
    ? await db.competition.findMany({
        where: { gameweekId: gw.id },
        include: { entries: { where: { userId } }, _count: { select: { entries: true } } },
        orderBy: { name: "asc" },
      })
    : [];
  const lock = comps[0]?.locksAt;
  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Manager</p>
        <h1 className="text-3xl font-black">Welcome back, {name}</h1>
      </div>

      {unopened.length > 0 && (
        <Link href="/packs" className="panel flex items-center justify-between border-lime/40 bg-lime/5 p-5 hover:border-lime">
          <div>
            <div className="font-bold text-lime">You have {unopened.length} unopened pack{unopened.length > 1 ? "s" : ""}</div>
            <div className="text-sm text-muted">{unopened.map((u) => u.packSku.name).join(", ")}</div>
          </div>
          <span className="btn-primary">Open now →</span>
        </Link>
      )}

      {gw && (
        <section className="panel p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">
                Gameweek {gw.number} · {gw.season}
              </p>
              <h2 className="text-xl font-bold">
                {gw.status === "OPEN" || gw.status === "UPCOMING"
                  ? `Deadline ${lock ? relativeTime(lock) : ""}`
                  : gw.status === "SETTLED"
                    ? "Settled"
                    : "Matches in progress — scores are provisional"}
              </h2>
              {lock && <p className="text-xs text-faint">Squads lock {fmtDate(lock)}</p>}
            </div>
            <Link href="/football" className="btn-ghost">
              Fixtures & results
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {comps.map((c) => {
              const e = c.entries[0];
              return (
                <Link key={c.id} href={`/competitions/${c.id}`} className="rounded-xl border border-ink-700 bg-ink-850 p-4 hover:border-lime/50">
                  <div className="text-sm font-semibold">{c.name}</div>
                  <div className="mt-1 text-xs text-faint">
                    {c.format.replace("_", " ").toLowerCase()} · {c._count.entries} manager{c._count.entries === 1 ? "" : "s"}
                  </div>
                  <div className="mt-3 text-sm">
                    {e ? (
                      e.finalPoints !== null ? (
                        <span className="text-lime">
                          {e.finalPoints} pts · rank #{e.rank}
                        </span>
                      ) : e.provisionalPoints !== null ? (
                        <span className="text-mint">{e.provisionalPoints} pts (provisional)</span>
                      ) : (
                        <span className="text-mint">Squad entered ✓</span>
                      )
                    ) : c.status === "OPEN" ? (
                      <span className="text-warn">Pick your squad →</span>
                    ) : (
                      <span className="text-faint">Not entered</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="eyebrow">My collection</p>
            <h2 className="text-xl font-bold">
              {totals.total} cards · <span className="text-gold">{totals.byCategory.GOLD} Gold</span> ·{" "}
              <span className="text-silver">{totals.byCategory.SILVER} Silver</span> ·{" "}
              <span className="text-bronze">{totals.byCategory.BRONZE} Bronze</span>
            </h2>
          </div>
          <Link href="/binder" className="btn-ghost">
            Open Binder
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {recent.slice(0, 8).map((c) => (
            <Link key={c.id} href={`/cards/${c.id}`} className="shrink-0">
              <PlayerCard card={c} size="sm" />
            </Link>
          ))}
          {!recent.length && <p className="text-sm text-muted">No cards yet — open your Starter Pack!</p>}
        </div>
      </section>
    </div>
  );
}
