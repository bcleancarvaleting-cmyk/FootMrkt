import type { RandomSource } from "../random";
import { type Category, type PackConfig, type SlotFilters, categoryRank } from "./config";

/** One card to be drawn. `guaranteedCategory` is the floor: the slot must never issue lower. */
export interface PlannedSlot {
  slotIndex: number;
  label: string;
  category: Category;
  guaranteedCategory: Category;
  filters: SlotFilters;
  /** Filters to use if we fall back to the guaranteed category. */
  baseFilters: SlotFilters;
}

/**
 * Roll the category for every slot of a pack. Pure: all randomness comes from `rng`.
 * Player identity is drawn later, against live stock (see server/packs.ts).
 */
export function planPack(cfg: PackConfig, rng: RandomSource): PlannedSlot[] {
  const plan: PlannedSlot[] = [];
  let index = 0;
  for (const slot of cfg.slots) {
    for (let i = 0; i < slot.count; i++) {
      const roll = rng.int(10_000);
      let acc = 0;
      let category: Category = slot.base;
      let filters: SlotFilters = { ...slot.filters };
      for (const up of slot.upgrades) {
        acc += up.chanceBp;
        if (roll < acc) {
          category = up.category;
          filters = { ...slot.filters, ...up.filters };
          break;
        }
      }
      plan.push({
        slotIndex: index++,
        label: slot.label,
        category,
        guaranteedCategory: slot.base,
        filters,
        baseFilters: { ...slot.filters },
      });
    }
  }

  if (cfg.topFlightRequirement) {
    const { count, category } = cfg.topFlightRequirement;
    let candidates = plan.filter((p) => p.category === category);
    if (candidates.length < count) {
      // Not enough rolled at this category: revert upgraded slots whose floor is this category.
      // (Reverting to the floor never breaks a guarantee.)
      const revertible = plan.filter((p) => p.category !== category && p.guaranteedCategory === category);
      for (const p of revertible.slice(0, count - candidates.length)) {
        p.category = p.guaranteedCategory;
        p.filters = { ...p.baseFilters };
      }
      candidates = plan.filter((p) => p.category === category);
    }
    if (candidates.length < count) {
      throw new PackPlanError(
        `topFlightRequirement needs ${count} ${category} slot(s) but only ${candidates.length} rolled; ` +
          `make sure enough slots have base ${category} with no upgrades, or lower the requirement`,
      );
    }
    // Choose `count` distinct slots uniformly at random (partial Fisher–Yates).
    const pool = [...candidates];
    for (let i = 0; i < count; i++) {
      const j = i + rng.int(pool.length - i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
      pool[i].filters = { ...pool[i].filters, topFlightOnly: true };
      if (pool[i].category === pool[i].guaranteedCategory) {
        pool[i].baseFilters = { ...pool[i].baseFilters, topFlightOnly: true };
      }
    }
  }
  return plan;
}

export class PackPlanError extends Error {}

/** True iff the issued categories honour every slot's guaranteed floor. */
export function honoursGuarantees(plan: PlannedSlot[], issued: Category[]): boolean {
  if (plan.length !== issued.length) return false;
  return plan.every((p, i) => categoryRank[issued[i]] >= categoryRank[p.guaranteedCategory]);
}
