import Link from "next/link";
import { notFound } from "next/navigation";
import { ClubBadge } from "@/components/club-badge";
import { PlayerCard } from "@/components/player-card";
import { PosterExport } from "@/components/poster-export";
import { ClubAdPoster, FORMATS, type PosterFormat } from "@/components/social-poster";
import { POSITION_LABEL, type Pos, fmtDate } from "@/lib/view";
import { getCurrentUser } from "@/server/auth/session";
import { teamPage } from "@/server/team-page";

const norm = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const t = await teamPage(norm((await params).code));
  if (!t) return { title: "Club" };
  const description = `Collect every ${t.club.name} player as a MATCHX card and score points from their real matches. Free to play — start with 32 players.`;
  return { title: `${t.club.name} cards`, description, openGraph: { title: `${t.club.name} on MATCHX`, description } };
}

const POS: Pos[] = ["GK", "DEF", "MID", "ATT"];

export default async function TeamPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ f?: string }> }) {
  const code = norm((await params).code);
  const [t, user, sp] = await Promise.all([teamPage(code), getCurrentUser(), searchParams]);
  if (!t) notFound();
  const { club } = t;
  const format = (Object.keys(FORMATS) as PosterFormat[]).find((k) => k === sp.f) ?? "portrait";
  const { w, h } = FORMATS[format];
  const golds = t.cards.filter((c) => c.category === "GOLD");
  const featured = (golds.length >= 3 ? golds : t.cards).slice(0, 3);
  const slug = club.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-ink-700 bg-ink-900 p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl" style={{ background: club.primaryColour }} aria-hidden="true" />
        <div className="relative flex flex-wrap items-center gap-5">
          <ClubBadge short={club.shortName} primary={club.primaryColour} secondary={club.secondaryColour} kit={club.kit} crestUrl={club.crestUrl} size={64} title={club.name} />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">{club.league.name}</p>
            <h1 className="mt-1 text-4xl leading-none sm:text-5xl">{club.name}</h1>
            <p className="mt-2 text-sm text-muted">
              {t.cards.length} players to collect
              {t.next && (
                <>
                  {" "}· next: <b className="text-fg">{t.next.homeClub.code} v {t.next.awayClub.code}</b> {fmtDate(t.next.kickoffAt, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {user ? (
              <Link href={`/transfers?q=${encodeURIComponent(club.name)}`} className="btn-primary">Find {club.name} players</Link>
            ) : (
              <Link href={`/register?club=${club.code}`} className="btn-primary">Join free as a {club.name} fan</Link>
            )}
          </div>
        </div>
        <dl className="relative mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-700 bg-ink-700 sm:grid-cols-4">
          <Stat label="Fans on MATCHX" value={t.supporters.toLocaleString("en-GB")} />
          <Stat label="Cards collected" value={t.collected.toLocaleString("en-GB")} />
          <Stat label="Rainbows found" value={`${t.rainbows} of ${t.cards.length}`} />
          <Stat label="On the Transfer list" value={t.listed.toLocaleString("en-GB")} />
        </dl>
      </section>

      {POS.map((p) => {
        const cards = t.cards.filter((c) => c.position === p);
        if (!cards.length) return null;
        return (
          <section key={p}>
            <h2 className="mb-3 flex items-baseline gap-2 text-2xl">
              {POSITION_LABEL[p]}s <span className="font-sans text-xs font-semibold not-italic text-faint">{cards.length}</span>
            </h2>
            <ul className="flex flex-wrap justify-center gap-3 sm:justify-start">
              {cards.map((c) => (
                <li key={c.id}>{user ? <Link href={`/players/${c.playerId}`}><PlayerCard card={c} size="sm" /></Link> : <PlayerCard card={c} size="sm" />}</li>
              ))}
            </ul>
          </section>
        );
      })}

      {featured.length > 0 && (
        <section className="panel space-y-4 p-5">
          <div>
            <h2 className="text-2xl">Share with {club.name} fans</h2>
            <p className="mt-1 text-sm text-muted">Post this to your club&apos;s fan groups, Instagram or TikTok — it links straight back here.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(FORMATS) as PosterFormat[]).map((f) => (
              <Link key={f} href={`?f=${f}`} scroll={false} className={`chip ${f === format ? "border-accent text-fg" : ""}`}>
                {f === "story" ? "Story / TikTok" : f === "portrait" ? "Instagram post" : "Square"}
              </Link>
            ))}
            {user?.role === "ADMIN" && (
              <Link href={`/admin/social?t=wall&club=${club.code}`} className="chip border-accent/60 text-lime">More ad images in Admin →</Link>
            )}
          </div>
          <PosterExport filename={`matchx-${slug}-${format}`} width={w} height={h} scale={format === "story" ? 0.26 : 0.28}>
            <ClubAdPoster clubName={club.name} code={club.code} colour={club.primaryColour} count={t.cards.length} cards={featured} format={format} />
          </PosterExport>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink-900 p-4">
      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-black italic tabular-nums">{value}</dd>
    </div>
  );
}
