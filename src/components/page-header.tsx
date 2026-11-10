import Link from "next/link";

/** Consistent page header: eyebrow, title, one-line intro and an optional right-hand slot. */
export function PageHeader({ eyebrow, title, intro, children }: { eyebrow?: string; title: string; intro?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 text-4xl leading-none sm:text-5xl">{title}</h1>
        {intro && <p className="mt-2 max-w-2xl text-sm text-muted">{intro}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Underlined sub-navigation for a section (Transfers, My Account, …). */
export function SectionTabs({ tabs, active }: { tabs: Array<{ href: string; label: string; badge?: number }>; active: string }) {
  return (
    <nav className="-mx-4 mb-6 flex gap-6 overflow-x-auto border-b border-ink-700 px-4 [scrollbar-width:none] sm:mx-0 sm:px-0" aria-label="Section">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={active === t.href ? "page" : undefined} className={`tab ${active === t.href ? "tab-on" : ""}`}>
          {t.label}
          {t.badge ? <span className="ml-1.5 rounded bg-accent px-1.5 text-[10px] font-bold text-accent-ink">{t.badge}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/** Notice shown wherever a legal-gated feature is still switched off. */
export function GateNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-warn" aria-hidden="true" />
      <p className="text-fg">{children}</p>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-600 px-6 py-12 text-center">
      <p className="font-display text-2xl font-bold uppercase italic">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
