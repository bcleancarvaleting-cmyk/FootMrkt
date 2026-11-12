import { audit } from "./audit";
import { db } from "./db";
import { DomainError } from "./errors";

/**
 * Admin-editable settings (AppSetting table), with safe defaults and bounds. Every change is audited.
 */
export const SETTINGS = {
  xpPerMx: {
    label: "XP needed for £1",
    help: "The XP exchange rate: how much XP equals £1 of credit — both when XP converts to credit and when paying for a pack with XP (a £2.99 pack at 200 = 598 XP). Higher = slower. A typical manager earns roughly 100–200 XP a week.",
    default: 200,
    min: 50,
    max: 100_000,
  },
  rainbowOneIn: {
    label: "Rainbow chance: 1 in … cards",
    help: "Every card from a Gold pack (any tier) has a 1-in-this chance of being that player's one-of-one Rainbow, until it's found. Rare packs guarantee a finish separately.",
    default: 10_000,
    min: 100,
    max: 10_000_000,
  },
  rubyOneIn: {
    label: "Ruby chance: 1 in … Gold cards",
    help: "Each Gold card from a pack or player drop has a 1-in-this chance of being a Ruby (cosmetic only, max 10 per player, ever). Higher = rarer.",
    default: 250,
    min: 10,
    max: 1_000_000,
  },
  diamondOneIn: {
    label: "Diamond chance: 1 in … Gold cards",
    help: "Each Gold card that comes out of a pack has a 1-in-this chance of being a Diamond (cosmetic only, max 5 per player, ever). Higher = rarer.",
    default: 1000,
    min: 10,
    max: 1_000_000,
  },
  newTraderDays: {
    label: "New accounts: days before trading",
    help: "How many days a new account waits before it can list, buy or make offers on the Transfer list. Player drops aren't affected.",
    default: 3,
    min: 0,
    max: 60,
  },
  highPriceMultiple: {
    label: "High-price warning: × the guide price",
    help: "Sellers must confirm a price this many times the guide price (or more). Sales at 2× this are held for review.",
    default: 3,
    min: 2,
    max: 50,
  },
  dailyDrops: {
    label: "Daily player drops (0 = off)",
    help: "How many players MATCHX drops each day at 10am UK time, as buy-it-now cards — a mix of the four leagues, picked from players in form over the last few weeks and priced from their value plus a small form premium. Unsold drops stay on sale until bought.",
    default: 25,
    min: 0,
    max: 100,
  },
  cashAnyCards: {
    label: "Cash prizes with any cards (1 = on, 0 = free cards only)",
    help: "1: £ prizes can be won with any cards, including bought ones (product decision 11 Nov 2026 — your lawyer must confirm before launch). 0: £ prizes only in 'Free cards only' matches. Paid-entry matches never pay £.",
    default: 1,
    min: 0,
    max: 1,
  },
} as const;
export type SettingKey = keyof typeof SETTINGS;

export async function getSetting(key: SettingKey): Promise<number> {
  const row = await db.appSetting.findUnique({ where: { key } });
  const v = typeof row?.value === "number" ? row.value : SETTINGS[key].default;
  return Math.min(SETTINGS[key].max, Math.max(SETTINGS[key].min, v));
}

export async function allSettings() {
  const out = {} as Record<SettingKey, number>;
  for (const k of Object.keys(SETTINGS) as SettingKey[]) out[k] = await getSetting(k);
  return out;
}

export async function setSetting(adminId: string, key: SettingKey, value: number) {
  const def = SETTINGS[key];
  if (!def) throw new DomainError("UNKNOWN", "Unknown setting.");
  if (!Number.isFinite(value) || value < def.min || value > def.max) throw new DomainError("RANGE", `${def.label}: enter ${def.min}–${def.max}.`);
  const before = await getSetting(key);
  await db.appSetting.upsert({ where: { key }, create: { key, value, updatedBy: adminId }, update: { value, updatedBy: adminId } });
  await audit(db, { actorId: adminId, action: "setting.set", entityType: "AppSetting", entityId: key, before, after: value });
}

/** Text settings (links, choices). */
export const TEXT_SETTINGS = {
  facebookGroupUrl: {
    label: "Managers community link",
    help: "Your MATCHX Facebook group (or other community page). Shown on the homepage as 'Join the managers community'. Leave blank to hide it.",
    default: "",
  },
  whatsappChannelUrl: {
    label: "WhatsApp channel link",
    help: "Your MATCHX WhatsApp channel. Shown on the homepage as 'Join our WhatsApp channel'. Leave blank to hide it.",
    default: "",
  },
  prizesBronze: {
    label: "Bronze Cup weekly £ prize pool",
    help: "By finishing position, e.g. 1=5, 2=3, 3=2 (a £10 pot). Ties split. Used for every new gameweek; saving also updates this week's cup if it hasn't locked.",
    default: "1=5, 2=3, 3=2",
  },
  prizesSilver: {
    label: "Silver Cup weekly £ prize pool",
    help: "By finishing position, e.g. 1=7.50, 2=4.50, 3=3 (a £15 pot). Ties split. Saving also updates this week's cup if it hasn't locked.",
    default: "1=7.50, 2=4.50, 3=3",
  },
  prizesGold: {
    label: "Gold Cup weekly £ prize pool",
    help: "By finishing position, e.g. 1=10, 2=6, 3=4 (a £20 pot). Ties split. Saving also updates this week's cup if it hasn't locked.",
    default: "1=10, 2=6, 3=4",
  },
  referralMonthlyPrizeSku: {
    label: "Top recruiters' monthly prize",
    help: "The free pack each of the month's top 3 recruiters gets (friends who joined with their link and played a match). Sent on the 1st of the next month.",
    default: "football-gold-pick",
  },
  homeHeroImage: {
    label: "Homepage hero photo",
    help: "Link to a photo for the homepage hero (e.g. Wembley at night), starting https:// and ending .jpg, .jpeg, .png or .webp — use one you have the rights to (Unsplash and Pexels photos are free to use). Leave blank for the built-in floodlit stadium with the arch.",
    default: "",
  },
  waitlistRewardSku: {
    label: "Waitlist launch gift",
    help: "The free pack everyone on the waitlist gets when they create their account at launch (with the same email). Shown on the waitlist page.",
    default: "football-gold-pick",
  },
  launchDate: {
    label: "Launch date (waitlist countdown)",
    help: "When MATCHX opens, as YYYY-MM-DD HH:MM in UK time (e.g. 2026-12-01 19:00). Shows a countdown on the waitlist page. Leave blank for 'Coming soon'.",
    default: "",
  },
  reportEmails: {
    label: "Daily report — extra emails",
    help: "The daily report (sign-ups, card takings, packs and players sold) goes to every admin at 8am. Add more addresses here, separated by commas.",
    default: "",
  },
  earlyAccessCode: {
    label: "Early-access code",
    help: "While Pre-launch is on, sign-up only works from a link with this code: /register?code=YOURCODE (for testers and friends). Leave blank to close sign-up completely.",
    default: "",
  },
  referralRewardSku: {
    label: "Refer-a-friend reward",
    help: "The free pack a manager gets for each friend who joins with their link and plays a match.",
    default: "football-bronze-pick",
  },
} as const;
export type TextSettingKey = keyof typeof TEXT_SETTINGS;

export async function getText(key: TextSettingKey): Promise<string> {
  const row = await db.appSetting.findUnique({ where: { key } });
  return typeof row?.value === "string" ? row.value : TEXT_SETTINGS[key].default;
}

export async function setText(adminId: string, key: TextSettingKey, value: string) {
  if (!(key in TEXT_SETTINGS)) throw new DomainError("UNKNOWN", "Unknown setting.");
  const v = value.trim();
  if (key === "facebookGroupUrl" && v && !/^https:\/\/[^\s]+$/i.test(v)) {
    throw new DomainError("URL", "Paste the full link, starting https://, e.g. https://www.facebook.com/groups/matchx");
  }
  if (key === "whatsappChannelUrl" && v && !/^https:\/\/(www\.)?(whatsapp\.com\/channel\/|chat\.whatsapp\.com\/|wa\.me\/)[^\s]+$/i.test(v)) {
    throw new DomainError("URL", "Paste the WhatsApp channel link, e.g. https://whatsapp.com/channel/…");
  }
  if (key === "homeHeroImage" && v && !/^https:\/\/[^\s"'<>]+$/i.test(v)) {
    throw new DomainError("URL", "Paste the full image link, starting https:// — e.g. a photo's direct link from Unsplash or Pexels.");
  }
  if (key === "launchDate" && v && !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(v)) throw new DomainError("DATE", "Use YYYY-MM-DD HH:MM, e.g. 2026-12-01 19:00.");
  if (key === "reportEmails" && v && !v.split(/[,\s]+/).filter(Boolean).every((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) throw new DomainError("EMAIL", "Enter email addresses separated by commas.");
  if (key === "earlyAccessCode" && v && !/^[A-Za-z0-9-]{4,32}$/.test(v)) throw new DomainError("CODE", "4–32 letters, numbers or dashes.");
  if (key === "referralRewardSku" || key === "referralMonthlyPrizeSku" || key === "waitlistRewardSku") {
    const { FOOTBALL_PACKS } = await import("@/config/packs");
    if (!FOOTBALL_PACKS.some((p) => p.code === v && p.kind === "WEEKLY")) throw new DomainError("PACK", "Choose a free pack.");
  }
  const tierPrize = PRIZE_POOL_KEYS[key as keyof typeof PRIZE_POOL_KEYS];
  if (tierPrize) {
    const { parsePrizes } = await import("./competitions");
    parsePrizes(v); // throws a readable error if it can't be read
  }
  const before = await getText(key);
  await db.appSetting.upsert({ where: { key }, create: { key, value: v, updatedBy: adminId }, update: { value: v, updatedBy: adminId } });
  await audit(db, { actorId: adminId, action: "setting.set", entityType: "AppSetting", entityId: key, before, after: v });
  if (tierPrize) await (await import("./competitions")).applyPrizePool(tierPrize, v);
}

/** Weekly £ prize pool setting for each tier cup (template key). */
export const PRIZE_POOL_KEYS = { prizesBronze: "bronze", prizesSilver: "silver", prizesGold: "gold" } as const;

/** Name of the pack a manager earns per referral (shown on share and invite prompts). */
export async function referralRewardName() {
  const { FOOTBALL_PACKS } = await import("@/config/packs");
  const code = await getText("referralRewardSku");
  return FOOTBALL_PACKS.find((p) => p.code === code)?.name ?? "pack";
}
