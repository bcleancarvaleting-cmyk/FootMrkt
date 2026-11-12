import Link from "next/link";
import { ClubCrest } from "@/components/club-crest";
import { CardRow, RowStat, Sparkline } from "@/components/card-row";
import { discardLoanAction } from "@/app/actions/account";
import { ActionButton } from "@/components/action-button";
import { EndedLoansBanner } from "@/components/loan-banner";
import { EmptyState } from "@/components/page-header";
import { requireUser } from "@/server/auth/session";
import { type BinderFilters, binder, binderTotals, portfolio } from "@/server/binder";
import { POSITION_LABEL, type Pos, fmtDate } from "@/lib/view";

export const metadata = { title: "My Club" };

type SP = Record<string, string | undefined>;
const POS: Pos[] = ["GK", "DEF", "MID", "ATT"];
const TIER_RANK = { GOLD: 0, SILVER: 1, BRONZE: 2 } as const;

function qs(sp: SP, patch: SP) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
  return `/account/club${p.size ? `?${p}` : ""}`;
}

export default async function MyClubPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters: BinderFilters = {
    category: (["BRONZE", "SILVER", "GOLD"] as const).find((c) => c === sp.tier),
    q: sp.q?.slice(0, 40) || undefined,
    status: (["available", "listed", "competition", "nontradeable"] as const).find((s) => s === sp.status),
    duplicates: sp.dupes === "1",
  };
  const [cards, totals, pf] = await Promise.all([binder(user.id, filters), binderTotals(user.id), portfolio(user.id)]);
  const groups = POS.map((p) => ({
    pos: p,
    cards: cards
      .filter((c) => c.position === p)
      .sort((a, b) => TIER_RANK[a.category] - TIER_RANK[b.category] || (b.valueMp ?? 0) - (a.valueMp ?? 0) || a.name.localeCompare(b.name)),
  })).filter((g) => g.cards.length);
  const squadValue = cards.reduce((s, c) => s + (c.valueMp ?? 0), 0);

  return (
    <div>
      <EndedLoansBanner userId={user.id} />
      {!user.crest && (
        <Link href="/account/club/crest" className="drop-glow mb-5 flex items-center gap-3 rounded-2xl border border-accent/60 bg-ink-900 px-4 py-3">
          <span className="flex-1 text-sm">
            <b>Create your club:</b> give it a name and design your own crest.
          </span>
          <span className="text-sm font-bold text-lime">Design crest →</span>
        </Link>
      )}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          {user.crest && (
            <Link href="/account/club/crest" title="Edit club name & crest" className="shrink-0">
              <ClubCrest crest={user.crest} id="myclub" size={64} title={user.clubName ?? "Club crest"} />
            </Link>
          )}
          <div className="min-w-0">
          <p className="eyebrow">Squad</p>
          <h1 className="mt-1 text-4xl leading-none sm:text-5xl">{user.clubName ?? "My Club"}</h1>
          <p className="mt-2 text-sm text-muted">
            {totals.total} cards · <span className="text-gold">{totals.byCategory.GOLD} Gold</span> · <span className="text-silver">{totals.byCategory.SILVER} Silver</span> ·{" "}
            <span className="text-bronze">{totals.byCategory.BRONZE} Bronze</span>
            {(filters.category || filters.q || filters.status || filters.duplicates) && (
              <>
                {" "}
                · showing <b className="text-fg">£{squadValue.toFixed(2)}</b>
              </>
            )}
          </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/clubs/${encodeURIComponent(user.displayName)}`} className="btn-ghost px-4 py-2 text-xs">Public page</Link>
          <Link href="/account/club/crest" className="btn-ghost px-4 py-2 text-xs">{user.crest ? "Edit crest" : "Create crest"}</Link>
          <Link href="/account/challenges" className="btn-ghost px-4 py-2 text-xs">Challenges</Link>
          <Link href="/packs" className="btn-primary px-4 py-2 text-xs">Open packs</Link>
        </div>
      </div>

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="relative col-span-2 overflow-hidden rounded-2xl border border-accent/40 bg-ink-900 p-5">
          <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
          <p className="eyebrow text-lime">Portfolio value</p>
          <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-1">
            <span className="font-display text-5xl font-black tabular-nums leading-none">£{pf.value.toFixed(2)}</span>
            {pf.changePct !== null && (
              <span className={`mb-1 text-sm font-bold tabular-nums ${pf.changePct > 0 ? "text-mint" : pf.changePct < 0 ? "text-danger" : "text-faint"}`}>
                {pf.changePct > 0 ? "▲" : pf.changePct < 0 ? "▼" : "–"} {Math.abs(pf.changePct)}%
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            at today&apos;s prices <span className="text-faint">· your £ balance is spend-only and can&apos;t be withdrawn</span>
          </p>
          <div className="mt-3">{pf.series.length > 1 ? <Sparkline points={pf.series} width={280} height={44} /> : <span className="text-xs text-faint">The graph fills in as the market revalues your players.</span>}</div>
        </div>
        <Tile label="Playing in the next 7 days" value={`${pf.playingSoon} player${pf.playingSoon === 1 ? "" : "s"}`} sub={pf.firstKick ? `First kick-off ${fmtDate(pf.firstKick, { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : "No fixtures this week"} href="/matches" tone="text-lime" />
        <Tile label="Most valuable" value={pf.top ? `£${(pf.top.valueMp ?? 0).toFixed(2)}` : "—"} sub={pf.top ? `${pf.top.name}${pf.top.finish ? ` · ${pf.top.finish.toLowerCase()}` : ""}` : "Open a pack to start"} href={pf.top ? `/cards/${pf.top.id}` : "/packs"} tone="text-gold" />
        <Tile label="Points for you" value={`${pf.points.toLocaleString("en-GB")} pts`} sub="Scored by your players in matches" href="/account/achievements" />
        <Tile label="Specials" value={`${pf.finishes.RAINBOW + pf.finishes.DIAMOND + pf.finishes.RUBY}`} sub={`Rainbow ${pf.finishes.RAINBOW} · Diamond ${pf.finishes.DIAMOND} · Ruby ${pf.finishes.RUBY}`} href="/account/club" tone="rainbow-name" />
        <Tile label="In your squads" value={`${pf.inSquads} card${pf.inSquads === 1 ? "" : "s"}`} sub={pf.listed ? `${pf.listed} listed on Transfers` : "None listed"} href="/transfers/mine" />
        <Tile label="Build your club" value="Sell · buy · upgrade" sub="Sell players to fund better ones" href="/transfers" tone="text-lime" />
      </section>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <form action="/account/club" className="min-w-0 flex-1 basis-56">
          {Object.entries(sp).filter(([k, v]) => k !== "q" && v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input name="q" defaultValue={sp.q} placeholder="Search your players" className="input" />
        </form>
        {(["GOLD", "SILVER", "BRONZE"] as const).map((t) => (
          <Link key={t} href={qs(sp, { tier: sp.tier === t ? undefined : t })} className={`chip ${sp.tier === t ? "border-accent text-fg" : ""}`}>
            {t[0] + t.slice(1).toLowerCase()}
          </Link>
        ))}
        <span className="mx-1 w-px self-stretch bg-ink-700" />
        {[
          ["available", "Available"],
          ["listed", "Listed"],
          ["competition", "In a squad"],
          ["nontradeable", "Untradeable"],
        ].map(([k, l]) => (
          <Link key={k} href={qs(sp, { status: sp.status === k ? undefined : k })} className={`chip ${sp.status === k ? "border-accent text-fg" : ""}`}>
            {l}
          </Link>
        ))}
        <Link href={qs(sp, { dupes: sp.dupes ? undefined : "1" })} className={`chip ${sp.dupes ? "border-accent text-fg" : ""}`}>Duplicates</Link>
      </div>

      {groups.length === 0 ? (
        <EmptyState title={Object.values(filters).some(Boolean) ? "No matches" : "No players yet"} action={<Link href="/packs" className="btn-primary">Go to Packs</Link>}>
          {Object.values(filters).some(Boolean) ? "No cards match those filters." : "Open your free starter packs to sign your first 32 players."}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.pos}>
              <h2 className="mb-2 flex items-baseline gap-2 text-xl">
                {POSITION_LABEL[g.pos]}s <span className="font-sans text-xs font-semibold not-italic text-faint">{g.cards.length}</span>
              </h2>
              <ul className="space-y-1.5">
                {g.cards.map((c) => (
                  <CardRow
                    key={c.id}
                    card={c}
                    href={`/cards/${c.id}`}
                    showValue
                    sub={c.duplicateCount > 1 ? <span className="rounded bg-ink-700 px-1.5 text-[10px] font-bold text-fg">×{c.duplicateCount}</span> : undefined}
                  >
                    <RowStat label="Points for you" className="hidden w-24 sm:block">
                      <span className="text-lime">{c.pointsForYou ?? 0}</span>
                    </RowStat>
                    <RowStat label="Acquired" className="hidden w-24 lg:block">
                      <span className="text-sm font-semibold">{c.acquired ?? "—"}</span>
                    </RowStat>
                    <span className="shrink-0 text-right sm:w-24">
                      {c.loan?.ended && c.lock === "NONE" ? (
                        <ActionButton action={discardLoanAction.bind(null, c.id)} className="btn-ghost border-danger px-3 py-1.5 text-[11px] text-danger" confirm={`Discard ${c.name}? Their loan has ended and they go back to their club.`}>
                          Discard loan player
                        </ActionButton>
                      ) : c.lock === "LISTED" ? (
                        <span className="tag border-accent/50 text-lime">Listed</span>
                      ) : c.lock === "COMPETITION" ? (
                        <span className="tag text-warn">In squad</span>
                      ) : !c.tradeable ? (
                        <span className="tag text-faint">Locked</span>
                      ) : (
                        <Link href={`/cards/${c.id}#sell`} className="btn-ghost px-3 py-1.5 text-[11px]">Sell</Link>
                      )}
                    </span>
                  </CardRow>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, sub, href, tone = "" }: { label: string; value: string; sub: string; href: string; tone?: string }) {
  return (
    <Link href={href} className="min-w-0 rounded-2xl border border-ink-700 bg-ink-900 p-4 transition hover:border-ink-600 hover:bg-ink-850">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{label}</p>
      <p className={`mt-1 truncate font-display text-2xl font-black uppercase italic leading-none ${tone}`}>{value}</p>
      <p className="mt-1 truncate text-xs text-muted">{sub}</p>
    </Link>
  );
}
