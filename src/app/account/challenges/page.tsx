import Link from "next/link";
import { CompleteSetButton } from "@/components/complete-set-button";
import { EmptyState } from "@/components/page-header";
import { CategoryDot } from "@/components/player-card";
import { FOOTBALL_PACKS } from "@/config/packs";
import { requireUser } from "@/server/auth/session";
import { challengeBoard, ensureDefaultChallenges } from "@/server/challenges";
import { setProgress } from "@/server/collections";
import { fmtMp } from "@/server/wallet";

export const metadata = { title: "Challenges" };

const packName = (code: string | null) => (code ? FOOTBALL_PACKS.find((p) => p.code === code)?.name ?? "Pack" : null);

export default async function ChallengesPage({ searchParams }: { searchParams: Promise<{ completed?: string }> }) {
  const user = await requireUser();
  const { completed } = await searchParams;
  await ensureDefaultChallenges();
  const [challenges, sets] = await Promise.all([challengeBoard(user.id), setProgress(user.id)]);
  return (
    <div className="space-y-10">
      <section>
        <div className="mb-5">
          <p className="eyebrow">Keep your squad moving</p>
          <h1 className="mt-1 text-4xl leading-none sm:text-5xl">Challenges</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Hand in cards you don&apos;t need for MX or packs. Cards you hand in go back into the packs for someone else to pull. Rewards are bonus MX — spend it on packs and match entries.
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

      {sets.length > 0 && (
        <section>
          <h2 className="mb-1 text-3xl">Collection sets</h2>
          <p className="mb-4 text-sm text-muted">Collect every player in a set and complete it for 10 MX. Starter cards and cards that are listed or in a squad don&apos;t count.</p>
          <ul className="space-y-2">
            {sets.map(({ set, requirements, complete }) => {
              const have = requirements.filter((r) => r.satisfied).length;
              return (
                <li key={set.id} className={`row-item flex-col items-stretch gap-2 ${complete ? "border-l-4 border-l-accent" : ""}`}>
                  <div className="flex items-center gap-4">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{set.name}</span>
                      <span className="block text-xs text-muted">{set.description}</span>
                    </span>
                    <span className="w-16 text-right text-sm font-bold tabular-nums">{have}/{requirements.length}</span>
                    <span className="w-32 text-right">
                      {complete ? <CompleteSetButton setId={set.id} setName={set.name} cardCount={requirements.reduce((s, r) => s + r.requirement.quantity, 0)} /> : <span className="text-xs text-faint">10 MX reward</span>}
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
