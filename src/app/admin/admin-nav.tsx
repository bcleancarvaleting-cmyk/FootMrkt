"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export const ADMIN_MENU: Array<{ group: string; items: Array<{ href: string; label: string }> }> = [
  { group: "Overview", items: [{ href: "/admin", label: "Dashboard" }, { href: "/admin/users", label: "Users" }, { href: "/admin/app", label: "App & notifications" }] },
  {
    group: "Game",
    items: [
      { href: "/admin/matches", label: "Matches & gameweeks" },
      { href: "/admin/prizes", label: "Prize fund" },
      { href: "/admin/challenges", label: "Challenges & binders" },
    ],
  },
  {
    group: "Cards",
    items: [
      { href: "/admin/gifts", label: "Gifts & free packs" },
      { href: "/admin/packs", label: "Packs & supply" },
      { href: "/admin/players", label: "Player database & drops" },
      { href: "/admin/transfers", label: "Transfer listings" },
      { href: "/admin/values", label: "Player values" },
    ],
  },
  {
    group: "People",
    items: [
      { href: "/admin/community", label: "Founders & moderators" },
      { href: "/admin/withdrawals", label: "Withdrawals" },
    ],
  },
  { group: "System", items: [{ href: "/admin/settings", label: "Settings & flags" }] },
];

export function AdminNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const all = ADMIN_MENU.flatMap((g) => g.items);
  const current = [...all].sort((a, b) => b.href.length - a.href.length).find((i) => path === i.href || path.startsWith(i.href + "/")) ?? all[0];
  const list = (
    <nav aria-label="Admin" className="space-y-5">
      {ADMIN_MENU.map((g) => (
        <div key={g.group}>
          <p className="eyebrow mb-1.5 px-3">{g.group}</p>
          <ul className="space-y-0.5">
            {g.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  onClick={() => setOpen(false)}
                  aria-current={i.href === current.href ? "page" : undefined}
                  className={`block rounded-lg px-3 py-2 text-sm font-semibold transition ${i.href === current.href ? "bg-accent text-accent-ink" : "text-muted hover:bg-ink-800 hover:text-fg"}`}
                >
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
  return (
    <>
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center justify-between rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-left"
        >
          <span>
            <span className="eyebrow block">Admin</span>
            <span className="font-semibold">{current.label}</span>
          </span>
          <span className={`text-muted transition ${open ? "rotate-180" : ""}`} aria-hidden="true">
            ▾
          </span>
        </button>
        {open && <div className="mt-2 rounded-xl border border-ink-700 bg-ink-900 p-3">{list}</div>}
      </div>
      <aside className="hidden lg:block">
        <div className="sticky top-24">{list}</div>
      </aside>
    </>
  );
}
