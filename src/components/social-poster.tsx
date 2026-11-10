import type { CardView } from "@/lib/view";
import type { Finish } from "./finish-art";
import { Gem } from "./finish-art";
import { PlayerCard } from "./player-card";

/**
 * Social media posters built from the real card designs. Fixed pixel sizes so they export cleanly:
 * square 1080×1080 (feed), portrait 1080×1350 (Instagram feed), story 1080×1920 (Stories/TikTok).
 */
export type PosterFormat = "square" | "portrait" | "story";
export const FORMATS: Record<PosterFormat, { w: number; h: number; label: string }> = {
  square: { w: 1080, h: 1080, label: "Square · 1080×1080" },
  portrait: { w: 1080, h: 1350, label: "Portrait · 1080×1350" },
  story: { w: 1080, h: 1920, label: "Story · 1080×1920" },
};

const BG: Record<string, string> = {
  RAINBOW:
    "radial-gradient(60% 45% at 20% 20%, rgba(255,80,160,.35), transparent 70%), radial-gradient(55% 45% at 85% 30%, rgba(80,200,255,.35), transparent 70%), radial-gradient(60% 50% at 50% 95%, rgba(255,220,80,.28), transparent 70%), #07080f",
  DIAMOND: "radial-gradient(70% 55% at 50% 35%, rgba(155,232,255,.35), transparent 70%), radial-gradient(50% 40% at 80% 90%, rgba(200,168,255,.25), transparent 70%), #060b14",
  RUBY: "radial-gradient(70% 55% at 50% 35%, rgba(255,45,85,.38), transparent 70%), radial-gradient(50% 40% at 15% 90%, rgba(200,16,46,.3), transparent 70%), #0d0407",
  LIME: "radial-gradient(70% 55% at 50% 30%, rgba(173,252,7,.22), transparent 70%), #07080a",
};

/** A card scaled up for the poster (the card itself is 240px wide at size "lg"). */
function BigCard({ card, width }: { card: CardView; width: number }) {
  const scale = width / 240;
  return (
    <div style={{ width, height: width * 1.4 }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: 240 }}>
        <PlayerCard card={card} size="lg" showcase />
      </div>
    </div>
  );
}

function Frame({ format, bg, children, footer = "matchx.app · Free to play · 18+" }: { format: PosterFormat; bg: string; children: React.ReactNode; footer?: string }) {
  const { w, h } = FORMATS[format];
  return (
    <div className="theme-dark relative flex flex-col overflow-hidden text-[#f4f5f2]" style={{ width: w, height: h, background: BG[bg] ?? bg, fontFamily: "var(--font-geist-sans)" }}>
      <div className="flex items-center justify-between px-[60px] pt-[52px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/matchx-dark.png" alt="MATCHX" style={{ height: 52 }} />
        <span className="rounded-full border border-white/30 px-5 py-2 text-[20px] font-bold uppercase tracking-[0.2em] text-white/80">Football cards</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-[60px]">{children}</div>
      <div className="px-[60px] pb-[48px] text-center text-[22px] font-semibold tracking-wide text-white/60">{footer}</div>
    </div>
  );
}

const Headline = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <h1 className={`text-center font-display font-black uppercase italic leading-[0.9] ${className}`}>{children}</h1>
);

/** One of one: a single player's Rainbow. */
export function OneOfOnePoster({ card, format }: { card: CardView; format: PosterFormat }) {
  const big = format === "story" ? 600 : format === "portrait" ? 500 : 400;
  return (
    <Frame format={format} bg="RAINBOW">
      <Headline className={`rainbow-name ${format === "square" ? "text-[96px]" : "text-[120px]"}`}>One of one</Headline>
      <p className="mb-8 mt-3 text-center text-[30px] font-semibold text-white/85">
        There is only <b>one</b> Rainbow {card.name} in the world.
      </p>
      <BigCard card={card} width={big} />
      <p className="mt-8 text-center text-[30px] font-bold">Could be in your next pack.</p>
    </Frame>
  );
}

/** Rarity ladder: the same player in every finish they can come in. */
export function RarityPoster({ cards, format }: { cards: CardView[]; format: PosterFormat }) {
  const name = cards[0]?.name ?? "";
  const w = cards.length >= 3 ? (format === "story" ? 300 : 290) : format === "square" ? 330 : 380;
  return (
    <Frame format={format} bg="DIAMOND">
      <Headline className="text-[88px]">How rare</Headline>
      <Headline className="rainbow-name mb-10 text-[88px]">do you go?</Headline>
      <div className={`flex ${format === "story" && cards.length >= 3 ? "flex-col items-center gap-6" : "items-end justify-center gap-6"}`}>
        {cards.map((c) => (
          <div key={c.finish?.kind ?? c.category} className="flex flex-col items-center gap-4">
            <BigCard card={c} width={w} />
            <span className="flex items-center gap-2 whitespace-nowrap text-[22px] font-black uppercase tracking-[0.1em]">
              {c.finish && <Gem kind={c.finish.kind} id={`p-${c.finish.kind}`} size={30} />}
              {c.finish ? `${c.finish.kind[0]}${c.finish.kind.slice(1).toLowerCase()} · 1 of ${c.finish.of}` : `${c.category[0]}${c.category.slice(1).toLowerCase()} · ${c.maxSupply?.toLocaleString("en-GB") ?? "∞"}`}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-10 text-center text-[30px] font-semibold text-white/80">{name}: same player, same points — only the shine (and the price) changes.</p>
    </Frame>
  );
}

/** A club's top players as Rainbows. */
export function ClubPoster({ clubName, cards, format }: { clubName: string; cards: CardView[]; format: PosterFormat }) {
  const w = format === "story" ? 330 : format === "portrait" ? 300 : 280;
  return (
    <Frame format={format} bg="RAINBOW">
      <p className="text-[30px] font-bold uppercase tracking-[0.3em] text-white/70">{clubName}</p>
      <Headline className={`mt-2 ${format === "square" ? "text-[84px]" : "text-[104px]"}`}>
        {cards.length} players.
      </Headline>
      <Headline className={`rainbow-name mb-10 ${format === "square" ? "text-[84px]" : "text-[104px]"}`}>{cards.length} one-of-ones.</Headline>
      <div className={`flex flex-wrap justify-center gap-6 ${format === "story" ? "max-w-[720px]" : ""}`}>
        {cards.map((c) => (
          <BigCard key={c.id} card={c} width={w} />
        ))}
      </div>
      <p className="mt-10 text-center text-[30px] font-semibold text-white/85">Every player has exactly one Rainbow card. Who&apos;s pulling these?</p>
    </Frame>
  );
}

/** This week's top performers. */
export function TopPerformersPoster({ rows, gameweek, format }: { rows: Array<{ card: CardView | null; points: number; name: string; club: string | null }>; gameweek: number | null; format: PosterFormat }) {
  const show = rows.slice(0, format === "square" ? 3 : format === "portrait" ? 4 : 5);
  return (
    <Frame format={format} bg="LIME">
      <p className="text-[30px] font-bold uppercase tracking-[0.3em] text-[#adfc07]">{gameweek ? `Gameweek ${gameweek}` : "This week"}</p>
      <Headline className="mb-8 text-[104px]">Top performers</Headline>
      <ol className="flex w-full flex-col gap-4">
        {show.map((r, i) => (
          <li key={r.name} className="flex items-center gap-6 rounded-[28px] border border-white/15 bg-white/[.04] px-8 py-5">
            <span className="w-14 font-display text-[64px] font-black italic text-[#adfc07]">{i + 1}</span>
            {r.card && <BigCard card={r.card} width={format === "square" ? 100 : 120} />}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-[52px] font-black uppercase leading-none">{r.name}</span>
              <span className="block text-[26px] text-white/70">{r.club}</span>
            </span>
            <span className="font-display text-[72px] font-black tabular-nums">{r.points}</span>
            <span className="text-[24px] text-white/60">pts</span>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

/** Drop alert. */
export function DropPoster({ card, price, when, format }: { card: CardView; price: string; when: string; format: PosterFormat }) {
  return (
    <Frame format={format} bg="LIME">
      <Headline className="text-[120px] text-[#adfc07]">Drop alert</Headline>
      <p className="mb-8 mt-2 text-[32px] font-semibold text-white/85">{when}</p>
      <BigCard card={card} width={format === "story" ? 560 : format === "portrait" ? 470 : 380} />
      <p className="mt-8 font-display text-[64px] font-black">{price}</p>
      <p className="text-center text-[28px] text-white/75">One copy. Never in packs. First come, first served.</p>
    </Frame>
  );
}

/** A Ruby / Diamond / Rainbow has just come out of a pack. */
export function FoundPoster({ card, kind, manager, clubName, format }: { card: CardView; kind: Finish; manager: string; clubName: string | null; format: PosterFormat }) {
  const label = kind === "RAINBOW" ? "Rainbow" : kind === "DIAMOND" ? "Diamond" : "Ruby";
  const cls = kind === "RAINBOW" ? "rainbow-name" : kind === "DIAMOND" ? "diamond-name" : "ruby-name";
  const of = kind === "RAINBOW" ? "the only one in the world" : kind === "DIAMOND" ? "one of only 5 ever" : "one of only 10 ever";
  return (
    <Frame format={format} bg={kind}>
      <div className="flex items-center gap-5">
        <Gem kind={kind} id={`found-${kind}`} size={90} />
        <Headline className={`${cls} ${format === "square" ? "text-[110px]" : "text-[130px]"}`}>{label} found!</Headline>
      </div>
      <p className="mb-8 mt-4 text-center text-[32px] font-semibold text-white/85">
        <b>{manager}</b>
        {clubName ? ` (${clubName})` : ""} pulled {card.name} — {of}.
      </p>
      <BigCard card={card} width={format === "story" ? 560 : format === "portrait" ? 470 : 380} />
      <p className="mt-8 text-center text-[30px] font-bold">Who&apos;s next? Every Gold pack could hold one.</p>
    </Frame>
  );
}

/** Kept for older links: a Rainbow has been pulled. */
export function PulledPoster(props: { card: CardView; manager: string; clubName: string | null; format: PosterFormat }) {
  return <FoundPoster {...props} kind="RAINBOW" />;
}

/** Card width that fits n cards on the poster, and how many columns. */
function wallLayout(n: number, w: number, h: number) {
  let best = { cols: 1, width: 0 };
  for (let cols = 2; cols <= 10; cols++) {
    const rows = Math.ceil(n / cols);
    const gap = 14;
    const byW = (w - (cols - 1) * gap) / cols;
    const byH = (h - (rows - 1) * gap) / rows / 1.4;
    const width = Math.floor(Math.min(byW, byH));
    if (width > best.width) best = { cols, width };
  }
  return best;
}

/** Every player at a club as their Rainbow. */
export function ClubWallPoster({ clubName, cards, format }: { clubName: string; cards: CardView[]; format: PosterFormat }) {
  const { h } = FORMATS[format];
  const { cols, width } = wallLayout(cards.length, 960, h - (format === "square" ? 420 : 470));
  return (
    <Frame format={format} bg="RAINBOW">
      <p className="text-[28px] font-bold uppercase tracking-[0.3em] text-white/70">{clubName}</p>
      <Headline className="rainbow-name mb-6 text-[84px]">{cards.length} one-of-ones</Headline>
      <div className="grid justify-center gap-[14px]" style={{ gridTemplateColumns: `repeat(${cols}, ${width}px)` }}>
        {cards.map((c) => (
          <BigCard key={c.id} card={c} width={width} />
        ))}
      </div>
      <p className="mt-6 text-center text-[26px] font-semibold text-white/80">Every {clubName} player has exactly one Rainbow card. Collect the set.</p>
    </Frame>
  );
}

/** A league's stars: the best player at every club, in a mix of Ruby, Diamond and Rainbow. */
export function LeagueStarsPoster({ leagueName, cards, format }: { leagueName: string; cards: CardView[]; format: PosterFormat }) {
  const { h } = FORMATS[format];
  const { cols, width } = wallLayout(cards.length, 960, h - (format === "square" ? 430 : 480));
  const kinds = new Set(cards.map((c) => c.finish?.kind));
  const allRainbow = kinds.size === 1 && kinds.has("RAINBOW");
  return (
    <Frame format={format} bg="RAINBOW">
      <p className="whitespace-nowrap text-[28px] font-bold uppercase tracking-[0.3em] text-white/70">{leagueName}</p>
      <Headline className="rainbow-name mb-2 text-[80px]">{allRainbow ? "Every club's one-of-one" : "Ruby · Diamond · Rainbow"}</Headline>
      <p className="mb-6 text-center text-[24px] font-semibold text-white/75">The most valuable player at all {cards.length} clubs</p>
      <div className="grid justify-center gap-[14px]" style={{ gridTemplateColumns: `repeat(${cols}, ${width}px)` }}>
        {cards.map((c) => (
          <BigCard key={c.id} card={c} width={width} />
        ))}
      </div>
      <p className="mt-6 text-center text-[24px] font-semibold text-white/80">
        {allRainbow ? "Each Rainbow is a true 1 of 1. Every player in the game has one." : "Ruby 1 of 10 · Diamond 1 of 5 · Rainbow 1 of 1"}
      </p>
    </Frame>
  );
}

/** The Rare pack. */
export function RarePackPoster({ price, live, cards, format }: { price: string; live: boolean; cards: CardView[]; format: PosterFormat }) {
  return (
    <Frame format={format} bg="RAINBOW">
      <p className="text-[30px] font-bold uppercase tracking-[0.3em] text-white/70">{live ? "Out now" : "Coming soon"}</p>
      <Headline className="rainbow-name text-[130px]">Rare pack</Headline>
      <p className="mb-10 mt-3 text-center text-[32px] font-semibold text-white/85">3 Golds. One is guaranteed to be a Ruby, a Diamond or a one-of-one Rainbow.</p>
      <div className="flex items-end justify-center gap-6">
        {cards.map((c) => (
          <BigCard key={c.id} card={c} width={format === "square" ? 250 : 290} />
        ))}
      </div>
      <p className="mt-10 font-display text-[72px] font-black">{price}</p>
    </Frame>
  );
}

/** The Rainbow hunt: how many of the one-of-ones have been found. */
export function RainbowHuntPoster({ found, total, cards, format }: { found: number; total: number; cards: CardView[]; format: PosterFormat }) {
  return (
    <Frame format={format} bg="RAINBOW">
      <p className="text-[30px] font-bold uppercase tracking-[0.3em] text-white/70">The Rainbow hunt</p>
      <Headline className="mt-2 text-[150px] tabular-nums">{found.toLocaleString("en-GB")}</Headline>
      <p className="rainbow-name font-display text-[54px] font-black uppercase italic">of {total.toLocaleString("en-GB")} found</p>
      <div className="mb-8 mt-10 flex items-end justify-center gap-5">
        {cards.map((c, i) => (
          <div key={c.id} style={{ transform: `rotate(${(i - 1) * 6}deg)` }}>
            <BigCard card={c} width={format === "square" ? 230 : 270} />
          </div>
        ))}
      </div>
      <p className="text-center text-[30px] font-semibold text-white/85">Every player in the game has one Rainbow card. {(total - found).toLocaleString("en-GB")} are still out there.</p>
    </Frame>
  );
}

/** Join free. */
export function JoinPoster({ cards, format }: { cards: CardView[]; format: PosterFormat }) {
  return (
    <Frame format={format} bg="LIME" footer="matchx.app · 18+">
      <Headline className="text-[120px]">Your club.</Headline>
      <Headline className="mb-8 text-[120px] text-[#adfc07]">Free.</Headline>
      <div className="mb-8 flex items-end justify-center gap-5">
        {cards.map((c) => (
          <BigCard key={c.id} card={c} width={format === "square" ? 220 : 260} />
        ))}
      </div>
      <ul className="space-y-2 text-center text-[32px] font-semibold text-white/90">
        <li>12 free players to start</li>
        <li>2 Premier League Golds on loan</li>
        <li>Score points from real matches</li>
      </ul>
    </Frame>
  );
}
