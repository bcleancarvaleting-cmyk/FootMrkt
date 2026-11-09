import { CompleteSetButton } from "@/components/complete-set-button";
import { CategoryDot } from "@/components/player-card";
import { requireUser } from "@/server/auth/session";
import { setProgress } from "@/server/collections";
import { db } from "@/server/db";
import { fmtDate } from "@/lib/view";

export const metadata = { title: "Collections" };

export default async function CollectionsPage() {
  const user = await requireUser();
  const [sets, done] = await Promise.all([
    setProgress(user.id),
    db.collectionCompletion.findMany({ where: { userId: user.id }, include: { set: true }, orderBy: { completedAt: "desc" } }),
  ]);
  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Binder sets</p>
        <h1 className="text-3xl font-black">Collections</h1>
        <p className="max-w-2xl text-sm text-muted">
          Collect every card in a set, then complete it. Completing a set uses up the cards in it — they leave your Binder for good.
          Starter cards and cards that are listed or in a squad don&apos;t count.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {sets.map(({ set, requirements, complete }) => {
          const have = requirements.filter((r) => r.satisfied).length;
          const reward = set.reward as { packSkuCode?: string } | null;
          return (
            <div key={set.id} className={`panel p-5 ${complete ? "border-lime/50" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold">{set.name}</h2>
                  <p className="text-xs text-muted">{set.description}</p>
                </div>
                <span className={`text-sm font-black ${complete ? "text-lime" : "text-faint"}`}>
                  {have}/{requirements.length}
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-700">
                <div className="h-full bg-lime" style={{ width: `${(have / Math.max(1, requirements.length)) * 100}%` }} />
              </div>
              <ul className="mt-4 space-y-1.5 text-sm">
                {requirements.map(({ requirement: r, owned, usable, satisfied }) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <span className={satisfied ? "text-lime" : "text-faint"}>{satisfied ? "✓" : "○"}</span>
                    <CategoryDot category={r.template.category} />
                    <span className={satisfied ? "" : "text-muted"}>{r.template.player.displayName}</span>
                    <span className="text-xs text-faint">
                      {r.template.player.position} · {r.template.player.club?.shortName}
                    </span>
                    {owned > usable && <span className="ml-auto text-[11px] text-warn">owned but busy</span>}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-faint">{reward?.packSkuCode ? `Reward: ${reward.packSkuCode.replace("football-", "")} pack` : "Reward to be confirmed"}</span>
                {complete && <CompleteSetButton setId={set.id} setName={set.name} cardCount={requirements.reduce((s, r) => s + r.requirement.quantity, 0)} />}
              </div>
            </div>
          );
        })}
        {!sets.length && <p className="text-muted">No collections are live right now.</p>}
      </div>
      {done.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Completed</h2>
          <ul className="panel divide-y divide-ink-700 text-sm">
            {done.map((d) => (
              <li key={d.id} className="flex justify-between px-4 py-2">
                <span>{d.set.name}</span>
                <span className="text-faint">{fmtDate(d.completedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
