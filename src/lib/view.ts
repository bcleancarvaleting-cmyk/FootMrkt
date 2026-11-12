import { FINISHES } from "@/config/tiers";
import { type Kit, toKit } from "./kit";

export type Category = "BRONZE" | "SILVER" | "GOLD";
export type Pos = "GK" | "DEF" | "MID" | "ATT";

/** Serializable card view model shared by server pages and client components. */
export interface CardView {
  id: string;
  playerId: string;
  name: string;
  firstName: string;
  lastName: string;
  position: Pos;
  category: Category;
  edition: "STANDARD" | "STARTER" | "LOAN";
  /** Loan players only: gameweeks left of the loan (counted by gameweeks the manager enters). */
  loan: { left: number; total: number; ended: boolean } | null;
  /** Special finish on a Gold — cosmetic only; null for normal cards. "Ruby 3 of 20", "Diamond 2 of 10". */
  finish: { kind: "RUBY" | "DIAMOND" | "RAINBOW"; serial: number; of: number } | null;
  /** Copies of this design issued so far (null when not looked up). */
  issued: number | null;
  /** History stamps earned by this copy (hat-tricks, clean sheets, match wins…). */
  stamps: number;
  clubCode: string | null;
  clubShort: string | null;
  clubName: string | null;
  clubPrimary: string;
  clubSecondary: string;
  kit: Kit;
  crestUrl: string | null;
  leagueName: string | null;
  topFlight: boolean;
  nationality: string;
  serial: number;
  maxSupply: number | null;
  valueMp: number | null;
  /** % change vs the previous valuation (null = no history yet). */
  trendPct: number | null;
  /** Recent value history (MX, oldest first, finish multiplier applied) for a small graph. */
  history?: number[];
  /** How the current owner got it: "Starter", "Packed", "Paid £4.50", … */
  acquired: string | null;
  /** Points this card has won for its current owner in settled competitions (null = not owned). */
  pointsForYou: number | null;
  imageUrl: string | null;
  imageCredit: string | null;
  squadNumber: number | null;
  tradeable: boolean;
  lock: "NONE" | "LISTED" | "COMPETITION";
  lockRef: string | null;
  favourite?: boolean;
  duplicateCount?: number;
  /** In the current Team of the Week (the badge lasts 7 days). */
  totw?: boolean;
  /** Managers with this player on their watchlist. */
  watchers?: number;
  /** Tipped to rise: % the value is heading up, from live form and sales (a projection). */
  risingPct?: number;
}

type CardLike = {
  id: string;
  serial: number;
  loanGameweeks?: number | null;
  finish?: { kind: string; serial: number } | null;
  tradeStatus: string;
  lock: string;
  lockRef: string | null;
  template: {
    category: string;
    edition: string;
    maxSupply: number | null;
    player: {
      id: string;
      displayName: string;
      firstName: string;
      lastName: string;
      position: string;
      nationality: string;
      squadNumber?: number | null;
      imageUrl?: string | null;
      imageCredit?: string | null;
      club: {
        code: string;
        shortName: string;
        name: string;
        primaryColour?: string;
        secondaryColour?: string;
        crestUrl?: string | null;
        kit?: unknown;
        league: { name: string; isTopFlight: boolean };
      } | null;
    };
  };
};

export function toCardView(
  c: CardLike,
  extra: {
    valueMp?: number | null;
    trendPct?: number | null;
    acquired?: string | null;
    pointsForYou?: number | null;
    favourite?: boolean;
    duplicateCount?: number;
    loan?: { left: number; ended: boolean };
    issued?: number;
    stamps?: number;
    history?: number[];
    totw?: boolean;
    watchers?: number;
    risingPct?: number;
  } = {},
): CardView {
  const p = c.template.player;
  const loan = c.loanGameweeks ? { total: c.loanGameweeks, left: extra.loan?.left ?? c.loanGameweeks, ended: extra.loan?.ended ?? false } : null;
  return {
    id: c.id,
    playerId: p.id,
    name: p.displayName,
    firstName: p.firstName,
    lastName: p.lastName,
    position: p.position as Pos,
    category: c.template.category as Category,
    edition: c.template.edition as CardView["edition"],
    loan,
    finish: c.finish
      ? { kind: c.finish.kind as "RUBY" | "DIAMOND" | "RAINBOW", serial: c.finish.serial, of: FINISHES[c.finish.kind as "RUBY" | "DIAMOND" | "RAINBOW"].perPlayer }
      : null,
    issued: extra.issued ?? null,
    stamps: extra.stamps ?? 0,
    history: extra.history,
    totw: extra.totw || undefined,
    watchers: extra.watchers || undefined,
    risingPct: loan ? undefined : extra.risingPct || undefined,
    clubCode: p.club?.code ?? null,
    clubShort: p.club?.shortName ?? null,
    clubName: p.club?.name ?? null,
    clubPrimary: p.club?.primaryColour ?? "#2a2f38",
    clubSecondary: p.club?.secondaryColour ?? "#ffffff",
    kit: toKit(p.club?.kit, p.club?.primaryColour ?? "#2a2f38", p.club?.secondaryColour ?? "#ffffff"),
    crestUrl: p.club?.crestUrl ?? null,
    leagueName: p.club?.league.name ?? null,
    topFlight: p.club?.league.isTopFlight ?? false,
    nationality: p.nationality,
    serial: c.serial,
    maxSupply: c.template.maxSupply,
    // Loan players have no value.
    valueMp: loan ? null : (extra.valueMp ?? null),
    trendPct: loan ? null : (extra.trendPct ?? null),
    acquired: extra.acquired ?? null,
    pointsForYou: extra.pointsForYou ?? null,
    imageUrl: p.imageUrl ?? null,
    imageCredit: p.imageCredit ?? null,
    squadNumber: p.squadNumber ?? null,
    tradeable: c.tradeStatus === "TRADEABLE",
    lock: c.lock as CardView["lock"],
    lockRef: c.lockRef,
    favourite: extra.favourite,
    duplicateCount: extra.duplicateCount,
  };
}

export function mpLabel(mp: number | null): string {
  return mp === null ? "— MX" : `${mp} MX`;
}

export function gbp(minor: number): string {
  return `£${(minor / 100).toFixed(2)}`;
}

export const POSITION_LABEL: Record<Pos, string> = { GK: "Goalkeeper", DEF: "Defender", MID: "Midfielder", ATT: "Attacker" };

export function fmtDate(d: Date | string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", ...opts }).format(new Date(d));
}

export function relativeTime(d: Date | string): string {
  const ms = new Date(d).getTime() - Date.now();
  const abs = Math.abs(ms);
  const unit = abs < 3600_000 ? ["minute", 60_000] : abs < 86_400_000 ? ["hour", 3600_000] : ["day", 86_400_000];
  return new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" }).format(Math.round(ms / (unit[1] as number)), unit[0] as Intl.RelativeTimeFormatUnit);
}

/** A Date `hours` before now (request time). */
export function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3600_000);
}

export function ageFrom(dob: Date | null): number | null {
  return dob ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 86_400_000)) : null;
}

/** Short league label for tight spaces (pitch slots): PL, CH, L1, L2. */
export function leagueShort(name: string | null | undefined) {
  const map: Record<string, string> = { "Premier League": "PL", Championship: "CH", "League One": "L1", "League Two": "L2" };
  return name ? (map[name] ?? name) : "";
}
