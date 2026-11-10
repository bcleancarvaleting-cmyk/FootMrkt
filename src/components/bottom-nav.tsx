"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; match: string[]; icon: React.ReactNode; badge?: number };

const I = {
  packs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M5 8h14M9 3v5M15 3v5" />
    </svg>
  ),
  transfers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4Z" />
    </svg>
  ),
  matches: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8.5" />
      <path d="m12 7.5 3.6 2.6-1.4 4.2H9.8l-1.4-4.2Z" fill="currentColor" stroke="none" />
    </svg>
  ),
  account: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" strokeLinecap="round" />
    </svg>
  ),
};

export const NAV_ITEMS = (unopenedPacks = 0): Item[] => [
  { href: "/packs", label: "Packs", match: ["/packs"], icon: I.packs, badge: unopenedPacks || undefined },
  { href: "/transfers", label: "Transfers", match: ["/transfers", "/cards"], icon: I.transfers },
  { href: "/", label: "Home", match: [], icon: I.home },
  { href: "/matches", label: "Matches", match: ["/matches", "/competitions", "/players"], icon: I.matches },
  { href: "/account", label: "My Account", match: ["/account", "/admin", "/moderation"], icon: I.account },
];

export function isActive(path: string, it: Item) {
  return it.href === "/" ? path === "/" : it.match.some((m) => path === m || path.startsWith(m + "/"));
}

/** Mobile bottom menu: Packs · Transfers · Home (raised centre) · Matches · My Account. */
export function BottomNav({ unopenedPacks }: { unopenedPacks: number }) {
  const path = usePathname();
  const items = NAV_ITEMS(unopenedPacks);
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700/80 backdrop-blur-xl md:hidden"
      style={{ background: "var(--dock-bg)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5 items-end px-1 pb-1.5 pt-1">
        {items.map((it, i) => {
          const on = isActive(path, it);
          if (i === 2) {
            return (
              <li key={it.href} className="flex justify-center">
                <Link href={it.href} aria-current={on ? "page" : undefined} className="-mt-5 flex flex-col items-center gap-1 text-[11px] font-semibold">
                  <span
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-ink shadow-[0_8px_24px_-8px_rgb(173_252_7/0.6)] ring-4 ${
                      on ? "ring-accent/30" : "ring-ink-950"
                    }`}
                  >
                    <span className="h-6 w-6">{it.icon}</span>
                  </span>
                  <span className={on ? "text-fg" : "text-muted"}>{it.label}</span>
                </Link>
              </li>
            );
          }
          return (
            <li key={it.href} className="flex justify-center">
              <Link
                href={it.href}
                aria-current={on ? "page" : undefined}
                className={`relative flex flex-col items-center gap-1 px-1 py-1.5 text-[11px] font-semibold transition ${on ? "text-fg" : "text-muted"}`}
              >
                <span className={`h-6 w-6 ${on ? "text-lime" : ""}`}>{it.icon}</span>
                {it.label}
                {on && <span className="absolute -top-1 h-0.5 w-6 rounded-full bg-accent" aria-hidden="true" />}
                {it.badge ? (
                  <span className="absolute -top-0.5 right-0 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white">{it.badge}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Desktop navigation in the header. */
export function TopNav({ unopenedPacks }: { unopenedPacks: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
      {NAV_ITEMS(unopenedPacks).map((it) => {
        const on = isActive(path, it);
        return (
          <Link key={it.href} href={it.href} aria-current={on ? "page" : undefined} className={`tab ${on ? "tab-on" : ""} pb-1`}>
            {it.label}
            {it.badge ? <span className="ml-1.5 rounded bg-danger px-1.5 text-[10px] font-bold text-white">{it.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
