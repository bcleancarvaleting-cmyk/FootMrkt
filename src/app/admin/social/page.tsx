import Link from "next/link";
import { markFindAction } from "@/app/actions/social";
import { ActionButton } from "@/components/action-button";
import { BatchExport } from "@/components/batch-export";
import { PosterExport } from "@/components/poster-export";
import {
  ClubPoster,
  ClubWallPoster,
  DropPoster,
  DroppingTodayPoster,
  FORMATS,
  FoundPoster,
  JoinPoster,
  LeagueStarsPoster,
  OneOfOnePoster,
  type PosterFormat,
  RainbowHuntPoster,
  RarePackPoster,
  RarityPoster,
  TopPerformersPoster,
  WinnersPoster,
} from "@/components/social-poster";
import { RARE_PACK_CODE } from "@/config/packs";
import { fmtDate, gbp } from "@/lib/view";
import { isEnabled } from "@/server/flags";
import { latestSku } from "@/server/packs";
import {
  type Finish,
  clubAllPlayers,
  clubTopPlayers,
  clubsForPicker,
  featuredDrop,
  socialQueue,
  leagueStars,
  leaguesForPicker,
  posterCards,
  possibleFinishes,
  rainbowCount,
  recentFinds,
  weeklyTopCards,
} from "@/server/social";
import { fmtMp } from "@/server/wallet";
import { gameweekWinners } from "@/server/rhythm";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Social content" };

const TEMPLATES = [
  ["one-of-one", "One of one — a player's Rainbow"],
  ["every", "Every player's Rainbow at a club (download all)"],
  ["wall", "Club Rainbow wall — the whole squad on one image"],
  ["league", "League stars — best player at every club, mixed finishes"],
  ["club", "Club's one-of-ones — top 3 Rainbows"],
  ["rarity", "How rare do you go? — every finish"],
  ["found", "Found! — a real Ruby / Diamond / Rainbow pull"],
  ["hunt", "The Rainbow hunt — how many found"],
  ["rare", "Rare pack"],
  ["winners", "Gameweek winners (Monday post)"],
  ["top", "Top performers this week"],
  ["drop", "Drop alert"],
  ["today", "Players dropping today"],
  ["join", "Join free"],
] as const;
type SP = { t?: string; f?: string; club?: string; player?: string; kind?: string; find?: string; scale?: string; league?: string; seed?: string };

export default async function SocialPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const t = TEMPLATES.find(([k]) => k === sp.t)?.[0] ?? "one-of-one";
  const format = (Object.keys(FORMATS) as PosterFormat[]).find((k) => k === sp.f) ?? "portrait";
  const clubCode = sp.club ?? "GIL";
  const kind = (["RUBY", "DIAMOND", "RAINBOW"] as const).find((k) => k === sp.kind);
  const fullSize = sp.scale === "1";
  const leagueCode = sp.league ?? "EPL";
  const seed = sp.seed ?? "1";
  const [clubs, leagues, top, queue] = await Promise.all([clubsForPicker(), leaguesForPicker(), clubTopPlayers(clubCode, 40), socialQueue(8)]);
  const playerId = top?.players.find((p) => p.id === sp.player)?.id ?? top?.players[0]?.id ?? null;
  const player = top?.players.find((p) => p.id === playerId) ?? null;
  const { w, h } = FORMATS[format];
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  let poster: React.ReactNode = null;
  let batch: Array<{ filename: string; poster: React.ReactNode }> | null = null;
  let note: string | null = null;
  let finds: Awaited<ReturnType<typeof recentFinds>> = [];

  if (t === "one-of-one" && playerId) {
    const [card] = await posterCards([playerId], "RAINBOW");
    if (card) poster = <OneOfOnePoster card={card} format={format} />;
  } else if (t === "every") {
    const all = await clubAllPlayers(clubCode);
    if (all) {
      const cards = await posterCards(
        all.players.map((p) => p.id),
        "RAINBOW",
      );
      batch = cards.map((c) => ({ filename: `${slug(all.club.name)}-${slug(c.name)}-rainbow-${format}`, poster: <OneOfOnePoster card={c} format={format} /> }));
    }
  } else if (t === "wall") {
    const all = await clubAllPlayers(clubCode);
    if (all) poster = <ClubWallPoster clubName={all.club.name} cards={await posterCards(all.players.map((p) => p.id), "RAINBOW")} format={format} />;
  } else if (t === "league") {
    const ls = await leagueStars(leagueCode, seed);
    if (ls) {
      poster = <LeagueStarsPoster leagueName={ls.league.name} cards={ls.cards} format={format} />;
      if (ls.golds === 0) note = `${ls.league.name} has no Gold players yet. Rubies and Diamonds only come on Golds, so every card here is shown as its Rainbow.`;
      else if (ls.golds < ls.cards.length) note = `${ls.golds} of these ${ls.cards.length} players are Gold, so only they are shown as Ruby or Diamond. The rest are shown as their Rainbow.`;
    }
  } else if (t === "club" && top) {
    const cards = await posterCards(top.players.slice(0, 3).map((p) => p.id), "RAINBOW");
    poster = <ClubPoster clubName={top.club.name} cards={cards} format={format} />;
  } else if (t === "rarity" && playerId && player) {
    const finishes = possibleFinishes(player.category);
    const [base] = await posterCards([playerId]);
    const shiny = await Promise.all(finishes.map((f) => posterCards([playerId], f).then((c) => c[0])));
    const cards = player.category === "GOLD" ? shiny : [base, ...shiny];
    if (player.category !== "GOLD") note = `${player.name} is ${player.category.toLowerCase()}: Rubies and Diamonds come on Gold players, so this shows the normal card next to their one Rainbow.`;
    poster = <RarityPoster cards={cards.filter(Boolean)} format={format} />;
  } else if (t === "found") {
    finds = await recentFinds(kind, 30);
    const f = finds.find((x) => x.id === sp.find) ?? finds[0];
    if (f) poster = <FoundPoster card={f.card} kind={f.kind as Finish} manager={f.manager} clubName={f.clubName} format={format} />;
    else note = `No ${kind ? kind.toLowerCase() : "Ruby, Diamond or Rainbow"} has been pulled yet — this fills in automatically when one is.`;
  } else if (t === "hunt") {
    const { found, total } = await rainbowCount();
    const sample = top ? await posterCards(top.players.slice(0, 3).map((p) => p.id), "RAINBOW") : [];
    poster = <RainbowHuntPoster found={found} total={total} cards={sample} format={format} />;
  } else if (t === "rare") {
    const [sku, live] = await Promise.all([latestSku(RARE_PACK_CODE).catch(() => null), isEnabled("PAID_PACKS")]);
    const golds = await clubTopPlayers("MCI", 6);
    const ids = golds?.players.filter((p) => p.category === "GOLD").map((p) => p.id) ?? [];
    const cards = [...(await posterCards(ids.slice(0, 1), "RUBY")), ...(await posterCards(ids.slice(1, 2), "DIAMOND")), ...(await posterCards(ids.slice(2, 3), "RAINBOW"))];
    poster = <RarePackPoster price={gbp(sku?.priceMinor ?? 1999)} live={live} cards={cards} format={format} />;
  } else if (t === "winners") {
    const w = await gameweekWinners();
    if (w && w.winners.length) poster = <WinnersPoster number={w.number} winners={w.winners} format={format} />;
    else note = "No gameweek has been settled yet — this fills in once one is.";
  } else if (t === "top") {
    const rows = await weeklyTopCards(5);
    poster = <TopPerformersPoster rows={rows.map((r) => ({ card: r.card, points: r.row.points, name: r.row.name, club: r.row.club }))} gameweek={null} format={format} />;
  } else if (t === "today") {
    const { todaysDrops } = await import("@/server/player-drops");
    const drops = await todaysDrops();
    const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long" }).format(new Date());
    if (drops.length) poster = <DroppingTodayPoster drops={drops.map((d) => ({ card: d.card, price: fmtMp(d.priceMinor) }))} day={day} format={format} />;
    else note = "Nothing is dropping today yet. The daily drops go on sale at 10am UK time (they're picked from 9am) — set how many in Admin → Settings → Daily player drops.";
  } else if (t === "drop") {
    const d = await featuredDrop();
    if (d) {
      const [card] = await posterCards([d.card.playerId]);
      poster = <DropPoster card={card} price={fmtMp(d.priceMinor)} when={d.liveAt <= new Date() ? "On sale now" : `Drops ${fmtDate(d.liveAt)}`} format={format} />;
    } else note = "No player drops scheduled — schedule one on Player database & drops.";
  } else if (t === "join") {
    const golds = await clubTopPlayers("ARS", 6);
    const cards = top ? await posterCards([top.players[0]?.id, golds?.players[0]?.id, top.players[1]?.id].filter(Boolean) as string[]) : [];
    poster = <JoinPoster cards={cards} format={format} />;
  }

  const filename = `matchx-${t}-${format}${player && ["one-of-one", "rarity"].includes(t) ? `-${slug(player.name)}` : t === "wall" || t === "club" ? `-${slug(top?.club.name ?? clubCode)}` : t === "league" ? `-${slug(leagues.find((l) => l.code === leagueCode)?.name ?? leagueCode)}-${seed}` : ""}`;
  if (fullSize) {
    if (batch) {
      return (
        <div className="flex flex-col gap-4">
          {batch.map((b) => (
            <div key={b.filename} data-poster={b.filename} style={{ width: w, height: h }}>
              {b.poster}
            </div>
          ))}
        </div>
      );
    }
    return poster ? (
      <PosterExport filename={filename} width={w} height={h} scale={1}>
        {poster}
      </PosterExport>
    ) : null;
  }

  return (
    <>
      <AdminTitle
        title="Social content"
        intro="Ready-to-post images built from the real card designs. Pick a template, size and club, then download. Posters only show finishes a player can really come in (Ruby and Diamond on Golds; every player has one Rainbow)."
      />
      {queue.count > 0 && (
        <section className="panel space-y-2 border-accent/50 p-4">
          <h2 className="font-display text-xl font-extrabold uppercase italic">New pulls to post ({queue.count})</h2>
          <p className="text-xs text-muted">Every Ruby, Diamond and Rainbow pulled lands here. Make the &ldquo;Found!&rdquo; poster, post it, then mark it posted — or skip it.</p>
          <ul className="divide-y divide-ink-800">
            {queue.items.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className={`font-bold ${q.kind === "RAINBOW" ? "rainbow-name" : q.kind === "DIAMOND" ? "text-[#8fe3ff]" : "text-[#ff8fa6]"}`}>{q.kind.toLowerCase()}</span>
                <span className="min-w-0 flex-1 truncate">
                  {q.player} · pulled by {q.manager} · {fmtDate(q.at, { dateStyle: "medium" })}
                </span>
                <Link href={`/admin/social?t=found&f=${format}&kind=${q.kind}&find=${q.id}`} className="btn-primary px-3 py-1.5 text-[11px]">
                  Make poster
                </Link>
                <ActionButton action={markFindAction.bind(null, q.id, "POSTED")} className="btn-ghost px-3 py-1.5 text-[11px]">
                  Posted
                </ActionButton>
                <ActionButton action={markFindAction.bind(null, q.id, "SKIPPED")} className="btn-ghost px-3 py-1.5 text-[11px] text-faint">
                  Skip
                </ActionButton>
              </li>
            ))}
          </ul>
        </section>
      )}
      <form className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" action="/admin/social">
        <label className="text-sm sm:col-span-2">
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
          <span className="label">League</span>
          <select name="league" defaultValue={leagueCode} className="input">
            {leagues.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
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
        <label className="text-sm">
          <span className="label">Found: which finish</span>
          <select name="kind" defaultValue={kind ?? ""} className="input">
            <option value="">Any</option>
            <option value="RAINBOW">Rainbow</option>
            <option value="DIAMOND">Diamond</option>
            <option value="RUBY">Ruby</option>
          </select>
        </label>
        {t === "found" && finds.length > 0 && (
          <label className="text-sm sm:col-span-2">
            <span className="label">Found: which pull</span>
            <select name="find" defaultValue={sp.find ?? finds[0].id} className="input">
              {finds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.kind.toLowerCase()} · {f.card.name} · {f.manager} · {fmtDate(f.at, { dateStyle: "medium" })}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="sm:col-span-2 lg:col-span-4">
          <button className="btn-primary px-6 py-2 text-xs">Show</button>
          <Link href={`/admin/social?t=${t}&f=${format}&club=${clubCode}${playerId ? `&player=${playerId}` : ""}${kind ? `&kind=${kind}` : ""}&league=${leagueCode}&seed=${seed}&scale=1`} className="ml-3 text-xs text-muted underline">
            Open full size
          </Link>
          {t === "league" && (
            <Link href={`/admin/social?t=league&f=${format}&league=${leagueCode}&seed=${Number(seed) + 1 || 2}`} className="ml-3 text-xs text-muted underline">
              Shuffle the mix
            </Link>
          )}
        </div>
      </form>
      {note && <p className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">{note}</p>}
      {batch ? (
        <BatchExport items={batch} width={w} height={h} zipName={`matchx-${slug(top?.club.name ?? clubCode)}-rainbows-${format}`} />
      ) : poster ? (
        <PosterExport filename={filename} width={w} height={h} scale={format === "story" ? 0.32 : 0.45}>
          {poster}
        </PosterExport>
      ) : (
        !note && <p className="text-sm text-faint">Nothing to show for that choice.</p>
      )}
    </>
  );
}
