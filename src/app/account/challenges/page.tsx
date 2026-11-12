import Link from "next/link";
import { CompleteSetButton } from "@/components/complete-set-button";
import { EmptyState } from "@/components/page-header";
import { CategoryDot } from "@/components/player-card";
import { FOOTBALL_PACKS } from "@/config/packs";
import { requireUser } from "@/server/auth/session";
import { challengeBoard, ensureDefaultChallenges } from "@/server/challenges";
import { setProgress } from "@/server/collections";
import { ownedSetProgress } from "@/server/owned-sets";
import { db } from "@/server/db";
import { ActionButton } from "@/components/action-button";
import { claimOwnedSetAction } from "@/app/actions/owned-sets";
import { fmtMp } from "@/server/wallet";

export const metadata = { title: "Challenges" };

const packName = (code: string | null) => (code ? FOOTBALL_PACKS.find((p) => p.code === code)?.name ?? "Pack" : null);

export default async function ChallengesPage({ searchParams }: { searchParams: Promise<{ completed?: string }> }) {
  const user = await requireUser();
  const { completed } = await searchParams;
  await ensureDefaultChallenges();
  const [challenges, sets, keepSets] = await Promise.all([challengeBoard(user.id), setProgress(user.id), ownedSetProgress(user.id)]);
  const keepShown = keepSets.slice(0, 12);
  const missingIds = [...new Set(keepShown.filter((x) => !x.complete).flatMap((x) => x.missing.slice(0, 6)))];
  const missingNames = new Map((await db.player.findMany({ where: { id: { in: missingIds } }, select: { id: true, displayName: true } })).map((p) => [p.id, p.displayName]));
  // Started sets first (closest to complete on top), then other non-binder sets; untouched binders are counted, not listed.
  const progress = (x: (typeof sets)[number]) => x.requirements.filter((r) => r.satisfied).length / Math.max(1, x.requirements.length);
  const started = sets.filter((x) => x.requirements.some((r) => r.owned > 0)).sort((a, b) => progress(b) - progress(a));
  const others = sets.filter((x) => !started.includes(x) && !x.set.code.startsWith("binder-"));
  const shown = [...started, ...others];
  const rest = sets.length - shown.length;
  return (
    <div className="space-y-10">
      <section>
        <div className="mb-5">
          <p className="eyebrow">Keep your squad moving</p>
          <h1 className="mt-1 text-4xl leading-none sm:text-5xl">Challenges</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Hand in cards you don&apos;t need for £ credit or packs. Cards you hand in go back into the packs for someone else to pull. Rewards are bonus credit — spend it on packs and match entries.
          </p>
        </div>
        {completed && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4">
            <p className="font-semibold">{completed.slice(0, 60)} complete — reward added.</p>
            <Link href="/packs" className="btn-primary px-4 py-2 text-xs">Spend it on packs</Link>
          </div>
        )}
        {challenges.length === 0 ? (
          <EmptyState title="No challenges live">New challenges drop regularly — check back soon.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {challenges.map((c) => {
              const ready = c.eligible >= c.criteria.count && !c.maxed;
              return (
                <li key={c.id} className={`row-item flex-wrap sm:flex-nowrap ${ready ? "border-l-4 border-l-accent" : ""}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-xl font-bold uppercase italic leading-tight">{c.name}</span>
                    <span className="block text-sm text-muted">{c.description}</span>
                    <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{c.summary}</span>
                  </span>
                  <span className="w-28 shrink-0 text-right">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Reward</span>
                    <span className="font-bold text-lime">
                      {[c.rewardMinor > 0 ? fmtMp(c.rewardMinor) : null, packName(c.rewardPackSku)].filter(Boolean).join(" + ")}
                    </span>
                  </span>
                  <span className="w-28 shrink-0 text-right text-xs text-muted">
                    {c.eligible}/{c.criteria.count} eligible
                    {c.maxPerUser !== null && <span className="block text-faint">{c.completed}/{c.maxPerUser} done</span>}
                  </span>
                  <span className="w-28 shrink-0 text-right">
                    {c.maxed ? (
                      <span className="tag text-faint">Maxed</span>
                    ) : (
                      <Link href={`/account/challenges/${c.id}`} className={ready ? "btn-primary px-4 py-2 text-[11px]" : "btn-ghost px-4 py-2 text-[11px]"}>
                        {ready ? "Choose cards" : "View"}
                      </Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-3xl">Collect &amp; keep</h2>
        <p className="mb-4 text-sm text-muted">
          Own a card of every player in a set at the same time and claim a one-off reward plus a badge on your club page — and you <b className="text-fg">keep the cards</b>. Any tier or copy
          counts, including free cards; loans don&apos;t.
        </p>
        <ul className="grid gap-2 md:grid-cols-2">
          {keepShown.map((x) => (
            <li key={x.code} className={`row-item min-w-0 flex-col items-stretch gap-2 overflow-hidden ${x.complete && !x.claimed ? "border-l-4 border-l-accent" : ""}`}>
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{x.name}</span>
                  <span className="block truncate text-xs text-muted">{x.description}</span>
                </span>
                <span className="text-sm font-bold tabular-nums">
                  {x.have}/{x.total}
                </span>
                <span className="w-28 text-right">
                  {x.claimed ? (
                    <span className="text-xs font-bold text-lime">✓ Claimed</span>
                  ) : x.complete ? (
                    <ActionButton action={claimOwnedSetAction.bind(null, x.code)} className="btn-primary px-3 py-1.5 text-[11px]">
                      Claim £{x.rewardMinor / 100}
                    </ActionButton>
                  ) : (
                    <span className="text-xs text-faint">£{x.rewardMinor / 100} reward</span>
                  )}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-ink-700">
                <div className="h-full bg-accent" style={{ width: `${(x.have / x.total) * 100}%` }} />
              </div>
              {!x.complete && (
                <p className="truncate text-xs text-faint">
                  Still need: {x.missing.slice(0, 6).map((id) => missingNames.get(id)).filter(Boolean).join(", ")}
                  {x.missing.length > 6 ? ` +${x.missing.length - 6} more` : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
        {keepSets.length > keepShown.length && <p className="mt-2 text-xs text-faint">Showing your 12 closest · {keepSets.length - keepShown.length} more started</p>}
      </section>

      {sets.length > 0 && (
        <section>
          <h2 className="mb-1 text-3xl">Binders &amp; sets</h2>
          <p className="mb-4 text-sm text-muted">
            Every club has a 5-player binder. Collect them all to earn 10 earned credit. Any copy counts, free and untradeable cards included (free copies are used first). Cards that are listed or in a squad don&apos;t count.
          </p>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-faint">
            Showing {shown.length} you&apos;ve started{rest > 0 ? ` · ${rest} more to find` : ""}
          </p>
          <ul className="space-y-2">
            {shown.map(({ set, requirements, complete }) => {
              const have = requirements.filter((r) => r.satisfied).length;
              return (
                <li key={set.id} className={`row-item min-w-0 flex-col items-stretch gap-2 overflow-hidden ${complete ? "border-l-4 border-l-accent" : ""}`}>
                  <div className="flex items-center gap-4">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{set.name}</span>
                      <span className="block text-xs text-muted">{set.description}</span>
                    </span>
                    <span className="w-16 text-right text-sm font-bold tabular-nums">{have}/{requirements.length}</span>
                    <span className="w-32 text-right">
                      {complete ? <CompleteSetButton setId={set.id} setName={set.name} cardCount={requirements.reduce((s, r) => s + r.requirement.quantity, 0)} /> : <span className="text-xs text-faint">£10 reward</span>}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-ink-700">
                    <div className="h-full bg-accent" style={{ width: `${(have / Math.max(1, requirements.length)) * 100}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {requirements.map(({ requirement: r, satisfied }) => (
                      <span key={r.id} className={`flex items-center gap-1.5 ${satisfied ? "text-fg" : "text-faint"}`}>
                        <CategoryDot category={r.template.category} />
                        {r.template.player.displayName}
                        {satisfied && <span className="text-lime">✓</span>}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
