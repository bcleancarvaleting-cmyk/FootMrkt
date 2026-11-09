import Link from "next/link";
import { ClubTabs } from "@/components/club-tabs";
import { PlayerCard } from "@/components/player-card";
import { requireUser } from "@/server/auth/session";
import { type BinderFilters, binder, binderTotals } from "@/server/binder";
import { db } from "@/server/db";

export const metadata = { title: "My Collection" };

type SP = Record<string, string | undefined>;

export default async function BinderPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters: BinderFilters = {
    category: ["BRONZE", "SILVER", "GOLD"].includes(sp.category ?? "") ? (sp.category as BinderFilters["category"]) : undefined,
    position: ["GK", "DEF", "MID", "ATT"].includes(sp.position ?? "") ? (sp.position as BinderFilters["position"]) : undefined,
    club: sp.club || undefined,
    q: sp.q?.slice(0, 40) || undefined,
    status: (["available", "locked", "listed", "competition", "nontradeable"] as const).find((s) => s === sp.status),
    duplicates: sp.duplicates === "1",
    favourites: sp.favourites === "1",
  };
  const [cards, totals, clubs] = await Promise.all([
    binder(user.id, filters),
    binderTotals(user.id),
    db.club.findMany({ where: { players: { some: { templates: { some: { instances: { some: { ownerId: user.id } } } } } } }, orderBy: { name: "asc" } }),
  ]);
  const active = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-6">
      <ClubTabs active="cards" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">My Club</p>
          <h1 className="text-5xl font-extrabold">My Cards</h1>
        </div>
        <div className="flex gap-2 text-sm">
          <Stat label="Football" value={totals.bySport.football ?? 0} />
          <Stat label="Gold" value={totals.byCategory.GOLD} tone="text-gold" />
          <Stat label="Silver" value={totals.byCategory.SILVER} tone="text-silver" />
          <Stat label="Bronze" value={totals.byCategory.BRONZE} tone="text-bronze" />
          <Stat label="Locked" value={totals.locked} tone="text-faint" />
        </div>
      </div>

      <form className="panel grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-7" method="get">
        <input className="input lg:col-span-2" name="q" placeholder="Search player" defaultValue={sp.q} />
        <Select name="category" value={sp.category} options={[["", "All tiers"], ["GOLD", "Gold"], ["SILVER", "Silver"], ["BRONZE", "Bronze"]]} />
        <Select name="position" value={sp.position} options={[["", "All positions"], ["GK", "GK"], ["DEF", "DEF"], ["MID", "MID"], ["ATT", "ATT"]]} />
        <Select name="club" value={sp.club} options={[["", "All clubs"], ...clubs.map((c) => [c.code, c.name] as [string, string])]} />
        <Select
          name="status"
          value={sp.status}
          options={[["", "Any status"], ["available", "Available"], ["locked", "Locked / busy"], ["competition", "In a squad"], ["listed", "Listed"], ["nontradeable", "Untradeable"]]}
        />
        <div className="flex items-center gap-3 text-xs text-muted">
          <label className="flex items-center gap-1">
            <input type="checkbox" name="duplicates" value="1" defaultChecked={filters.duplicates} className="accent-lime" /> Dupes
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" name="favourites" value="1" defaultChecked={filters.favourites} className="accent-lime" /> ★
          </label>
        </div>
        <div className="flex gap-2 sm:col-span-3 lg:col-span-7">
          <button className="btn-primary">Filter</button>
          {active && (
            <Link href="/binder" className="btn-ghost">
              Clear
            </Link>
          )}
          <span className="ml-auto self-center text-xs text-faint">{cards.length} cards</span>
        </div>
      </form>

      {cards.length === 0 ? (
        <div className="panel p-10 text-center text-muted">
          {active ? "No cards match those filters." : "Your Binder is empty. Head to Packs to open your Starter Pack."}
        </div>
      ) : (
        <div className="grid grid-cols-2 justify-items-center gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {cards.map((c) => (
            <Link key={c.id} href={`/cards/${c.id}`} className="relative transition hover:-translate-y-1">
              <PlayerCard card={c} />
              {c.duplicateCount > 1 && (
                <span className="absolute -right-1 -top-1 rounded-full bg-ink-700 px-1.5 text-[10px] font-bold">×{c.duplicateCount}</span>
              )}
              {c.favourite && <span className="absolute -left-1 -top-1 text-gold">★</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "text-fg" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 px-3 py-1.5 text-center">
      <div className={`text-lg font-black ${tone}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
    </div>
  );
}

function Select({ name, value, options }: { name: string; value?: string; options: Array<[string, string]> }) {
  return (
    <select name={name} defaultValue={value ?? ""} className="input">
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
