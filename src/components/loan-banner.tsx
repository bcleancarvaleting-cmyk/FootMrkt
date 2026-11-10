import Link from "next/link";
import { db } from "@/server/db";
import { endedLoans } from "@/server/loans";

/** Flashing prompt while a manager still has loan players whose loan has ended. */
export async function EndedLoansBanner({ userId, href = "/account/club" }: { userId: string; href?: string }) {
  const ids = await endedLoans(userId);
  if (!ids.length) return null;
  const cards = await db.cardInstance.findMany({ where: { id: { in: ids } }, select: { template: { select: { player: { select: { displayName: true } } } } } });
  const names = cards.map((c) => c.template.player.displayName);
  return (
    <Link href={href} className="loan-ended mb-5 flex items-center gap-3 rounded-2xl border bg-ink-900 px-4 py-3">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-danger" aria-hidden="true" />
      <span className="flex-1 text-sm">
        <b>Loan over:</b> {names.join(" and ")} {names.length > 1 ? "have" : "has"} played their last gameweek for you.
      </span>
      <span className="text-sm font-bold text-danger">Discard loan player{names.length > 1 ? "s" : ""} →</span>
    </Link>
  );
}
