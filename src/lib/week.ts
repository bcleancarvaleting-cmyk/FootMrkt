/** UK week boundaries (Monday 00:00 Europe/London). Pure — no database. */
export function londonOffsetMs(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "shortOffset" }).formatToParts(d);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = tz.match(/GMT([+-]\d+)?/);
  return (m?.[1] ? Number(m[1]) : 0) * 3600_000;
}

/** Start of the current UK week (Monday 00:00 Europe/London) as a UTC Date. */
export function weekStart(now = new Date()): Date {
  const local = new Date(now.getTime() + londonOffsetMs(now));
  const day = (local.getUTCDay() + 6) % 7; // Monday = 0
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - day);
  const guess = new Date(startLocal);
  return new Date(startLocal - londonOffsetMs(guess));
}

/** The UK calendar date of this week's Monday, e.g. "2026-11-09". */
export function weekKey(now = new Date()): string {
  const start = weekStart(now);
  return new Date(start.getTime() + londonOffsetMs(start)).toISOString().slice(0, 10);
}

