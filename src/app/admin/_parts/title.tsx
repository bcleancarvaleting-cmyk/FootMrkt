export function AdminTitle({ title, intro, children }: { title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-4xl leading-none">{title}</h1>
        {intro && <p className="mt-2 max-w-2xl text-sm text-muted">{intro}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
