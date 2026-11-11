import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDES, guideBySlug } from "@/config/guides";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const g = guideBySlug((await params).slug);
  return { title: g ? `${g.title} · Guides` : "Guides" };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = guideBySlug(slug);
  if (!g) notFound();
  const i = GUIDES.indexOf(g);
  const next = GUIDES[i + 1];
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <Link href="/guides" className="text-xs text-faint hover:text-fg">
          ← All guides
        </Link>
        <p className="mt-3 text-4xl" aria-hidden="true">
          {g.icon}
        </p>
        <h1 className="mt-1 text-5xl leading-none">{g.title}</h1>
        <p className="mt-2 text-muted">{g.summary}</p>
      </header>
      <ol className="space-y-3">
        {g.steps.map((s, n) => (
          <li key={s.title} className="flex gap-4 rounded-2xl border border-ink-700 bg-ink-900 p-5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent font-display text-lg font-black text-accent-ink">{n + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-xl font-bold uppercase italic leading-tight">{s.title}</span>
              <span className="mt-1 block text-sm text-muted">{s.body}</span>
              {s.href && (
                <Link href={s.href} className="mt-3 inline-block rounded-full border border-ink-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] hover:border-fg/60">
                  {s.cta ?? "Take me there"} →
                </Link>
              )}
            </span>
          </li>
        ))}
      </ol>
      {next && (
        <Link href={`/guides/${next.slug}`} className="flex items-center justify-between rounded-2xl border border-accent/40 bg-ink-900 px-5 py-4">
          <span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-faint">Next guide</span>
            <span className="font-display text-xl font-black uppercase italic">
              {next.icon} {next.title}
            </span>
          </span>
          <span className="text-lime">→</span>
        </Link>
      )}
    </div>
  );
}
