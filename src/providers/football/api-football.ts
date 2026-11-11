import { createHash } from "node:crypto";
import { toStatLine } from "@/domain/football/scoring";
import type { FootballDataProvider, ProviderFixtureStatus, ProviderMessage } from "./types";

/**
 * API-Football (api-sports.io, v3) adapter.
 *
 * Off until API_FOOTBALL_KEY is set. One `/fixtures?ids=a-b-c` call returns up to 20 fixtures with
 * their lineups, events and per-player statistics, so a whole gameweek polls in a handful of
 * requests. The raw response is turned into the same ProviderMessages the simulator produces, so
 * ingestion, scoring and settlement are unchanged.
 */
export const API_FOOTBALL_NAME = "api-football";
const BASE = process.env.API_FOOTBALL_BASE ?? "https://v3.football.api-sports.io";

/** API-Football league ids for the leagues we cover. */
export const API_FOOTBALL_LEAGUES: Record<string, number> = { EPL: 39, CHA: 40, LG1: 41, LG2: 42 };

export function apiFootballConfigured() {
  return !!process.env.API_FOOTBALL_KEY;
}

export async function apiFootballGet<T = unknown>(path: string, params: Record<string, string | number>): Promise<T[]> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY is not set");
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { "x-apisports-key": key }, cache: "no-store" });
  if (!res.ok) throw new Error(`API-Football ${path} failed: HTTP ${res.status}`);
  const body = (await res.json()) as { response?: T[]; errors?: unknown };
  const errors = body.errors && (Array.isArray(body.errors) ? body.errors.length : Object.keys(body.errors).length);
  if (errors) throw new Error(`API-Football ${path}: ${JSON.stringify(body.errors)}`);
  return body.response ?? [];
}

// ---- Response shapes (only the fields we use) ----
export interface AfTeam {
  id: number;
  name: string;
}
export interface AfEvent {
  time: { elapsed: number | null; extra: number | null };
  team: { id: number };
  player: { id: number | null; name?: string | null };
  assist: { id: number | null; name?: string | null };
  type: string; // "Goal" | "Card" | "subst" | "Var"
  detail: string; // "Normal Goal" | "Own Goal" | "Penalty" | "Missed Penalty" | "Yellow Card" | "Red Card" | "Second Yellow card" | "Substitution 1" …
}
export interface AfPlayerStat {
  player: { id: number; name: string };
  statistics: Array<{
    games?: { minutes?: number | null; position?: string | null };
    goals?: { total?: number | null; assists?: number | null; saves?: number | null; conceded?: number | null };
    tackles?: { total?: number | null };
    cards?: { yellow?: number | null; red?: number | null };
    penalty?: { saved?: number | null; missed?: number | null };
  }>;
}
export interface AfFixture {
  fixture: { id: number; date: string; status: { short: string; elapsed?: number | null } };
  league?: { id: number; season: number; round?: string };
  teams: { home: AfTeam; away: AfTeam };
  goals: { home: number | null; away: number | null };
  events?: AfEvent[];
  lineups?: Array<{ team: { id: number }; startXI: Array<{ player: { id: number } }> }>;
  players?: Array<{ team: { id: number }; players: AfPlayerStat[] }>;
}

export function fixtureStatus(short: string): ProviderFixtureStatus {
  if (["FT", "AET", "PEN"].includes(short)) return "FINISHED";
  if (["PST", "SUSP"].includes(short)) return "POSTPONED";
  if (["CANC", "ABD", "AWD", "WO"].includes(short)) return "ABANDONED";
  if (["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"].includes(short)) return "LIVE";
  return "SCHEDULED";
}

const t = (e: AfEvent) => (e.time.elapsed ?? 0) + (e.time.extra ?? 0) / 100;
const n = (v: number | null | undefined) => (typeof v === "number" && v > 0 ? v : 0);

/**
 * Who conceded each goal. A normal goal is conceded by the other team; for an own goal API-Football
 * normally files the event under the player's own team. If that reading doesn't add up to the final
 * score, the other reading is used instead.
 */
function concededBy(f: AfFixture): Array<{ team: number; at: number }> {
  const goals = (f.events ?? []).filter((e) => e.type === "Goal" && e.detail !== "Missed Penalty");
  const other = (id: number) => (id === f.teams.home.id ? f.teams.away.id : f.teams.home.id);
  const read = (ogOnOwnTeam: boolean) => goals.map((e) => ({ team: e.detail === "Own Goal" ? (ogOnOwnTeam ? e.team.id : other(e.team.id)) : other(e.team.id), at: t(e) }));
  const fits = (list: Array<{ team: number }>) =>
    list.filter((g) => g.team === f.teams.home.id).length === (f.goals.away ?? 0) && list.filter((g) => g.team === f.teams.away.id).length === (f.goals.home ?? 0);
  const a = read(true);
  return fits(a) ? a : read(false);
}

/** Turn one fixture (with events, lineups and players) into provider messages. */
export function messagesForFixture(f: AfFixture): ProviderMessage[] {
  const fid = String(f.fixture.id);
  const out: ProviderMessage[] = [];
  const status = fixtureStatus(f.fixture.status.short);
  const fixturePayload = { status, home: f.goals.home, away: f.goals.away };
  out.push({ providerEventId: `${fid}:result:${hash(fixturePayload)}`, kind: "FIXTURE_RESULT", providerFixtureId: fid, revision: revisionNow(), payload: fixturePayload });
  if (status === "SCHEDULED" || status === "POSTPONED") return out;

  const events = f.events ?? [];
  const conceded = concededBy(f);
  const starters = new Set((f.lineups ?? []).flatMap((l) => l.startXI.map((s) => s.player.id)));
  for (const side of f.players ?? []) {
    for (const p of side.players) {
      const s = p.statistics[0] ?? {};
      const minutes = n(s.games?.minutes);
      const id = p.player.id;
      // On-pitch window: from kick-off (or coming on) until going off or being sent off.
      const subs = events.filter((e) => e.type === "subst");
      const cameOn = subs.find((e) => e.assist.id === id);
      const wentOff = subs.find((e) => e.player.id === id);
      const sentOff = events.find((e) => e.type === "Card" && /red|second yellow/i.test(e.detail) && e.player.id === id);
      const from = starters.has(id) ? 0 : cameOn ? t(cameOn) : minutes > 0 ? 0 : Infinity;
      const until = Math.min(wentOff ? t(wentOff) : Infinity, sentOff ? t(sentOff) : Infinity);
      const goalsConceded = minutes > 0 ? conceded.filter((g) => g.team === side.team.id && g.at >= from && g.at < until).length : 0;
      const ownGoals = events.filter((e) => e.type === "Goal" && e.detail === "Own Goal" && e.player.id === id).length;
      const line = {
        minutes,
        goals: n(s.goals?.total),
        assists: n(s.goals?.assists),
        penaltySaves: n(s.penalty?.saved),
        saves: n(s.goals?.saves),
        tackles: n(s.tackles?.total),
        yellowCards: n(s.cards?.yellow),
        redCards: n(s.cards?.red),
        ownGoals,
        penaltiesMissed: n(s.penalty?.missed),
        goalsConceded,
      };
      // Same numbers re-polled → same event id (ignored). Changed numbers → a new, later revision.
      out.push({ providerEventId: `${fid}:${id}:${hash(line)}`, kind: "PLAYER_STATS", providerFixtureId: fid, playerRef: String(id), revision: revisionNow(), payload: line });
    }
  }
  return out;
}

function hash(v: unknown) {
  return createHash("sha1").update(JSON.stringify(v)).digest("hex").slice(0, 12);
}

export const apiFootballProvider: FootballDataProvider = {
  name: API_FOOTBALL_NAME,
  normaliseStats: (p) => toStatLine(p),
  normaliseFixture: (p) => ({
    status: (p.status as ProviderFixtureStatus) ?? "SCHEDULED",
    homeGoals: typeof p.home === "number" ? p.home : null,
    awayGoals: typeof p.away === "number" ? p.away : null,
  }),
};

/** Fold names for matching our player records to the provider's ("Ødegaard" ~ "M. Odegaard"). */
export function nameKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ø/gi, "o")
    .replace(/æ/gi, "ae")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, "")
    .trim();
}

/** Best match for a provider player among a club's players: full name, then surname + initial, then surname alone if unique. */
export function matchPlayer<T extends { displayName: string }>(providerName: string, candidates: T[]): T | null {
  const key = nameKey(providerName);
  const exact = candidates.filter((c) => nameKey(c.displayName) === key);
  if (exact.length === 1) return exact[0];
  const parts = key.split(/\s+/);
  const surname = parts[parts.length - 1];
  const initial = parts[0]?.replace(/\.$/, "")[0];
  const bySurname = candidates.filter((c) => nameKey(c.displayName).split(/\s+/).pop() === surname);
  if (bySurname.length === 1) return bySurname[0];
  const withInitial = bySurname.filter((c) => nameKey(c.displayName)[0] === initial);
  return withInitial.length === 1 ? withInitial[0] : null;
}

/** Seconds since 2024 — increases with every poll and fits the 32-bit revision column. */
function revisionNow() {
  return Math.floor((Date.now() - Date.UTC(2024, 0, 1)) / 1000);
}
