"use client";

import { usePathname } from "next/navigation";
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
  { href: "/account/legal", label: "Legal" },
];

export function AccountTabs() {
  const path = usePathname();
  const active = TABS.filter((t) => path === t.href || path.startsWith(`${t.href}/`)).at(-1)?.href ?? "/account";
  return <SectionTabs tabs={TABS} active={active} />;
}
