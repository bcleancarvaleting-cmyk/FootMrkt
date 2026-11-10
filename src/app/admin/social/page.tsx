import Link from "next/link";
import { PosterExport } from "@/components/poster-export";
import { ClubPoster, DropPoster, FORMATS, OneOfOnePoster, type PosterFormat, PulledPoster, RarityPoster, TopPerformersPoster } from "@/components/social-poster";
import { fmtDate } from "@/lib/view";
import { clubTopPlayers, clubsForPicker, featuredDrop, latestRainbow, posterCards, possibleFinishes, weeklyTopCards } from "@/server/social";
import { fmtMp } from "@/server/wallet";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Social content" };

const TEMPLATES = [
  ["one-of-one", "One of one (Rainbow)"],
  ["rarity", "How rare do you go? (every finish)"],
  ["club", "Club's one-of-ones (top 3 Rainbows)"],
  ["top", "Top performers this week"],
  ["drop", "Drop alert"],
  ["pulled", "Rainbow pulled (Hall of Fame)"],
] as const;
type SP = { t?: string; f?: string; club?: string; player?: string; scale?: string };

export default async function SocialPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const t = TEMPLATES.find(([k]) => k === sp.t)?.[0] ?? "one-of-one";
  const format = (Object.keys(FORMATS) as PosterFormat[]).find((k) => k === sp.f) ?? "portrait";
  const clubCode = sp.club ?? "GIL";
  const fullSize = sp.scale === "1";
  const [clubs, top] = await Promise.all([clubsForPicker(), clubTopPlayers(clubCode, 10)]);
  const playerId = top?.players.find((p) => p.id === sp.player)?.id ?? top?.players[0]?.id ?? null;
  const player = top?.players.find((p) => p.id === playerId) ?? null;

  let poster: React.ReactNode = null;
  let note: string | null = null;
  if (t === "one-of-one" && playerId) {
    const [card] = await posterCards([playerId], "RAINBOW");
    if (card) poster = <OneOfOnePoster card={card} format={format} />;
  } else if (t === "rarity" && playerId && player) {
    const finishes = possibleFinishes(player.category);
    const [base] = await posterCards([playerId]);
    const shiny = await Promise.all(finishes.map((f) => posterCards([playerId], f).then((c) => c[0])));
    const cards = player.category === "GOLD" ? shiny : [base, ...shiny];
    if (player.category !== "GOLD") note = `${player.name} is ${player.category.toLowerCase()}: Rubies and Diamonds only exist for Gold players, so this shows the normal card next to their one Rainbow.`;
    poster = <RarityPoster cards={cards.filter(Boolean)} format={format} />;
  } else if (t === "club" && top) {
    const cards = await posterCards(top.players.slice(0, 3).map((p) => p.id), "RAINBOW");
    poster = <ClubPoster clubName={top.club.name} cards={cards} format={format} />;
  } else if (t === "top") {
    const rows = await weeklyTopCards(5);
    poster = <TopPerformersPoster rows={rows.map((r) => ({ card: r.card, points: r.row.points, name: r.row.name, club: r.row.club }))} gameweek={null} format={format} />;
  } else if (t === "drop") {
    const d = await featuredDrop();
    if (d) {
      const [card] = await posterCards([d.card.playerId]);
      const live = d.liveAt <= new Date();
      poster = <DropPoster card={card} price={fmtMp(d.priceMinor)} when={live ? "On sale now" : `Drops ${fmtDate(d.liveAt)}`} format={format} />;
    } else note = "No player drops scheduled — schedule one on Player database & drops.";
  } else if (t === "pulled") {
    const r = await latestRainbow();
    if (r) poster = <PulledPoster card={r.card} manager={r.manager} clubName={r.clubName} format={format} />;
    else note = "No Rainbow has been pulled yet.";
  }

  const { w, h } = FORMATS[format];
  const filename = `matchx-${t}-${format}${player ? `-${player.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ""}`;
  if (fullSize) return poster ? <PosterExport filename={filename} width={w} height={h} scale={1}>{poster}</PosterExport> : null;

  return (
    <>
      <AdminTitle title="Social content" intro="Ready-to-post images built from the real card designs. Pick a template, size and club, then download the PNG. Posters only show finishes a player can really come in (Ruby and Diamond are Gold-only; anyone can be a Rainbow)." />
      <form className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" action="/admin/social">
        <label className="text-sm">
          <span className="label">Template</span>
          <select name="t" defaultValue={t} className="input">
            {TEMPLATES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Size</span>
          <select name="f" defaultValue={format} className="input">
            {(Object.keys(FORMATS) as PosterFormat[]).map((k) => (
              <option key={k} value={k}>
                {FORMATS[k].label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Club</span>
          <select name="club" defaultValue={clubCode} className="input">
            {clubs.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} · {c.league.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Player</span>
          <select name="player" defaultValue={playerId ?? ""} className="input">
            {top?.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.category.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-2 lg:col-span-4">
          <button className="btn-primary px-6 py-2 text-xs">Show poster</button>
          <Link href={`/admin/social?t=${t}&f=${format}&club=${clubCode}${playerId ? `&player=${playerId}` : ""}&scale=1`} className="ml-3 text-xs text-muted underline">
            Open full size
          </Link>
        </div>
      </form>
      {note && <p className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">{note}</p>}
      {poster ? (
        <PosterExport filename={filename} width={w} height={h} scale={format === "story" ? 0.32 : 0.45}>
          {poster}
        </PosterExport>
      ) : (
        !note && <p className="text-sm text-faint">Nothing to show for that choice.</p>
      )}
    </>
  );
}
