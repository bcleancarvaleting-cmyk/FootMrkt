/**
 * £ prize pots (product decision 10 Nov 2026). Admins set a prize per finishing position
 * (e.g. 1st £10, 2nd £5, 3rd £3 = an £18 pot). Ties use the dead-heat rule: managers who tie
 * share the prizes for every position they jointly occupy, split equally.
 *
 *   10 managers joint 1st with 1st £10 / 2nd £5 / 3rd £3 → £18 ÷ 10 = £1.80 each.
 *   Two joint 2nd → (£5 + £3) ÷ 2 = £4 each.
 *
 * Splits are rounded down to the penny; any leftover pennies are not paid out.
 */
export interface CashRule {
  rankFrom: number;
  rankTo: number;
  cashMinor?: number;
}

/** Prize for each finishing position, 1-based. */
export function positionPrizes(rules: CashRule[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of rules) {
    if (!r.cashMinor || r.cashMinor <= 0) continue;
    for (let p = r.rankFrom; p <= Math.min(r.rankTo, r.rankFrom + 10_000); p++) out.set(p, (out.get(p) ?? 0) + r.cashMinor);
  }
  return out;
}

export function potTotal(rules: CashRule[]) {
  return [...positionPrizes(rules).values()].reduce((a, b) => a + b, 0);
}

/** `standings` must be sorted best first. Returns each winner's share in pence. */
export function splitPrizePot<T extends { userId: string; total: number }>(standings: T[], rules: CashRule[]): Map<string, number> {
  const prizes = positionPrizes(rules);
  const out = new Map<string, number>();
  let i = 0;
  while (i < standings.length) {
    let j = i;
    while (j + 1 < standings.length && standings[j + 1].total === standings[i].total) j++;
    let pot = 0;
    for (let pos = i + 1; pos <= j + 1; pos++) pot += prizes.get(pos) ?? 0;
    const share = Math.floor(pot / (j - i + 1));
    if (share > 0) for (let k = i; k <= j; k++) out.set(standings[k].userId, share);
    i = j + 1;
  }
  return out;
}

/** A prize rule as shown to managers: £ for a range of positions, and/or a pack (by name). */
export interface PrizeRule extends CashRule {
  pack?: string;
}

/**
 * "If it ended now": what each manager would win from the live table — the £ pot split by the
 * dead-heat rule (exactly as at settlement), and a pack for everyone whose rank earns one (managers
 * tied on a pack position all get one). `rows` must be sorted best first.
 */
export function projectedWins(rows: Array<{ userId: string; points: number; rank: number }>, rules: PrizeRule[]): Map<string, { cashMinor: number; packs: string[] }> {
  const out = new Map<string, { cashMinor: number; packs: string[] }>();
  if (!rules.length || !rows.length) return out;
  const cash = splitPrizePot(rows.map((r) => ({ userId: r.userId, total: r.points })), rules);
  for (const r of rows) {
    const packs = rules.filter((x) => x.pack && r.rank >= x.rankFrom && r.rank <= x.rankTo).map((x) => x.pack!);
    const c = cash.get(r.userId) ?? 0;
    if (c > 0 || packs.length) out.set(r.userId, { cashMinor: c, packs });
  }
  return out;
}
