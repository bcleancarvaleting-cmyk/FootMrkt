import { z } from "zod";

export const CATEGORIES = ["BRONZE", "SILVER", "GOLD"] as const;
export type Category = (typeof CATEGORIES)[number];
export const POSITIONS = ["GK", "DEF", "MID", "ATT"] as const;
export type Position = (typeof POSITIONS)[number];

export const categoryRank: Record<Category, number> = { BRONZE: 0, SILVER: 1, GOLD: 2 };

const CategorySchema = z.enum(CATEGORIES);
const PositionSchema = z.enum(POSITIONS);

export const SlotFiltersSchema = z
  .object({
    topFlightOnly: z.boolean().optional(),
    positions: z.array(PositionSchema).min(1).optional(),
    /** Only players at clubs in these league countries, e.g. ["ENG"] for England packs. */
    countries: z.array(z.string().min(2).max(3)).min(1).optional(),
  })
  .strict();
export type SlotFilters = z.infer<typeof SlotFiltersSchema>;

/**
 * A pack slot. `base` is the guaranteed minimum for the slot — it is never downgraded.
 * `upgrades` are optional chances (in basis points, 10000 = 100%) to draw a higher category
 * instead. If an upgraded category has no eligible stock, the slot falls back to `base`.
 */
export const SlotSchema = z
  .object({
    label: z.string().min(1),
    count: z.number().int().positive(),
    base: CategorySchema,
    filters: SlotFiltersSchema.optional(),
    upgrades: z
      .array(
        z
          .object({
            category: CategorySchema,
            chanceBp: z.number().int().min(0).max(10_000),
            filters: SlotFiltersSchema.optional(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict()
  .superRefine((slot, ctx) => {
    const total = slot.upgrades.reduce((s, u) => s + u.chanceBp, 0);
    if (total > 10_000) ctx.addIssue({ code: "custom", message: `slot "${slot.label}": upgrade chances exceed 100%` });
    for (const u of slot.upgrades) {
      if (categoryRank[u.category] <= categoryRank[slot.base]) {
        ctx.addIssue({ code: "custom", message: `slot "${slot.label}": upgrade ${u.category} is not above base ${slot.base}` });
      }
    }
  });
export type Slot = z.infer<typeof SlotSchema>;

export const PackConfigSchema = z
  .object({
    /**
     * POOL: draw existing card instances from the controlled supply pool (regular packs).
     * MINT: mint new STARTER-edition, NON_TRADEABLE copies of randomly chosen players (starter pack).
     */
    mode: z.enum(["POOL", "MINT"]),
    slots: z.array(SlotSchema).min(1),
    /** Avoid the same player appearing twice in one pack. */
    uniquePlayers: z.boolean().default(true),
    /**
     * Require N cards of a category to be top-flight players. Applied to randomly chosen
     * slots whose drawn category matches. (Starter pack: one lower-value top-flight player.)
     */
    topFlightRequirement: z
      .object({ count: z.number().int().positive(), category: CategorySchema })
      .strict()
      .optional(),
    /** Mark issued cards permanently NON_TRADEABLE. Required true for MINT/starter packs. */
    nonTradeable: z.boolean().default(false),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    if (cfg.mode === "MINT" && !cfg.nonTradeable) {
      ctx.addIssue({ code: "custom", message: "MINT (starter) packs must be nonTradeable" });
    }
  });
export type PackConfig = z.infer<typeof PackConfigSchema>;

export function parsePackConfig(raw: unknown): PackConfig {
  return PackConfigSchema.parse(raw);
}

export function cardCount(cfg: PackConfig): number {
  return cfg.slots.reduce((s, slot) => s + slot.count, 0);
}

/** The guarantee shown to users: minimum number of cards at or above each category. */
export function advertisedGuarantee(cfg: PackConfig): Record<Category, number> {
  const atLeast: Record<Category, number> = { BRONZE: 0, SILVER: 0, GOLD: 0 };
  for (const slot of cfg.slots) {
    for (const c of CATEGORIES) {
      if (categoryRank[slot.base] >= categoryRank[c]) atLeast[c] += slot.count;
    }
  }
  return atLeast;
}
