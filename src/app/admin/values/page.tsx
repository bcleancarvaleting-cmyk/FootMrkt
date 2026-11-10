import Link from "next/link";
import { ValuesImport } from "@/components/values-import";
import { ActionButton } from "@/components/action-button";
import { estimateValuesAction } from "@/app/actions/values";
import { VALUE_TIERS } from "@/config/tiers";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata = { title: "Market values" };

export default async function ValuesPage() {
  await requireAdmin();
  const [valued, total, latest] = await Promise.all([
    db.player.count({ where: { marketValueGbp: { not: null } } }),
    db.player.count({ where: { active: true } }),
    db.player.findFirst({ where: { marketValueAt: { not: null } }, orderBy: { marketValueAt: "desc" }, select: { marketValueAt: true, marketValueSource: true } }),
  ]);
  const m = (n: number) => `£${n / 1e6}m`;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-xs text-faint hover:text-fg">
          ← Admin
        </Link>
        <h1 className="mt-1 text-5xl font-extrabold">Market values</h1>
        <p className="max-w-2xl text-sm text-muted">
          Tiers follow market value: <b className="text-gold">Gold {m(VALUE_TIERS.goldFromGbp)}+</b> ·{" "}
          <b className="text-silver">
            Silver {m(VALUE_TIERS.silverFromGbp)}–{m(VALUE_TIERS.goldFromGbp)}
          </b>{" "}
          · <b className="text-bronze">Bronze under {m(VALUE_TIERS.silverFromGbp)}</b>. Cards already opened keep their tier; new releases and
          packs use the new one.
        </p>
        <p className="mt-1 text-xs text-faint">
          {valued} of {total} players have a value
          {latest?.marketValueAt ? ` · last update ${latest.marketValueAt.toISOString().slice(0, 10)} (${latest.marketValueSource})` : ""}. 
        </p>
      </div>
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="max-w-2xl text-sm text-muted">
          <b className="text-fg">MATCHX estimates.</b> Every player has an estimated value: named estimates for well-known players
          (prisma/data/value-estimates.txt) and a formula for the rest (league, club strength, squad role — never Gold on its own). Re-running
          only refreshes estimates; values you&apos;ve entered below or from a licensed feed are kept. Nothing is listed on Transfers.
        </div>
        <ActionButton action={estimateValuesAction}>Re-run estimates</ActionButton>
      </div>
      <ol className="panel list-decimal space-y-1 p-5 pl-10 text-sm text-muted">
        <li>To correct a player, type or paste lines like <b className="text-fg">Bukayo Saka, Arsenal, £120m</b> — from a licensed data feed or your own figures.</li>
        <li>Press Preview, check the tier changes, then Apply. Your values replace the estimate and are never overwritten by it.</li>
      </ol>
      <div className="panel p-5">
        <ValuesImport />
      </div>
      <p className="text-xs text-faint">
        Check the data source&apos;s terms before launch: values used commercially may need a licence.
      </p>
    </div>
  );
}
