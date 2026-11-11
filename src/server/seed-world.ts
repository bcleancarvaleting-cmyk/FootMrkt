import type { Position } from "@/generated/prisma/client";
import { FOOTBALL_PACKS } from "@/config/packs";
import { MAX_SUPPLY, tierFor } from "@/config/tiers";
import { seededRandom } from "@/domain/random";
import { hashPassword } from "./auth/password";
import { ensureClubBinders } from "./collections";
import { db } from "./db";
import { createGameweek, finaliseGameweek, simulateFixturesNow } from "./gameweeks";
import { importSeasonToDate } from "./live-data";
import { executeRelease, scheduleRelease } from "./supply";
import { revalueAll } from "./valuation";
import { estimateAllValues } from "./value-estimates";

/**
 * Sets up a fresh game world: leagues, clubs, players and cards, packs, sets, the first card
 * release, the admin account, and history — real matches so far this season when the squads come
 * from Sportmonks, otherwise three simulated gameweeks. Used by `npm run db:seed` and by
 * Admin → Integrations → "Rebuild from Sportmonks".
 */
export interface DataPlayer {
  name: string;
  position: Position;
  nationality: string;
  squadNumber: number | null;
  onLoan: boolean;
  /** Sportmonks player id, when the squads were imported from Sportmonks. */
  smId?: number;
}
export interface DataClub {
  article: string;
  name: string;
  short: string;
  primaryColour: string;
  secondaryColour: string;
  kit: Record<string, unknown>;
  revision: string;
  /** Sportmonks team id, when imported from Sportmonks. */
  smId?: number;
  players: DataPlayer[];
}
export interface DataLeague {
  code: string;
  name: string;
  tier: number;
  isTopFlight: boolean;
  clubs: DataClub[];
}

const DAY = 24 * 3600_000;
const HISTORY_GAMEWEEKS = 3;
const rng = seededRandom(20261109);

function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function displayName(full: string) {
  if (full.length <= 18) return full;
  const { firstName, lastName } = splitName(full);
  return firstName ? `${firstName[0]}. ${lastName}` : lastName;
}


export type WorldData = { season: string; leagues: DataLeague[] };

export async function seedWorld(data: WorldData, opts: { realHistory?: boolean; log?: (m: string) => void } = {}) {
  const log = opts.log ?? ((m: string) => console.log(m));
  const sport = await db.sport.create({ data: { code: "football", name: "Football" } });
  for (const p of FOOTBALL_PACKS) {
    await db.packSku.create({
      data: { sportId: sport.id, code: p.code, version: p.version, name: p.name, kind: p.kind, priceMinor: p.priceMinor, config: p.config },
    });
  }

  // A player loaned in appears on both clubs' pages; keep them only at the club they play for.
  const loanedIn = new Set<string>();
  for (const l of data.leagues) for (const c of l.clubs) for (const p of c.players) if (p.onLoan) loanedIn.add(`${p.name}|${p.position}`);

  let seq = 0;
  const templatesByClub = new Map<string, Array<{ id: string; category: string; position: Position }>>();
  for (const lg of data.leagues) {
    const league = await db.league.create({
      data: { sportId: sport.id, code: lg.code, name: lg.name, country: "ENG", tier: lg.tier, isTopFlight: lg.isTopFlight },
    });
    for (const c of lg.clubs) {
      const club = await db.club.create({
        data: {
          leagueId: league.id,
          code: c.short,
          name: c.name,
          shortName: c.short,
          primaryColour: c.primaryColour,
          secondaryColour: c.secondaryColour,
          kit: c.kit as object,
          sourceRef: c.smId ? `sportmonks:team:${c.smId}` : `wikipedia:${c.article}@${c.revision}`,
          providerRefs: c.smId ? { sportmonks: String(c.smId) } : {},
          simStrength: Math.round(100 - lg.tier * 12 + rng.int(20)),
        },
      });
      const list: Array<{ id: string; category: string; position: Position }> = [];
      for (const p of c.players) {
        if (!p.onLoan && loanedIn.has(`${p.name}|${p.position}`)) continue;
        seq++;
        const { firstName, lastName } = splitName(p.name);
        const player = await db.player.create({
          data: {
            sportId: sport.id,
            clubId: club.id,
            firstName,
            lastName,
            displayName: displayName(p.name),
            position: p.position,
            squadNumber: p.squadNumber,
            nationality: p.nationality,
            rightsStatus: "PENDING",
            providerRefs: p.smId ? { sim: `sim-pl-${seq}`, sportmonks: String(p.smId) } : { sim: `sim-pl-${seq}` },
          },
        });
        const category = tierFor(lg.tier, p.squadNumber);
        const tpl = await db.cardTemplate.create({ data: { playerId: player.id, category, maxSupply: MAX_SUPPLY[category] } });
        list.push({ id: tpl.id, category, position: p.position });
      }
      templatesByClub.set(c.short, list);
    }
    log(`${lg.name}: ${lg.clubs.length} clubs`);
  }
  log(`Created ${seq} players`);

  // Tier by MATCHX estimated market values (Gold £20m+, Silver £2m–£20m, Bronze below), then use
  // the re-tiered templates for sets and the first release.
  const est = await estimateAllValues(null);
  log(`Estimated values: ${est.players} players (${est.named} named) · ${est.tiers.GOLD} Gold, ${est.tiers.SILVER} Silver, ${est.tiers.BRONZE} Bronze`);
  for (const short of templatesByClub.keys()) {
    const active = await db.cardTemplate.findMany({ where: { active: true, edition: "STANDARD", player: { club: { shortName: short } } }, include: { player: true } });
    templatesByClub.set(short, active.map((t) => ({ id: t.id, category: t.category, position: t.player.position })));
  }

  // Collection sets — examples; every completed set awards 10 MX credit (≈ £10).
  const sets: Array<{ code: string; name: string; description: string; templateIds: string[] }> = [];
  for (const short of ["ARS", "LIV", "MCI", "MUN", "CHE", "TOT"]) {
    const golds = (templatesByClub.get(short) ?? []).filter((t) => t.category === "GOLD").slice(0, 4);
    const club = await db.club.findUnique({ where: { code: short } });
    if (club && golds.length >= 3) sets.push({ code: `golds-${short.toLowerCase()}`, name: `${club.name} Golds`, description: `Collect ${golds.length} Gold ${club.name} players.`, templateIds: golds.map((t) => t.id) });
  }
  for (const short of ["WRE", "WHU"]) {
    const silvers = (templatesByClub.get(short) ?? []).filter((t) => t.category === "SILVER").slice(0, 4);
    const club = await db.club.findUnique({ where: { code: short } });
    if (club && silvers.length >= 3) sets.push({ code: `silvers-${short.toLowerCase()}`, name: `${club.name} Silvers`, description: `Collect ${silvers.length} Silver ${club.name} players.`, templateIds: silvers.map((t) => t.id) });
  }
  const l2Clubs = (data.leagues.find((l) => l.code === "LG2")?.clubs ?? []).map((c) => c.short);
  const l2Keepers = l2Clubs.flatMap((s) => (templatesByClub.get(s) ?? []).filter((t) => t.position === "GK").slice(0, 1)).slice(0, 5);
  if (l2Keepers.length >= 3) sets.push({ code: "league-two-keepers", name: "League Two No. 1s", description: `${l2Keepers.length} League Two goalkeepers.`, templateIds: l2Keepers.map((t) => t.id) });
  for (const s of sets) {
    await db.collectionSet.create({
      data: { sportId: sport.id, code: s.code, name: s.name, description: s.description, reward: { mpCreditMinor: 1000 }, requirements: { create: s.templateIds.map((templateId) => ({ templateId })) } },
    });
  }
  log(`Created ${sets.length} collection sets`);
  log(`Created ${await ensureClubBinders()} club binders`);

  // First weekly release (the next is auto-scheduled a week later).
  const now = Date.now();
  const release = await scheduleRelease(sport.id, new Date(now - 28 * DAY), { perTemplate: { BRONZE: 8, SILVER: 8, GOLD: 6 }, overrides: {} }, null);
  const r = await executeRelease(release.id, null);
  log(`Initial supply release minted ${r.minted} cards`);
  await revalueAll(new Date(now - 28 * DAY));

  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@matchx.dev").toLowerCase();
  await db.user.create({
    data: {
      email: adminEmail,
      displayName: "Admin",
      passwordHash: await hashPassword(process.env.SEED_ADMIN_PASSWORD ?? "matchx-admin"),
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    },
  });
  log(`Admin account: ${adminEmail}`);

  if (opts.realHistory) {
    // Real history: every match played so far this season, scored and settled week by week, so
    // launch values, tiers and form come from real results. Then the next week opens for entries.
    const r = await importSeasonToDate(data.season, new Date(now));
    log(`Real history: ${r.gameweeks} gameweeks settled from ${r.fixtures} matches; GW${r.openGameweek} open for entries`);
  } else {
    // Simulated history so form, results and value trends exist.
    for (let n = 1; n <= HISTORY_GAMEWEEKS; n++) {
      const locksAt = new Date(now - (HISTORY_GAMEWEEKS + 1 - n) * 7 * DAY);
      const gw = await createGameweek({ season: data.season, number: n, opensAt: new Date(locksAt.getTime() - 3 * DAY), firstKickoffAt: locksAt, actorId: null });
      await simulateFixturesNow(gw.id, "all", null);
      await finaliseGameweek(gw.id, null, new Date(locksAt.getTime() + 3 * DAY));
      log(`Gameweek ${n} simulated and settled`);
    }
    const gw = await createGameweek({ season: data.season, number: HISTORY_GAMEWEEKS + 1, opensAt: new Date(now), firstKickoffAt: new Date(now + 3 * DAY), actorId: null });
    log(`Gameweek ${gw.number} open for entries`);
  }
  // Test sites: let brand-new testers use the Transfer list straight away.
  if (process.env.TEST_SITE === "true") {
    await db.appSetting.upsert({ where: { key: "newTraderDays" }, create: { key: "newTraderDays", value: 0 }, update: { value: 0 } });
    log("Test site: new accounts can trade immediately");
  }
}
