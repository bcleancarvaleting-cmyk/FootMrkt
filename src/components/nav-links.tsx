"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: Array<{ href: string; label: string; badge?: number }> }) {
  const path = usePathname();
  return (
    <nav className="-mx-1 flex flex-1 gap-1 overflow-x-auto text-sm [scrollbar-width:none]">
      {links.map((l) => {
        const active = path === l.href || path.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`relative whitespace-nowrap rounded-lg px-3 py-1.5 transition ${
              active ? "bg-ink-800 text-lime" : "text-muted hover:text-fg"
            }`}
          >
            {l.label}
            {l.badge ? (
              <span className="ml-1.5 rounded-full bg-lime px-1.5 text-[10px] font-bold text-ink-950">{l.badge}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
