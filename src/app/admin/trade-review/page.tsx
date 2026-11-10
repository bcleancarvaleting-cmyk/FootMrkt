import Link from "next/link";
import { resolveFlagAction } from "@/app/actions/review";
import { ActionButton } from "@/components/action-button";
import { fmtDate } from "@/lib/view";
import { db } from "@/server/db";
import { openFlags, REASON_LABEL } from "@/server/market-safety";
import { getSetting } from "@/server/settings";
import { fmtMp } from "@/server/wallet";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Trade review" };

export default async function TradeReview() {
  const [flags, newDays, multiple, recent] = await Promise.all([
    openFlags(),
    getSetting("newTraderDays"),
    getSetting("highPriceMultiple"),
    db.tradeFlag.findMany({ where: { status: { not: "OPEN" } }, orderBy: { reviewedAt: "desc" }, take: 10 }),
  ]);
  const age = (days: number) => (days < 1 ? "joined today" : `${days}d old`);
  return (
    <>
      <AdminTitle
        title="Trade review"
        intro="Transfer-list sales that look like money moving between linked accounts. The trade has gone through; clear it, or suspend the accounts involved."
      />
      <section className="panel space-y-1 p-5 text-sm text-muted">
        <p>
          <b className="text-fg">Rules in force:</b> new accounts wait {newDays} day{newDays === 1 ? "" : "s"} and must confirm their email before trading · sellers confirm prices {multiple}× the guide or more ·
          sales at {multiple * 2}× the guide, repeat trades between the same pair, big trades by week-old accounts and buyer/seller on the same network are held here.
        </p>
        <p>
          Change the numbers in <Link href="/admin/settings" className="text-lime underline">Settings &amp; flags</Link>.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-2xl">To review ({flags.length})</h2>
        {flags.length === 0 ? (
          <p className="text-sm text-faint">Nothing to review.</p>
        ) : (
          <ul className="space-y-3">
            {flags.map((f) => (
              <li key={f.id} className="panel space-y-3 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">
                    {f.card ? `${f.card.template.player.displayName} · ${f.card.template.category.toLowerCase()} #${f.card.serial}` : "Card"} · {fmtMp(f.priceMinor)}
                  </p>
                  <span className="text-xs text-faint">{fmtDate(f.createdAt)}</span>
                </div>
                <p className="text-sm">
                  <Link href={`/admin/users?q=${encodeURIComponent(f.seller.displayName)}`} className="text-lime underline">{f.seller.displayName}</Link> <span className="text-faint">({age(f.sellerAgeDays)})</span> sold to{" "}
                  <Link href={`/admin/users?q=${encodeURIComponent(f.buyer.displayName)}`} className="text-lime underline">{f.buyer.displayName}</Link> <span className="text-faint">({age(f.buyerAgeDays)})</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {f.reasons.map((r) => (
                    <span key={r} className="rounded-full border border-warn/40 bg-warn/10 px-2.5 py-1 text-xs font-semibold">
                      {REASON_LABEL[r] ?? r}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-muted">{f.detail}</p>
                <div className="flex flex-wrap gap-2">
                  <ActionButton action={resolveFlagAction.bind(null, f.id, "CLEARED", [])} className="btn-ghost px-4 py-2 text-xs">
                    Looks fine — clear
                  </ActionButton>
                  <ActionButton action={resolveFlagAction.bind(null, f.id, "ACTIONED", ["seller"])} className="btn-ghost px-4 py-2 text-xs text-danger" confirm={`Suspend ${f.seller.displayName}?`}>
                    Suspend seller
                  </ActionButton>
                  <ActionButton action={resolveFlagAction.bind(null, f.id, "ACTIONED", ["buyer"])} className="btn-ghost px-4 py-2 text-xs text-danger" confirm={`Suspend ${f.buyer.displayName}?`}>
                    Suspend buyer
                  </ActionButton>
                  <ActionButton action={resolveFlagAction.bind(null, f.id, "ACTIONED", ["seller", "buyer"])} className="btn-ghost px-4 py-2 text-xs text-danger" confirm="Suspend both accounts?">
                    Suspend both
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="mb-3 text-2xl">Recently reviewed</h2>
          <ul className="divide-y divide-ink-700 rounded-2xl border border-ink-700 bg-ink-900 text-sm">
            {recent.map((f) => (
              <li key={f.id} className="flex justify-between gap-3 px-4 py-2.5">
                <span>
                  {f.reasons.map((r) => REASON_LABEL[r] ?? r).join(" · ")} · {fmtMp(f.priceMinor)}
                </span>
                <span className="text-xs font-bold uppercase text-faint">{f.status.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
