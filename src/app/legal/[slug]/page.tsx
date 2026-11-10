import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL_DOCS, LEGAL_UPDATED } from "@/config/legal";

export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = LEGAL_DOCS.find((d) => d.slug === slug);
  return { title: doc?.title ?? "Legal" };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = LEGAL_DOCS.find((d) => d.slug === slug);
  if (!doc) notFound();
  return (
    <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
      <nav className="hidden lg:block" aria-label="Legal">
        <p className="eyebrow mb-3">Legal</p>
        <ul className="space-y-2 text-sm">
          {LEGAL_DOCS.map((d) => (
            <li key={d.slug}>
              <Link href={`/legal/${d.slug}`} className={d.slug === slug ? "font-semibold text-fg" : "text-muted hover:text-fg"}>{d.title}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <article className="max-w-2xl">
        <p className="eyebrow">Legal · updated {LEGAL_UPDATED}</p>
        <h1 className="mt-1 text-4xl leading-none sm:text-5xl">{doc.title}</h1>
        <p className="mt-3 text-muted">{doc.summary}</p>
        <p className="mt-4 rounded-xl border border-ink-600 px-3 py-2 text-xs text-faint">Draft for the friends-and-family test. Final wording will be reviewed by our solicitors before real-money features open.</p>
        <div className="mt-8 space-y-7">
          {doc.sections.map(([h, ps], i) => (
            <section key={h}>
              <h2 className="text-2xl">{i + 1}. {h}</h2>
              {ps.map((p) => (
                <p key={p.slice(0, 24)} className="mt-2 leading-relaxed text-muted">{p}</p>
              ))}
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
