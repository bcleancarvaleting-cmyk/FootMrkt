import { HERO_PHOTOS } from "@/components/hero-background";
import { FINISHES } from "@/config/tiers";
import type { CardView } from "@/lib/view";
import { audit } from "./audit";
import { db } from "./db";
import { DomainError } from "./errors";

/**
 * Admin → Images: change the pictures on the site whenever better ones come along.
 *  - the three cards fanned on the homepage ("Your club starts here"): any player, in Gold, Ruby,
 *    Diamond or Rainbow;
 *  - the homepage background photos;
 *  - any player's photo, club badge or league logo (upload or link). Images set here are never
 *    replaced by the nightly Sportmonks sync; "Reset" goes back to Sportmonks' image.
 */

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/svg+xml"];
/** Credit stored with a player photo set by an admin (the sync leaves these alone). */
export const ADMIN_IMAGE_CREDIT = "MATCHX";

export type HeroLook = "GOLD" | "RUBY" | "DIAMOND" | "RAINBOW";
export interface HomeImages {
  /** Left, centre, right. */
  heroCards: Array<{ name: string; look: HeroLook }>;
  /** Overrides for the homepage background photos, by slot. */
  photos: Partial<Record<keyof typeof HERO_PHOTOS, string>>;
}
export const DEFAULT_HOME_IMAGES: HomeImages = {
  heroCards: [
    { name: "Bukayo Saka", look: "RUBY" },
    { name: "Erling Haaland", look: "DIAMOND" },
    { name: "Cole Palmer", look: "RUBY" },
  ],
  photos: {},
};
export const PHOTO_SLOTS: Array<{ key: keyof typeof HERO_PHOTOS; label: string }> = [
  { key: "floodlight", label: "Manage your team (homepage) · Challenge yourself" },
  { key: "nightStadium", label: "Transfer market · Pick your teams" },
  { key: "ballBoots", label: "Buy packs / Pack luck" },
  { key: "bootBall", label: "Buy, sell & make offers" },
];
const KEY = "home.images";

export async function homeImages(): Promise<HomeImages> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  const v = (row?.value ?? {}) as Partial<HomeImages>;
  return {
    heroCards: Array.isArray(v.heroCards) && v.heroCards.length === 3 ? v.heroCards : DEFAULT_HOME_IMAGES.heroCards,
    photos: v.photos && typeof v.photos === "object" ? v.photos : {},
  };
}

/** The homepage background photos, with any admin replacements. */
export async function heroPhotos(): Promise<Record<keyof typeof HERO_PHOTOS, string>> {
  const { photos } = await homeImages();
  return { ...HERO_PHOTOS, ...Object.fromEntries(Object.entries(photos).filter(([, v]) => !!v)) };
}

async function saveHome(adminId: string, next: HomeImages) {
  const before = await homeImages();
  await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: next as never }, update: { value: next as never } });
  await audit(db, { actorId: adminId, action: "images.home", entityType: "AppSetting", entityId: KEY, before: before as never, after: next as never });
}

export async function setHeroCards(adminId: string, cards: Array<{ name: string; look: string }>) {
  if (cards.length !== 3) throw new DomainError("HERO", "Pick three players.");
  const out: HomeImages["heroCards"] = [];
  for (const c of cards) {
    const name = c.name.trim();
    const look = c.look as HeroLook;
    if (!["GOLD", "RUBY", "DIAMOND", "RAINBOW"].includes(look)) throw new DomainError("HERO", "Pick Gold, Ruby, Diamond or Rainbow.");
    const p = await db.player.findFirst({ where: { displayName: { equals: name, mode: "insensitive" }, active: true, templates: { some: { category: "GOLD", edition: "STANDARD" } } }, select: { displayName: true } });
    if (!p) throw new DomainError("HERO", `No Gold card for "${name}" — check the spelling (as on the card).`);
    out.push({ name: p.displayName, look });
  }
  await saveHome(adminId, { ...(await homeImages()), heroCards: out });
}

export async function setHeroPhoto(adminId: string, slot: string, url: string | null) {
  if (!PHOTO_SLOTS.some((s) => s.key === slot)) throw new DomainError("SLOT", "Unknown photo.");
  const cur = await homeImages();
  const photos = { ...cur.photos };
  if (url) photos[slot as keyof typeof HERO_PHOTOS] = url;
  else delete photos[slot as keyof typeof HERO_PHOTOS];
  await saveHome(adminId, { ...cur, photos });
}

/**
 * The three homepage cards: each player's No. 1 Gold, dressed in the chosen look. Players that
 * can't be found are skipped, and the caller fills the gaps.
 */
export async function heroCardLooks(): Promise<Array<{ name: string; look: HeroLook }>> {
  return (await homeImages()).heroCards;
}

export function dress(card: CardView, look: HeroLook): CardView {
  if (look === "GOLD") return { ...card, finish: null };
  return { ...card, finish: { kind: look, serial: 1, of: FINISHES[look].perPlayer } };
}

/** Store an uploaded image and return the address it's served from. */
export async function saveUpload(adminId: string, file: { bytes: Uint8Array; type: string; name: string }) {
  if (!file.bytes.length) throw new DomainError("IMAGE", "Choose an image to upload.");
  if (file.bytes.length > MAX_IMAGE_BYTES) throw new DomainError("IMAGE", "That image is too big — up to 4MB please.");
  if (!TYPES.includes(file.type)) throw new DomainError("IMAGE", "Use a PNG, JPG, WebP, GIF, AVIF or SVG image.");
  const img = await db.siteImage.create({ data: { bytes: Buffer.from(file.bytes), contentType: file.type, name: file.name.slice(0, 120) || "image", createdById: adminId } });
  return `/api/images/${img.id}`;
}

/** A pasted link: https only (or one of our own uploads / site images). */
export function checkImageUrl(raw: string) {
  const s = raw.trim();
  if (s.startsWith("/")) return s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new DomainError("IMAGE", "That doesn't look like a web address.");
  }
  if (u.protocol !== "https:") throw new DomainError("IMAGE", "Use an https:// link.");
  return u.toString();
}

/** Player photo, club badge or league logo. url = null resets to Sportmonks' image at the next sync. */
export async function setEntityImage(adminId: string, kind: "player" | "club" | "league", id: string, url: string | null) {
  if (kind === "player") {
    const before = await db.player.findUniqueOrThrow({ where: { id }, select: { imageUrl: true } });
    await db.player.update({ where: { id }, data: { imageUrl: url, imageCredit: url ? ADMIN_IMAGE_CREDIT : null } });
    await audit(db, { actorId: adminId, action: "player.image", entityType: "Player", entityId: id, before, after: { imageUrl: url } });
  } else if (kind === "club") {
    const before = await db.club.findUniqueOrThrow({ where: { id }, select: { crestUrl: true } });
    await db.club.update({ where: { id }, data: { crestUrl: url } });
    await audit(db, { actorId: adminId, action: "club.crest", entityType: "Club", entityId: id, before, after: { crestUrl: url } });
  } else {
    const before = await db.league.findUniqueOrThrow({ where: { id }, select: { logoUrl: true } });
    await db.league.update({ where: { id }, data: { logoUrl: url } });
    await audit(db, { actorId: adminId, action: "league.logo", entityType: "League", entityId: id, before, after: { logoUrl: url } });
  }
}

/** Find a player by name, optionally "Name (ARS)" to pick the club when two share a name. */
export async function findPlayerByName(raw: string) {
  const m = raw.trim().match(/^(.*?)\s*(?:\(([A-Za-z0-9]{2,4})\))?$/);
  const name = (m?.[1] ?? raw).trim();
  const club = m?.[2]?.toUpperCase();
  const found = await db.player.findMany({
    where: { displayName: { equals: name, mode: "insensitive" }, active: true, ...(club ? { club: { OR: [{ code: club }, { shortName: club }] } } : {}) },
    select: { id: true, displayName: true, club: { select: { code: true } } },
    take: 5,
  });
  if (!found.length) throw new DomainError("PLAYER", `No player called "${name}" — use the name as it appears on the card.`);
  if (found.length > 1) throw new DomainError("PLAYER", `More than one ${name}: add the club, e.g. "${name} (${found[0].club?.code ?? "ARS"})" — ${found.map((f) => f.club?.code).join(", ")}.`);
  return found[0];
}
