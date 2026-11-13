import type { Kit } from "@/lib/kit";
import { KitShirt } from "./kit-shirt";

/**
 * A player's small picture in rows, lists and on the pitch: their photo (from Sportmonks, or set in
 * Admin → Images), shown whole in front of their club colours; their shirt and number if there's
 * no photo yet. `size` sets the height (e.g. "h-9"); the photo is square.
 */
export function PlayerFace({ imageUrl, kit, number, id, label, size = "h-9", className = "", round = false }: { imageUrl?: string | null; kit: Kit; number: number | null; id: string; label: string; size?: string; className?: string; round?: boolean }) {
  if (!imageUrl) return <KitShirt kit={kit} number={number} id={id} label={label} className={`${size} w-auto ${className}`} />;
  return (
    <span
      className={`${size} relative inline-flex aspect-square shrink-0 items-end justify-center overflow-hidden ${round ? "rounded-full" : "rounded-lg"} ring-1 ring-white/15 ${className}`}
      style={{ background: `radial-gradient(110% 90% at 50% 20%, ${kit.body}, #0b0d0e 85%)` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt={label} className="h-full w-full object-contain object-bottom" loading="lazy" />
    </span>
  );
}

const TILE_EDGE = { GOLD: "ring-gold/70", SILVER: "ring-silver/70", BRONZE: "ring-bronze/70", RUBY: "ring-[#ff4d74]/80", DIAMOND: "ring-[#8fe3ff]/80", RAINBOW: "ring-white/70" } as const;

/**
 * A row's picture when the player has a photo: a small portrait of the card art — the whole photo
 * in front of the club colours, edged in the card's tier (or Ruby / Diamond / Rainbow, with the
 * same tint as the card), the shirt and squad number in the corner.
 */
export function PhotoTile({
  imageUrl,
  kit,
  number,
  id,
  name,
  primary,
  secondary,
  tier,
  className = "h-[84px] w-16 sm:h-24 sm:w-[72px]",
}: {
  imageUrl: string;
  kit: Kit;
  number: number | null;
  id: string;
  name: string;
  primary: string;
  secondary: string;
  tier: keyof typeof TILE_EDGE;
  className?: string;
}) {
  return (
    <span className={`photo-art photo-${tier.toLowerCase()} relative block shrink-0 overflow-hidden rounded-xl ring-2 ${TILE_EDGE[tier]} ${className}`} style={{ "--kit-a": primary, "--kit-b": secondary } as React.CSSProperties}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt={name} className="photo-img absolute inset-0 h-full w-full object-contain object-bottom" loading="lazy" />
      <span className="photo-tint" aria-hidden="true" />
      <span className="absolute bottom-1 left-1 h-[30%] drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]">
        <KitShirt kit={kit} number={number} id={id} label={`${name}'s shirt`} className="h-full w-auto" />
      </span>
    </span>
  );
}
