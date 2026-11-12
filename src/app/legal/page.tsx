import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { LEGAL_DOCS, LEGAL_UPDATED } from "@/config/legal";

export const metadata = { title: "Legal" };

/** Public: every legal document, readable without an account. */
export default function LegalIndex() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Legal" title="Terms & policies" intro={`The rules for playing MATCHX and how we handle your data. Last updated ${LEGAL_UPDATED}.`} />
      <ul className="grid gap-2 sm:grid-cols-2">
        {LEGAL_DOCS.map((d) => (
          <li key={d.slug}>
            <Link href={`/legal/${d.slug}`} className="panel flex items-center justify-between gap-3 p-4 hover:border-accent/60">
              <b>{d.title}</b>
              <span className="text-lime">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
