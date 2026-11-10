import Link from "next/link";
import { LEGAL_DOCS } from "@/config/legal";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { fmtDate } from "@/lib/view";

export const metadata = { title: "Legal" };

export default async function AccountLegalPage() {
  const user = await requireUser();
  const u = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { termsVersion: true, termsAcceptedAt: true, fundsRiskAcceptedAt: true } });
  return (
    <div className="max-w-3xl">
      <p className="eyebrow">My Account</p>
      <h1 className="mt-1 text-4xl leading-none sm:text-5xl">Legal</h1>
      <p className="mt-2 mb-6 text-sm text-muted">
        {u.termsAcceptedAt ? `You accepted the terms (version ${u.termsVersion}) on ${fmtDate(u.termsAcceptedAt, { dateStyle: "long" })}.` : "You'll be asked to accept the terms and risk warning before adding funds."}
        {u.fundsRiskAcceptedAt && ` Risk warning acknowledged ${fmtDate(u.fundsRiskAcceptedAt, { dateStyle: "long" })}.`}
      </p>
      <ul className="space-y-2">
        {LEGAL_DOCS.map((d) => (
          <li key={d.slug}>
            <Link href={`/legal/${d.slug}`} className="row-item">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{d.title}</span>
                <span className="block text-sm text-muted">{d.summary}</span>
              </span>
              <span className="text-faint">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
