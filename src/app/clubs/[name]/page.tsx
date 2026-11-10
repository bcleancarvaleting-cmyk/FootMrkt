import Link from "next/link";
import { notFound } from "next/navigation";
import { ClubCrest, ManagerBadge } from "@/components/club-crest";
import { FoundingBadge } from "@/components/founding-badge";
import { LevelBadge } from "@/components/level-badge";
import { PlayerCard } from "@/components/player-card";
import { fmtDate } from "@/lib/view";
import { clubProfile } from "@/server/club-profile";

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return { title: decodeURIComponent(name) };
}

function Cards({ title, cards, size = "md" }: { title: string; cards: Awaited<ReturnType<typeof clubProfile>> extends infer P ? (P extends { best: infer B } ? B : never) : never; size?: "sm" | "md" }) {
  if (!cards.length) return null;
  return (
    <section>
      <h2 className="mb-3 text-2xl">{title}</h2>
      <ul className="flex flex-wrap justify-center gap-4 sm:justify-start">
        {cards.map((c) => (
          <li key={c.id}>
            <Link href={`/cards/${c.id}`}>
              <PlayerCard card={c} size={size} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A manager's public club page and trophy cabinet. */
export default async function ClubPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const p = await clubProfile(decodeURIComponent(name));
  if (!p) notFound();
  const m = p.manager;
  return (
    <div className="space-y-10">
      <section className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
        {m.crest ? <ClubCrest crest={m.crest} id="club-hero" size={120} title={m.clubName ?? m.name} /> : <ManagerBadge crest={null} name={m.name} id="club-hero" size={96} />}
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Managed by {m.name}</p>
          <h1 className="text-5xl leading-none">{m.clubName ?? `${m.name}'s club`}</h1>
          <p className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-muted sm:justify-start">
            {m.foundingNumber && <FoundingBadge number={m.foundingNumber} />}
            <span>Since {fmtDate(m.since, { month: "long", year: "numeric" })}</span>
            {m.supports && <span>· Supports {m.supports}</span>}
            <span>· {m.cards} cards</span>
          </p>
        </div>
        <div className="w-full sm:w-64">
          <LevelBadge level={p.level} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-2xl">Trophy cabinet</h2>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-700 bg-ink-700 sm:grid-cols-4">
          {[
            ["🏆", "Match wins", p.trophies.wins.length],
            ["🥈", "Podiums", p.trophies.podiums],
            ["📒", "Binders", p.trophies.binders.length],
            ["★", "Achievements", `${p.achievements.length}/${p.achievementsTotal}`],
          ].map(([icon, label, v]) => (
            <div key={String(label)} className="flex flex-col items-center gap-1 bg-ink-900 p-4 text-center">
              <span className="text-2xl" aria-hidden="true">
                {icon}
              </span>
              <span className="font-display text-3xl font-black tabular-nums">{v}</span>
              <span className="eyebrow">{label}</span>
            </div>
          ))}
        </div>
        {(p.trophies.wins.length > 0 || p.trophies.binders.length > 0) && (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {p.trophies.wins.map((w, i) => (
              <li key={`w${i}`} className="flex items-center gap-3 rounded-xl border border-gold/40 bg-gold/5 px-3 py-2">
                <span className="text-xl" aria-hidden="true">
                  🏆
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-gold">{w.name}</span>
                  <span className="block text-xs text-muted">
                    {w.season} · GW{w.gameweek} · {w.points ?? 0} pts
                  </span>
                </span>
              </li>
            ))}
            {p.trophies.binders.map((b, i) => (
              <li key={`b${i}`} className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-900 px-3 py-2">
                <span className="text-xl" aria-hidden="true">
                  📒
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{b.name}</span>
                  <span className="block text-xs text-muted">Binder completed {fmtDate(b.at, { dateStyle: "medium" })}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Cards title="Showcase · Rainbow, Diamond & Ruby" cards={p.showcase} />
      <Cards title="Best Golds" cards={p.best} size="sm" />
      <Cards title="Most storied cards" cards={p.storied} size="sm" />

      {p.stamps.length > 0 && (
        <section>
          <h2 className="mb-3 text-2xl">Recent history</h2>
          <ul className="space-y-2">
            {p.stamps.map((s) => (
              <li key={s.id} className="rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-sm">
                <b className="text-gold">{s.label}</b> · {s.player}
                <span className="block text-xs text-muted">{s.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.achievements.length > 0 && (
        <section>
          <h2 className="mb-3 text-2xl">Achievements</h2>
          <ul className="flex flex-wrap gap-2">
            {p.achievements.map((a) => (
              <li key={a.code} className="chip border-accent/50" title={a.description}>
                ★ {a.name}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
