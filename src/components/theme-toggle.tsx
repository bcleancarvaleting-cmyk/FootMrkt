"use client";

import { useState } from "react";

export type Theme = "dark" | "light";

/** Light / dark switch. Saved in a cookie so the server renders the right theme with no flash. */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  function flip() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.cookie = `collectr_theme=${next}; path=/; max-age=31536000; samesite=lax`;
  }
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={flip}
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="relative flex h-9 w-[68px] items-center rounded-full border border-ink-600 bg-ink-850 px-1 transition"
    >
      <span
        className={`absolute top-1 h-7 w-7 rounded-full bg-lime shadow transition-all ${dark ? "left-[34px]" : "left-1"}`}
        aria-hidden="true"
      />
      <span className={`relative z-10 flex w-7 justify-center ${dark ? "text-faint" : "text-ink-950"}`} aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      </span>
      <span className={`relative z-10 ml-auto flex w-7 justify-center ${dark ? "text-ink-950" : "text-faint"}`} aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" />
        </svg>
      </span>
    </button>
  );
}
