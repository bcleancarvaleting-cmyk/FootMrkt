import Link from "next/link";
import { ValuesImport } from "@/components/values-import";
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
          {latest?.marketValueAt ? ` · last update ${latest.marketValueAt.toISOString().slice(0, 10)} (${latest.marketValueSource})` : ""}. Players without a value use
          the shirt-number rule.
        </p>
      </div>
      <ol className="panel list-decimal space-y-1 p-5 pl-10 text-sm text-muted">
        <li>
          Open the market-value list with your filters (<b className="text-fg">Divisions: Top flight</b> ·{" "}
          <b className="text-fg">Playing for a club in: England</b>).
        </li>
        <li>Select the results table, copy it, and paste it below. Paste several pages one after another if the list is split.</li>
        <li>Press Preview, check the tier changes, then Apply.</li>
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
