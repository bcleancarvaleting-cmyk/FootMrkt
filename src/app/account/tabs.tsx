"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { SectionTabs } from "@/components/page-header";

const TABS = [
  { href: "/account", label: "Overview" },
  { href: "/account/club", label: "My Club" },
  { href: "/account/challenges", label: "Challenges" },
  { href: "/account/achievements", label: "Achievements" },
  { href: "/account/watchlist", label: "Watchlist" },
  { href: "/account/wallet", label: "Wallet" },
  { href: "/account/safer-play", label: "Safer play" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/security", label: "Security" },
  { href: "/account/legal", label: "Legal" },
];

export function AccountTabs() {
  const path = usePathname();
  const current = TABS.filter((t) => path === t.href || path.startsWith(`${t.href}/`)).at(-1)?.href ?? "/account";
  // Highlight the tab you tapped straight away, not when the next page has finished loading.
  // (Remembered with the page it was tapped on, so it clears itself once the new page arrives.)
  const [tapped, setTapped] = useState<{ href: string; on: string } | null>(null);
  return (
    <div
      onClickCapture={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        const href = a?.getAttribute("href");
        if (href && TABS.some((t) => t.href === href)) setTapped({ href, on: path });
      }}
    >
      <SectionTabs tabs={TABS} active={tapped && tapped.on === path ? tapped.href : current} />
    </div>
  );
}
