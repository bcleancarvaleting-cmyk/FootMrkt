import type { CardView } from "@/lib/view";
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

/** A Rainbow has been pulled. */
export function PulledPoster({ card, manager, clubName, format }: { card: CardView; manager: string; clubName: string | null; format: PosterFormat }) {
  return (
    <Frame format={format} bg="RAINBOW">
      <p className="text-[30px] font-bold uppercase tracking-[0.3em] text-white/70">Hall of Fame</p>
      <Headline className="mt-2 text-[96px]">{manager}</Headline>
      <Headline className="rainbow-name mb-8 text-[96px]">pulled it.</Headline>
      <BigCard card={card} width={format === "story" ? 560 : format === "portrait" ? 470 : 380} />
      <p className="mt-8 text-center text-[30px] font-semibold text-white/85">
        The only Rainbow {card.name} in the world{clubName ? ` now plays for ${clubName}` : ""}.
      </p>
    </Frame>
  );
}
