import Link from "next/link";
import { RestartTourButton } from "@/components/welcome-tour";
import { GUIDES, WHATS_NEW } from "@/config/guides";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "Guides to MATCHX" };

export default async function GuidesPage() {
  const user = await getCurrentUser();
  return (
    <div className="space-y-10">
      <header>
        <p className="eyebrow text-lime">Help &amp; how-tos</p>
        <h1 className="mt-1 text-5xl leading-none">Guides to MATCHX</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">Quick guides to every part of the game. New features are added to What&apos;s new below as they arrive.</p>
        {user && (
          <div className="mt-4">
            <RestartTourButton />
          </div>
        )}
      </header>

      <section>
        <h2 className="mb-3 text-3xl">What&apos;s new</h2>
        <ul className="space-y-2">
          {WHATS_NEW.map((n) => (
            <li key={n.title}>
              <Link href={n.href ?? "/guides"} className="flex items-start gap-3 rounded-2xl border border-ink-700 bg-ink-900 px-4 py-3 transition hover:border-ink-600">
                <span className="mt-0.5 shrink-0 rounded-full bg-accent px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-accent-ink">New</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{n.title}</span>
                  <span className="block text-sm text-muted">{n.body}</span>
                </span>
                <span className="shrink-0 text-[11px] text-faint">{new Date(n.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-3xl">Guides</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link href={`/guides/${g.slug}`} className="flex h-full flex-col rounded-2xl border border-ink-700 bg-ink-900 p-5 transition hover:-translate-y-0.5 hover:border-accent/50">
                <span className="text-3xl" aria-hidden="true">
                  {g.icon}
                </span>
                <span className="mt-2 font-display text-2xl font-black uppercase italic leading-none">{g.title}</span>
                <span className="mt-1 flex-1 text-sm text-muted">{g.summary}</span>
                <span className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-lime">Read · {g.steps.length} steps →</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
