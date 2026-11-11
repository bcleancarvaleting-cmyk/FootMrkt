"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { logoutAction } from "@/app/actions/auth";
import { ADMIN_MENU } from "@/app/admin/admin-nav";
import { type Theme, ThemeToggle } from "./theme-toggle";

type Section = { title: string; links: Array<[label: string, href: string]> };

const MEMBER: Section[] = [
  {
    title: "Play",
    links: [
      ["Home", "/"],
      ["Matches", "/matches"],
      ["Top performers", "/top-performers"],
      ["Mini-leagues", "/leagues"],
      ["Head-to-head", "/h2h"],
      ["Hall of Fame", "/hall-of-fame"],
    ],
  },
  {
    title: "Cards & transfers",
    links: [
      ["Packs", "/packs"],
      ["Transfer list", "/transfers"],
      ["Auctions", "/transfers/auctions"],
      ["MATCHX buy now", "/transfers/drops"],
      ["My transfers", "/transfers/mine"],
      ["Watchlist", "/account/watchlist"],
      ["Challenges", "/account/challenges"],
    ],
  },
  {
    title: "Me",
    links: [
      ["Overview & invite friends", "/account"],
      ["Achievements & level", "/account/achievements"],
      ["Wallet & XP", "/account/wallet"],
      ["Notifications", "/notifications"],
      ["Manager chat", "/chat"],
    ],
  },
  {
    title: "Settings & help",
    links: [
      ["Profile", "/account/profile"],
      ["Security", "/account/security"],
      ["Safer play", "/account/safer-play"],
      ["Report a problem", "/support"],
      ["Legal", "/account/legal"],
    ],
  },
];
const GUEST: Section = {
  title: "MATCHX",
  links: [
    ["Home", "/"],
    ["How it works", "/how-it-works"],
    ["Top performers", "/top-performers"],
    ["Log in", "/login"],
  ],
};

/**
 * Phone menu: a Menu button in the header that opens a full-screen sheet with every section of the
 * site — and, for admins, every admin page — so nothing is only reachable from the desktop header.
 */
export function MobileMenu({ user, theme, unread = 0 }: { user: { name: string; isAdmin: boolean; isMod: boolean } | null; theme: Theme; unread?: number }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  // The header uses backdrop-filter, which traps fixed children — so the sheet is portalled to <body>.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Close on navigation; lock page scroll while open.
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) {
    setLastPath(path);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sections: Section[] = user
    ? [
        ...MEMBER,
        ...(user.isMod && !user.isAdmin ? [{ title: "Moderation", links: [["Chat moderation", "/moderation"]] } as Section] : []),
        ...(user.isAdmin ? ADMIN_MENU.map((g) => ({ title: `Admin · ${g.group}`, links: g.items.map((i) => [i.label, i.href] as [string, string]) })) : []),
        ...(user.isAdmin ? [{ title: "Admin · Community", links: [["Chat moderation", "/moderation"]] } as Section] : []),
      ]
    : [GUEST];
  const on = (href: string) => (href === "/" ? path === "/" : path === href);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-ink-700 bg-ink-900 text-fg md:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        {unread > 0 && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-ink-950 bg-danger" aria-label={`${unread} new notifications`} />}
      </button>
      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[60] flex flex-col bg-ink-950 md:hidden" role="dialog" aria-modal="true" aria-label="Menu" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
          <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
            <span className="min-w-0 truncate font-display text-2xl font-extrabold uppercase italic">{user ? user.name : "Menu"}</span>
            <span className="ml-auto mr-2">
              <ThemeToggle initial={theme} />
            </span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="flex h-9 w-9 items-center justify-center rounded-xl border border-ink-700 text-lg">
              ✕
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-4 pb-10 pt-2" aria-label="All pages" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 2.5rem)" }}>
            {!user && (
              <Link href="/register" className="btn-primary my-3 w-full py-3">
                Join free — get 49 players
              </Link>
            )}
            {user && (
              <div className="grid grid-cols-2 gap-2 py-3">
                <Link href="/account/club" className="btn-primary py-3">
                  My Club
                </Link>
                <Link href="/account/wallet" className="btn-gold py-3">
                  Add Funds
                </Link>
              </div>
            )}
            {sections.map((s) => {
              const here = s.links.some(([, href]) => on(href));
              return (
                <details key={s.title} open={here || (!user ? true : s.title === "Play")} className="group border-b border-ink-800">
                  <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm font-extrabold uppercase tracking-[0.14em] text-muted [&::-webkit-details-marker]:hidden">
                    {s.title}
                    <span className="text-faint transition group-open:rotate-90" aria-hidden="true">
                      ›
                    </span>
                  </summary>
                  <ul className="pb-2">
                    {s.links.map(([label, href]) => (
                      <li key={href + label}>
                        <Link href={href} aria-current={on(href) ? "page" : undefined} className={`block rounded-lg px-2 py-2 text-[15px] font-semibold ${on(href) ? "bg-accent/10 text-lime" : "text-fg"}`}>
                          {label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
            {user && (
              <form action={logoutAction} className="pt-4">
                <button className="btn-ghost w-full py-3">Log out</button>
              </form>
            )}
          </nav>
        </div>,
        document.body,
      )}
    </>
  );
}
