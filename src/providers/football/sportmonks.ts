import type { AfEvent, AfFixture, AfPlayerStat } from "./api-football";

/**
 * Sportmonks Football API v3 adapter (product decision 11 Nov 2026: launch with the 92).
 *
 * Squads, fixtures, line-ups with per-player match details, and events come from Sportmonks. Each
 * fixture is converted into the same shape the API-Football adapter uses, so the tested scoring
 * conversion (goals conceded while on the pitch, own goals, subs, red cards) is shared.
 *
 * Fields are read by their `developer_name` (e.g. "GOALS", "MINUTES_PLAYED"), never by numeric
 * type ids, and the few places where the format could go either way are worked out from the data
 * itself (which player in a substitution came on, which side an own goal counts against). Run
 * `npm run sportmonks:check` against real data before switching DATA_PROVIDER to "sportmonks".
 */
export const SPORTMONKS_NAME = "sportmonks";
const BASE = process.env.SPORTMONKS_BASE ?? "https://api.sportmonks.com/v3/football";

/** Sportmonks league ids for the 92 (confirmed from the account's /my/leagues, 11 Nov 2026). */
export const SPORTMONKS_LEAGUES: Record<string, number> = { EPL: 8, CHA: 9, LG1: 12, LG2: 14 };

/** Includes for a full fixture: teams, score, state, line-ups with player match details, events. */
export const FIXTURE_INCLUDES = "participants;scores;state;lineups.details.type;lineups.type;events.type";

// ---- Response shapes (only the fields we read; everything optional so odd rows can't crash us) ----
export interface SmType {
  id?: number;
  developer_name?: string | null;
  name?: string | null;
  code?: string | null;
}
export interface SmParticipant {
  id: number;
  name: string;
  short_code?: string | null;
  meta?: { location?: "home" | "away" | string | null } | null;
}
export interface SmScore {
  participant_id: number;
  description?: string | null;
  score?: { goals?: number | null; participant?: string | null } | null;
}
export interface SmDetail {
  type_id?: number;
  type?: SmType | null;
  /** Most stats: { value }. PENALTIES: { total, won, scored, committed, saved, missed }. */
  data?: { value?: number | string | null; total?: number | null; won?: number | null; scored?: number | null; committed?: number | null; saved?: number | null; missed?: number | null } | null;
}
export interface SmLineup {
  player_id: number;
  team_id: number;
  player_name?: string | null;
  type_id?: number | null;
  type?: SmType | null;
  position_id?: number | null;
  formation_position?: number | null;
  details?: SmDetail[] | null;
}
export interface SmEvent {
  type_id?: number;
  type?: SmType | null;
  participant_id?: number | null;
  player_id?: number | null;
  related_player_id?: number | null;
  minute?: number | null;
  extra_minute?: number | null;
  /** Cards only: true when the referee rescinded it (it doesn't count). */
  rescinded?: boolean | null;
}
export interface SmFixture {
  id: number;
  league_id?: number;
  season_id?: number;
  starting_at?: string | null;
  starting_at_timestamp?: number | null;
  state?: SmType | null;
  participants?: SmParticipant[] | null;
  scores?: SmScore[] | null;
  lineups?: SmLineup[] | null;
  events?: SmEvent[] | null;
}

export function sportmonksConfigured() {
  // The token is injected by the network proxy, or read from SPORTMONKS_API_TOKEN.
  return process.env.DATA_PROVIDER === SPORTMONKS_NAME || !!process.env.SPORTMONKS_API_TOKEN;
}

/** GET from Sportmonks, following every page. */
export async function smGet<T>(path: string, params: Record<string, string | number> = {}, maxPages = 40): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    url.searchParams.set("page", String(page));
    if (!url.searchParams.has("per_page")) url.searchParams.set("per_page", "50");
    const token = process.env.SPORTMONKS_API_TOKEN;
    const res = await fetch(url, { headers: { Accept: "application/json", ...(token ? { Authorization: token } : {}) }, cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { data?: T | T[]; message?: string; pagination?: { has_more?: boolean } };
    if (!res.ok) throw new Error(`Sportmonks ${path} failed: HTTP ${res.status}${body.message ? ` — ${body.message}` : ""}`);
    if (Array.isArray(body.data)) out.push(...body.data);
    else if (body.data) out.push(body.data);
    if (!body.pagination?.has_more) break;
  }
  return out;
}

/** GET one object (no paging). */
export async function smGetOne<T>(path: string, params: Record<string, string | number> = {}): Promise<T | null> {
  return (await smGet<T>(path, params, 1))[0] ?? null;
}

// ---- Mapping helpers ----
const norm = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z]/g, "");
const typeName = (t: SmType | null | undefined) => norm(t?.developer_name ?? t?.code ?? t?.name);

/** A per-player match detail, looked up by any of its known names (optionally one field of it). */
function detail(l: SmLineup, ...names: string[]) {
  return detailField(l, null, ...names);
}
function detailField(l: SmLineup, field: "saved" | "missed" | null, ...names: string[]) {
  const want = names.map(norm);
  const d = (l.details ?? []).find((x) => want.includes(typeName(x.type)));
  const v = field ? d?.data?.[field] : (d?.data?.value ?? d?.data?.total ?? 0);
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Sportmonks match state → our short status codes (the API-Football ones the converter understands). */
export function stateShort(state: SmType | null | undefined): string {
  const s = typeName(state);
  if (["FT", "AET", "FTPEN", "AWARDED", "FINISHED", "FULLTIME", "AFTERPENALTIES", "AFTEREXTRATIME"].includes(s)) return s === "FTPEN" ? "PEN" : s === "AET" ? "AET" : "FT";
  if (["POSTPONED", "DELAYED", "SUSPENDED", "INTERRUPTED", "TBA"].includes(s)) return "PST";
  if (["CANCELLED", "CANCELED", "ABANDONED", "DELETED", "WALKOVER"].includes(s)) return "ABD";
  if (s.startsWith("INPLAY") || ["HT", "BREAK", "EXTRATIME", "PENBREAK", "PENALTIES", "LIVE", "ET", "PENLIVE"].includes(s)) return "LIVE";
  return "NS";
}

const isStarter = (l: SmLineup) => {
  const t = typeName(l.type);
  if (t) return t === "LINEUP" || t === "STARTINGXI" || t === "STARTING";
  return l.type_id === 11;
};

/**
 * Convert one Sportmonks fixture (with FIXTURE_INCLUDES) into the shared fixture shape:
 * substitutions as player = off, assist = on; own goals filed under the scorer's team.
 */
export function toSharedFixture(f: SmFixture): AfFixture {
  const parts = f.participants ?? [];
  const home = parts.find((p) => p.meta?.location === "home") ?? parts[0];
  const away = parts.find((p) => p.meta?.location === "away") ?? parts.find((p) => p !== home) ?? parts[1];
  const goalsFor = (teamId: number | undefined) => {
    const rows = (f.scores ?? []).filter((s) => s.participant_id === teamId);
    const current = rows.find((s) => norm(s.description) === "CURRENT") ?? rows.find((s) => norm(s.description) === "2NDHALF") ?? rows[rows.length - 1];
    const g = current?.score?.goals;
    return typeof g === "number" ? g : null;
  };
  const lineups = f.lineups ?? [];
  const teamOf = new Map(lineups.map((l) => [l.player_id, l.team_id]));
  const starters = new Set(lineups.filter(isStarter).map((l) => l.player_id));

  // Events, in time order, translated to the shared vocabulary.
  const raw = [...(f.events ?? [])].sort((a, b) => (a.minute ?? 0) + (a.extra_minute ?? 0) / 100 - ((b.minute ?? 0) + (b.extra_minute ?? 0) / 100));
  const onPitch = new Set(starters);
  const events: AfEvent[] = [];
  for (const e of raw) {
    const t = typeName(e.type);
    if (e.rescinded === true) continue; // an overturned card
    const time = { elapsed: e.minute ?? 0, extra: e.extra_minute ?? null };
    const team = { id: e.participant_id ?? teamOf.get(e.player_id ?? -1) ?? 0 };
    if (t === "SUBSTITUTION") {
      // Sportmonks: player_id comes ON, related_player_id goes OFF. Double-checked against who is
      // already on the pitch, in case a feed ever has them the other way round.
      let off = e.related_player_id ?? null;
      let on = e.player_id ?? null;
      if (on !== null && onPitch.has(on) && (off === null || !onPitch.has(off))) [off, on] = [on, off];
      if (off !== null) onPitch.delete(off);
      if (on !== null) onPitch.add(on);
      events.push({ time, team, type: "subst", detail: "Substitution", player: { id: off }, assist: { id: on } });
    } else if (t === "OWNGOAL") {
      events.push({ time, team: { id: teamOf.get(e.player_id ?? -1) ?? team.id }, type: "Goal", detail: "Own Goal", player: { id: e.player_id ?? null }, assist: { id: null } });
    } else if (t === "GOAL" || t === "PENALTY" || t === "PENALTYGOAL") {
      events.push({ time, team: { id: teamOf.get(e.player_id ?? -1) ?? team.id }, type: "Goal", detail: t === "GOAL" ? "Normal Goal" : "Penalty", player: { id: e.player_id ?? null }, assist: { id: e.related_player_id ?? null } });
    } else if (t === "MISSEDPENALTY" || t === "PENALTYMISSED") {
      events.push({ time, team, type: "Goal", detail: "Missed Penalty", player: { id: e.player_id ?? null }, assist: { id: null } });
    } else if (t === "REDCARD" || t === "YELLOWREDCARD") {
      events.push({ time, team, type: "Card", detail: t === "REDCARD" ? "Red Card" : "Second Yellow card", player: { id: e.player_id ?? null }, assist: { id: null } });
    } else if (t === "YELLOWCARD") {
      events.push({ time, team, type: "Card", detail: "Yellow Card", player: { id: e.player_id ?? null }, assist: { id: null } });
    }
  }

  const statsFor = (teamId: number | undefined): AfPlayerStat[] =>
    lineups
      .filter((l) => l.team_id === teamId)
      .map((l) => ({
        player: { id: l.player_id, name: l.player_name ?? String(l.player_id) },
        statistics: [
          {
            games: { minutes: detail(l, "MINUTES_PLAYED", "MINUTES"), position: positionOf({ position_id: l.position_id }) },
            goals: { total: detail(l, "GOALS", "GOALS_SCORED"), assists: detail(l, "ASSISTS"), saves: detail(l, "SAVES"), conceded: detail(l, "GOALS_CONCEDED") },
            tackles: { total: detail(l, "TACKLES") },
            cards: { yellow: detail(l, "YELLOWCARDS", "YELLOW_CARDS"), red: detail(l, "REDCARDS", "RED_CARDS") + detail(l, "YELLOWREDCARDS", "YELLOWRED_CARDS") },
            // PENALTIES (type 47) is one breakdown: { total, won, scored, committed, saved, missed }.
            penalty: { saved: detailField(l, "saved", "PENALTIES"), missed: detailField(l, "missed", "PENALTIES") },
          },
        ],
      }));

  return {
    fixture: { id: f.id, date: f.starting_at ? `${f.starting_at.replace(" ", "T")}Z` : new Date((f.starting_at_timestamp ?? 0) * 1000).toISOString(), status: { short: stateShort(f.state) } },
    teams: { home: { id: home?.id ?? 0, name: home?.name ?? "" }, away: { id: away?.id ?? 0, name: away?.name ?? "" } },
    goals: { home: goalsFor(home?.id), away: goalsFor(away?.id) },
    events,
    lineups: [home, away].filter(Boolean).map((p) => ({ team: { id: p!.id }, startXI: lineups.filter((l) => l.team_id === p!.id && isStarter(l)).map((l) => ({ player: { id: l.player_id } })) })),
    players: [home, away].filter(Boolean).map((p) => ({ team: { id: p!.id }, players: statsFor(p!.id) })),
  };
}

/** Sportmonks position → ours. Accepts the position object or the id (24 GK, 25 DEF, 26 MID, 27 ATT). */
export function positionOf(p: { position_id?: number | null; position?: SmType | null; detailed_position?: SmType | null }): "GK" | "DEF" | "MID" | "ATT" | null {
  const n = typeName(p.position);
  if (n.startsWith("GOAL")) return "GK";
  if (n.startsWith("DEF")) return "DEF";
  if (n.startsWith("MID")) return "MID";
  if (n.startsWith("ATT") || n.startsWith("FORW") || n.startsWith("STRIK")) return "ATT";
  return ({ 24: "GK", 25: "DEF", 26: "MID", 27: "ATT" } as const)[p.position_id as 24 | 25 | 26 | 27] ?? null;
}
