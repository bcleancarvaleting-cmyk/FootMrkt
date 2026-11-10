/** "Founding member" mark shown next to a manager's name. `compact` shows just the icon. */
export function FoundingBadge({ number, compact = false, className = "" }: { number: number | null | undefined; compact?: boolean; className?: string }) {
  if (!number) return null;
  const label = `Founding member #${number}`;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 align-middle ${className}`} title={label} aria-label={label}>
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M8 .8 10 2.3l2.4-.2.7 2.3 2 1.4-.8 2.3.8 2.3-2 1.4-.7 2.3-2.4-.2L8 15.2 6 13.7l-2.4.2-.7-2.3-2-1.4.8-2.3-.8-2.3 2-1.4.7-2.3 2.4.2Z" fill="var(--color-accent)" />
        <path d="m5.2 8.1 1.9 1.9 3.7-3.9" fill="none" stroke="var(--color-accent-ink)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && <span className="whitespace-nowrap text-[10px] font-extrabold uppercase tracking-[0.12em] text-lime">Founding member</span>}
    </span>
  );
}
