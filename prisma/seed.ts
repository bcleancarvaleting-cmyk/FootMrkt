/**
 * Development seed: a FICTIONAL placeholder catalogue.
 *
 * Real player names, images, clubs and league marks must not be used until rights are confirmed
 * (spec §10, §19). Every player is created with rightsStatus = PLACEHOLDER. Club strengths are
 * only used by the DEV match simulator and are never displayed as ratings.
 */
import "dotenv/config";
import type { CardCategory, Position } from "../src/generated/prisma/client";
import { FOOTBALL_PACKS } from "../src/config/packs";
import { seededRandom } from "../src/domain/random";
import { hashPassword } from "../src/server/auth/password";
import { db } from "../src/server/db";
import { createGameweek } from "../src/server/gameweeks";
import { DEFAULT_WEEKLY_PLAN, executeRelease, scheduleRelease } from "../src/server/supply";
import { revalueAll } from "../src/server/valuation";

const rng = seededRandom(20261109);
const pick = <T,>(xs: readonly T[]) => xs[rng.int(xs.length)];

const TOWNS = [
  "Northwick", "Elmbridge", "Castlemere", "Redhaven", "Stonebury", "Ravensholm", "Oakhurst", "Brackenridge",
  "Fernley", "Highmoor", "Ashcombe", "Kingsmere", "Larkfield", "Marlow Vale", "Penhallow", "Quarry Bank",
  "Rosewick", "Saltmarsh", "Thistledown", "Underhill", "Valemouth", "Whitcombe", "Yarrowby", "Brindleford",
  "Coldharbour", "Dunmore", "Eastmere", "Foxbury", "Glenhurst", "Hollowell",
];
const SUFFIX = ["City", "United", "Athletic", "Rovers", "Town", "Albion", "Wanderers", "County", "FC", "Borough"];
const FIRST = [
  "Alfie", "Callum", "Rhys", "Theo", "Jonah", "Kian", "Mateo", "Luca", "Oscar", "Reuben", "Sami", "Tobias", "Ellis",
  "Femi", "Kwame", "Idris", "Bastian", "Nico", "Ravi", "Owen", "Declan", "Ciaran", "Marek", "Tomas", "Yusuf", "Elijah",
  "Hugo", "Felix", "Rory", "Zane", "Dario", "Leon", "Arlo", "Jude", "Milo", "Ezra", "Caspar", "Ibrahim", "Joel", "Kofi",
];
const LAST = [
  "Ashworth", "Bellamy", "Carrow", "Dempsey", "Eke", "Fairbairn", "Gallagher", "Hartley", "Ingram", "Jessop", "Kowalski",
  "Lindqvist", "Mbeki", "Navarro", "Okafor", "Pennington", "Quayle", "Rasmussen", "Sandoval", "Thornton", "Umeh",
  "Varga", "Whitlock", "Yeboah", "Zielinski", "Abbott", "Brennan", "Castellano", "Duquesne", "Everton-Hale", "Fontaine",
  "Grimshaw", "Holloway", "Iwobi-Grant", "Jarvis", "Kettering", "Lowe", "Moreau", "Nakamura", "Oduya", "Prescott",
];
const NATIONS = ["ENG", "SCO", "WAL", "NIR", "IRL", "FRA", "ESP", "POR", "NED", "BEL", "GER", "NGA", "GHA", "BRA", "ARG", "JPN", "POL", "SWE", "DEN", "USA"];

const LEAGUES = [
  { code: "ENG1", name: "Top Flight (placeholder)", tier: 1, isTopFlight: true, clubs: 10 },
  { code: "ENG2", name: "Second Tier (placeholder)", tier: 2, isTopFlight: false, clubs: 8 },
  { code: "ENG3", name: "Third Tier (placeholder)", tier: 3, isTopFlight: false, clubs: 6 },
  { code: "ENG4", name: "Fourth Tier (placeholder)", tier: 4, isTopFlight: false, clubs: 6 },
];
// Category mix by league tier: [GOLD, SILVER] thresholds out of 100.
const MIX: Record<number, [number, number]> = { 1: [40, 80], 2: [12, 55], 3: [0, 25], 4: [0, 10] };
const SQUAD: Array<[Position, number]> = [["GK", 2], ["DEF", 6], ["MID", 6], ["ATT", 4]];
const MAX_SUPPLY: Record<CardCategory, number> = { GOLD: 40, SILVER: 120, BRONZE: 400 };

async function main() {
  const existing = await db.sport.findUnique({ where: { code: "football" } });
  if (existing) {
    console.log("Database already seeded — run `npm run db:reset` for a fresh start.");
    return;
  }
  const sport = await db.sport.create({ data: { code: "football", name: "Football" } });

  for (const p of FOOTBALL_PACKS) {
    await db.packSku.create({
      data: { sportId: sport.id, code: p.code, version: p.version, name: p.name, kind: p.kind, priceMinor: p.priceMinor, config: p.config },
    });
  }

  const towns = [...TOWNS];
  const usedNames = new Set<string>();
  let playerSeq = 0;
  const goldTemplatesByClub = new Map<string, string[]>();
  const bronzeGkTemplates: string[] = [];

  for (const lg of LEAGUES) {
    const league = await db.league.create({
      data: { sportId: sport.id, code: lg.code, name: lg.name, country: "ENG", tier: lg.tier, isTopFlight: lg.isTopFlight },
    });
    for (let c = 0; c < lg.clubs; c++) {
      const town = towns.splice(rng.int(towns.length), 1)[0];
      const name = `${town} ${pick(SUFFIX)}`;
      const code = town.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() + lg.tier;
      const club = await db.club.create({
        data: {
          leagueId: league.id,
          code,
          name,
          shortName: town.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase(),
          simStrength: Math.round(100 - lg.tier * 15 + rng.int(25)),
        },
      });
      for (const [position, n] of SQUAD) {
        for (let i = 0; i < n; i++) {
          let first: string, last: string, full: string;
          do {
            first = pick(FIRST);
            last = pick(LAST);
            full = `${first} ${last}`;
          } while (usedNames.has(full));
          usedNames.add(full);
          playerSeq++;
          const dob = new Date(Date.UTC(1990 + rng.int(17), rng.int(12), 1 + rng.int(28)));
          const player = await db.player.create({
            data: {
              sportId: sport.id,
              clubId: club.id,
              firstName: first,
              lastName: last,
              displayName: `${first[0]}. ${last}`,
              position,
              nationality: pick(NATIONS),
              dateOfBirth: dob,
              rightsStatus: "PLACEHOLDER",
              providerRefs: { sim: `sim-pl-${playerSeq}` },
            },
          });
          const roll = rng.int(100);
          const [g, s] = MIX[lg.tier];
          const category: CardCategory = roll < g ? "GOLD" : roll < s ? "SILVER" : "BRONZE";
          const tpl = await db.cardTemplate.create({
            data: { playerId: player.id, category, edition: "STANDARD", maxSupply: MAX_SUPPLY[category] },
          });
          if (category === "GOLD") goldTemplatesByClub.set(club.id, [...(goldTemplatesByClub.get(club.id) ?? []), tpl.id]);
          if (category === "BRONZE" && position === "GK" && lg.tier >= 3) bronzeGkTemplates.push(tpl.id);
        }
      }
    }
  }
  console.log(`Created ${playerSeq} placeholder players`);

  // Collections (definitions TO CONFIRM — these are examples).
  const topClubs = await db.club.findMany({ where: { league: { code: "ENG1" } }, orderBy: { name: "asc" }, take: 4 });
  for (const club of topClubs) {
    const tpls = (goldTemplatesByClub.get(club.id) ?? []).slice(0, 4);
    if (tpls.length < 2) continue;
    await db.collectionSet.create({
      data: {
        sportId: sport.id,
        code: `golds-${club.code.toLowerCase()}`,
        name: `${club.name} Golds`,
        description: `Collect ${tpls.length} Gold cards of ${club.name} players.`,
        requirements: { create: tpls.map((templateId) => ({ templateId })) },
      },
    });
  }
  if (bronzeGkTemplates.length >= 4) {
    await db.collectionSet.create({
      data: {
        sportId: sport.id,
        code: "lower-league-keepers",
        name: "Lower League Keepers",
        description: "Four Bronze goalkeepers from the third and fourth tiers.",
        requirements: { create: bronzeGkTemplates.slice(0, 4).map((templateId) => ({ templateId })) },
      },
    });
  }

  // First weekly release goes out now; the next is scheduled a week later automatically.
  const release = await scheduleRelease(sport.id, new Date(), { ...DEFAULT_WEEKLY_PLAN, perTemplate: { BRONZE: 8, SILVER: 4, GOLD: 2 } }, null);
  const r = await executeRelease(release.id, null);
  console.log(`Initial supply release minted ${r.minted} cards`, r.byCategory ?? "");
  await revalueAll();

  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@collectr.dev").toLowerCase();
  await db.user.create({
    data: {
      email: adminEmail,
      displayName: "Admin",
      passwordHash: await hashPassword(process.env.SEED_ADMIN_PASSWORD ?? "collectr-admin"),
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`Admin account: ${adminEmail}`);

  const now = new Date();
  const gw = await createGameweek({
    season: "2026-27",
    number: 1,
    opensAt: now,
    locksAt: new Date(now.getTime() + 3 * 24 * 3600_000),
    actorId: null,
  });
  console.log(`Gameweek ${gw.number} created and open for entries`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
