import Link from "next/link";

/** My Club sections: the Binder, Sets, and Transfers. */
export function ClubTabs({ active }: { active: "cards" | "sets" | "transfers" }) {
  const tabs = [
    { id: "cards", href: "/binder", label: "My Cards" },
    { id: "sets", href: "/collections", label: "Sets" },
    { id: "transfers", href: "/market", label: "Transfers" },
  ] as const;
  return (
    <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={active === t.id ? "page" : undefined}
          className={`shrink-0 rounded-full border px-5 py-2 text-xs font-extrabold uppercase tracking-[0.16em] transition ${
            active === t.id ? "border-danger bg-danger text-white shadow-[0_8px_24px_-10px_var(--color-danger)]" : "border-ink-600 text-fg hover:bg-ink-800"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
