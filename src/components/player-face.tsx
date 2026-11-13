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
