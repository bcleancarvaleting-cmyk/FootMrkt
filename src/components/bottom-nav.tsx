"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; match: string[]; icon: React.ReactNode; badge?: number };

const I = {
  packs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M5 8h14M9 3v5M15 3v5" />
    </svg>
  ),
  club: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
      <path d="M8 3 4 5.5 2.5 10l3 1.2V21h13v-9.8l3-1.2L20 5.5 16 3a4 4 0 0 1-8 0Z" />
    </svg>
  ),
  games: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="9" />
      <path d="m12 7 4 3-1.5 4.5h-5L8 10Z" fill="currentColor" stroke="none" />
      <path d="M12 3v4M21 10l-5 0M16.5 19.5 14.5 14.5M7.5 19.5l2-5M3 10h5" strokeWidth="1.4" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
      <path d="M4 5h16v11H9l-5 4Z" />
      <path d="M8 9.5h8M8 12.5h5" strokeLinecap="round" />
    </svg>
  ),
  me: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" strokeLinecap="round" />
    </svg>
  ),
};

/** App-style bottom dock: Packs · My Club · Games (raised centre) · Chat · Me. */
export function BottomNav({ unopenedPacks }: { unopenedPacks: number }) {
  const path = usePathname();
  const items: Item[] = [
    { href: "/packs", label: "Packs", match: ["/packs"], icon: I.packs, badge: unopenedPacks || undefined },
    { href: "/binder", label: "My Club", match: ["/binder", "/collections", "/market", "/cards"], icon: I.club },
    { href: "/football", label: "Games", match: ["/football", "/competitions", "/players"], icon: I.games },
    { href: "/chat", label: "Chat", match: ["/chat"], icon: I.chat },
    { href: "/profile", label: "Me", match: ["/profile", "/admin"], icon: I.me },
  ];
  const active = (it: Item) => it.match.some((m) => path === m || path.startsWith(m + "/"));

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700/80 backdrop-blur-xl"
      style={{ background: "var(--dock-bg)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5 items-end px-2 pb-2 pt-1.5">
        {items.map((it, i) => {
          const on = active(it);
          if (i === 2) {
            return (
              <li key={it.href} className="flex justify-center">
                <Link
                  href={it.href}
                  aria-current={on ? "page" : undefined}
                  className={`-mt-6 flex w-[84px] flex-col items-center gap-1 rounded-3xl border px-2 pb-2 pt-2.5 text-[11px] font-bold transition ${
                    on ? "border-lime/70 bg-ink-850 text-fg" : "border-ink-600 bg-ink-850 text-fg hover:border-lime/50"
                  }`}
                  style={{ boxShadow: "0 10px 30px -12px rgb(0 0 0 / 0.6)" }}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-lime text-ink-950 shadow-[0_6px_20px_-6px_var(--color-lime)]">
                    <span className="h-6 w-6">{it.icon}</span>
                  </span>
                  {it.label}
                </Link>
              </li>
            );
          }
          return (
            <li key={it.href} className="flex justify-center">
              <Link
                href={it.href}
                aria-current={on ? "page" : undefined}
                className={`relative flex flex-col items-center gap-1 rounded-2xl px-2 py-1.5 text-[11px] font-semibold transition ${
                  on ? "text-fg" : "text-muted hover:text-fg"
                }`}
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full border transition ${
                    on ? "border-gold bg-gold/10 text-gold shadow-[0_0_18px_-4px_var(--color-gold)]" : "border-ink-600 bg-ink-850"
                  }`}
                >
                  <span className="h-5 w-5">{it.icon}</span>
                </span>
                {it.label}
                {on && <span className="absolute -bottom-0.5 h-0.5 w-6 rounded-full bg-gold" aria-hidden="true" />}
                {it.badge ? (
                  <span className="absolute right-0 top-0 min-w-5 rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-5 text-white">
                    {it.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
