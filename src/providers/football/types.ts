import type { StatLine } from "@/domain/football/scoring";

/**
 * Provider abstraction (spec §10): scoring never sees a provider's raw format. Swapping the
 * data supplier means writing a new adapter, not touching scoring or settlement.
 *
 * BLOCKER (spec §10, §19): no licensed football data provider has been selected yet. The only
 * implementation is the DEV simulated provider, behind the SIMULATED_DATA flag.
 */

export interface ProviderClub {
  ref: string; // provider's club id
  strengthHint?: number;
}

export interface ProviderPlayer {
  ref: string; // provider's player id
  clubRef: string;
  position: "GK" | "DEF" | "MID" | "ATT";
}

export interface ProviderFixture {
  providerFixtureId: string;
  homeClubRef: string;
  awayClubRef: string;
  kickoffAt: Date;
}

export type ProviderFixtureStatus = "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | "ABANDONED";

/** One raw message from the provider. `providerEventId` is unique per message, including corrections. */
export interface ProviderMessage {
  providerEventId: string;
  kind: "FIXTURE_RESULT" | "PLAYER_STATS";
  providerFixtureId: string;
  /** For PLAYER_STATS: provider player ref. */
  playerRef?: string;
  /** Monotonic per (fixture, player): a higher revision supersedes earlier ones. */
  revision: number;
  payload: Record<string, unknown>;
}

export interface FootballDataProvider {
  readonly name: string;
  /** Convert this provider's stat payload into the internal StatLine. */
  normaliseStats(payload: Record<string, unknown>): StatLine;
  /** Convert a FIXTURE_RESULT payload. */
  normaliseFixture(payload: Record<string, unknown>): {
    status: ProviderFixtureStatus;
    homeGoals: number | null;
    awayGoals: number | null;
  };
}
