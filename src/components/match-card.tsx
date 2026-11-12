import Link from "next/link";
import { FOOTBALL_PACKS } from "@/config/packs";
import { potTotal } from "@/domain/football/prizes";
import { type Requirements, prizesSummary, requirementsSummary } from "@/server/competitions";
import { fmtMp } from "@/server/wallet";
import { FoundingBadge } from "./founding-badge";
import { SimBadge } from "./sim-badge";

/**
 * A match as a card: title, which cards it takes, cost to enter, prize pot and teams entered, then
 * the manager's status and the action. Green border = entered, red = open and not entered yet.
 */
const STATUS: Record<string, [string, string]> = {
  UPCOMING: ["Opens soon", "text-muted"],
  OPEN: ["Open", "text-lime"],
  LOCKED: ["Locked", "text-warn"],
  PROVISIONAL: ["Live", "text-danger"],
  SETTLED: ["Final", "text-faint"],
  CANCELLED: ["Cancelled", "text-faint"],
};

type Comp = { id: string; name: string; status: string; format: string; requirements: unknown; rewards: unknown; entryFeeMinor: number; _count: { entries: number } };
type Entry = { finalPoints: number | null; provisionalPoints: number | null; rank: number | null } | undefined;
type Podium = Array<{ rank: number; displayName: string; foundingNumber: number | null; points: number; prizeMinor: number }>;

export function MatchCard({ c, entry, paidEntry, results, sim = false }: { c: Comp; entry: Entry; paidEntry: boolean; results?: Podium; sim?: boolean }) {
  const [label, tone] = STATUS[c.status] ?? ["", ""];
  const feeBlocked = c.entryFeeMinor > 0 && !paidEntry;
  const cards = cardsLabel((c.requirements ?? {}) as Requirements, c.format);
  const pot = prizeLabel(c.rewards);
  const state = entry ? "entered" : c.status === "OPEN" ? "open" : "closed";
  return (
    <Link
      href={`/competitions/${c.id}`}
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-ink-900 transition hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)] ${state === "entered" ? "border-mint/70" : state === "open" ? "border-danger/60" : "border-ink-700"}`}
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${cards.bar}`} aria-hidden="true" />
      <span className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
        <span className="min-w-0">
          {sim && <SimBadge className="mb-1.5" />}
          <span className="block font-display text-2xl font-black uppercase italic leading-[0.95] tracking-tight">{c.name}</span>
          <span className="mt-1 block text-xs text-muted">{requirementsSummary((c.requirements ?? {}) as Requirements, c.format)}</span>
        </span>
        <span className={`shrink-0 rounded-full border border-current/30 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] ${tone}`}>{label}</span>
      </span>
      <span className="mx-5 grid grid-cols-2 overflow-hidden rounded-xl border border-ink-700 bg-ink-850">
        <Stat label="Cards">
          <span className={`flex items-center gap-1.5 ${cards.text}`}>
            <span className={`h-2 w-2 rounded-full ${cards.dot}`} aria-hidden="true" />
            {cards.label}
          </span>
        </Stat>
        <Stat label="Entry">{c.entryFeeMinor > 0 ? fmtMp(c.entryFeeMinor) : <span className="text-lime">Free</span>}</Stat>
        <Stat label="Prize pot">
          <span className={pot.cash ? "text-gold" : ""}>{pot.label}</span>
        </Stat>
        <Stat label="Teams">{c._count.entries.toLocaleString("en-GB")}</Stat>
      </span>
      {pot.detail && <span className="mx-5 mt-2 block text-[11px] text-muted">{pot.detail}</span>}
      {(results?.length ?? 0) > 0 && (
        <span className="mx-5 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {results!.map((p, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className={`font-extrabold ${p.rank === 1 ? "text-gold" : p.rank === 2 ? "text-silver" : "text-bronze"}`}>{p.rank === 1 ? "1st" : p.rank === 2 ? "2nd" : "3rd"}</span>
              <span className="font-semibold text-fg">{p.displayName}</span>
              <FoundingBadge number={p.foundingNumber} compact />
              <span className="text-muted">{p.points} pts</span>
              {p.prizeMinor > 0 && <span className="font-bold text-lime">£{(p.prizeMinor / 100).toFixed(2)}</span>}
            </span>
          ))}
        </span>
      )}
      <span className="mt-auto flex items-center justify-between gap-3 px-5 pb-5 pt-4">
        {entry ? (
          entry.finalPoints !== null ? (
            <b className="text-lime">{entry.finalPoints} pts · finished #{entry.rank}</b>
          ) : entry.provisionalPoints !== null ? (
            <b className="text-mint">{entry.provisionalPoints} pts live</b>
          ) : (
            <span className="font-semibold text-mint">✓ You&apos;re in{c.status === "OPEN" ? " · tap to edit" : ""}</span>
          )
        ) : c.status === "OPEN" ? (
          feeBlocked ? <span className="text-sm text-faint">Paid entry coming soon</span> : <span className="text-sm text-muted">Pick 7 + bench before the deadline</span>
        ) : (
          <span className="text-sm text-muted">See the leaderboard</span>
        )}
        <span className={`shrink-0 ${entry || c.status !== "OPEN" || feeBlocked ? "btn-ghost" : "btn-primary"} px-4 py-2 text-[11px]`}>
          {entry ? (c.status === "OPEN" ? "Edit squad" : "View") : c.status === "OPEN" && !feeBlocked ? "Pick squad" : "Leaderboard"}
        </span>
      </span>
    </Link>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="min-w-0 border-ink-700 px-3 py-2.5 [&:nth-child(odd)]:border-r [&:nth-child(-n+2)]:border-b">
      <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-faint">{label}</span>
      <span className="mt-0.5 block truncate text-sm font-bold tabular-nums">{children}</span>
    </span>
  );
}

const TIER_STYLE = {
  BRONZE: { bar: "bg-bronze", dot: "bg-bronze", text: "text-bronze" },
  SILVER: { bar: "bg-silver", dot: "bg-silver", text: "text-silver" },
  GOLD: { bar: "bg-gold", dot: "bg-gold", text: "text-gold" },
} as const;

/** Which cards a match takes: "Bronze", "Gold", "Free cards", "Free draft" or "Any cards". */
export function cardsLabel(r: Requirements, format: string) {
  const tier = (format !== "OPEN" ? format.split("_")[0] : r.tiers?.length === 1 ? r.tiers[0] : null) as keyof typeof TIER_STYLE | null;
  if (r.draftBudgetMx) return { label: "Free draft", bar: "bg-accent", dot: "bg-accent", text: "text-lime" };
  if (tier && TIER_STYLE[tier]) return { label: tier[0] + tier.slice(1).toLowerCase(), ...TIER_STYLE[tier] };
  if (r.tiers?.length) return { label: r.tiers.map((t) => t[0] + t.slice(1).toLowerCase()).join(" / "), bar: "bg-ink-600", dot: "bg-fg", text: "" };
  if (r.freeCardsOnly) return { label: "Free cards", bar: "bg-mint", dot: "bg-mint", text: "text-mint" };
  return { label: "Any cards", bar: "bg-ink-600", dot: "bg-fg", text: "" };
}

/** The headline prize: a £ pot, else the pack(s) on offer. */
export function prizeLabel(rewards: unknown) {
  const all = (rewards as Array<{ rankFrom: number; rankTo: number; cashMinor?: number; packSkuCode?: string }>) ?? [];
  const cash = all.filter((r) => r.cashMinor);
  const detail = prizesSummary(rewards).replace(/^£[\d.]+ pot · /, "");
  if (cash.length) {
    const t = potTotal(cash as never);
    return { label: `£${(t / 100).toFixed(t % 100 ? 2 : 0)}`, cash: true, detail };
  }
  const packs = all.filter((r) => r.packSkuCode);
  if (packs.length) {
    const name = (code: string) => FOOTBALL_PACKS.find((p) => p.code === code)?.name ?? "Pack";
    return { label: name(packs[0].packSkuCode!), cash: false, detail: packs.map((p) => `${p.rankFrom === p.rankTo ? `#${p.rankFrom}` : p.rankTo > 100_000 ? "Everyone" : `#${p.rankFrom}–${p.rankTo}`}: ${name(p.packSkuCode!)}`).join(" · ") };
  }
  return { label: "XP", cash: false, detail: "" };
}
