"use client";

import { usePathname } from "next/navigation";
import { SectionTabs } from "@/components/page-header";

export function TransfersTabs({ auctions, offers, soon }: { auctions: number; offers: number; soon?: boolean }) {
  const path = usePathname();
  return (
    <SectionTabs
      active={path}
      tabs={[
        { href: "/transfers", label: "Transfer list" },
        { href: "/transfers/auctions", label: soon ? "Auctions · Soon" : "Auctions", badge: auctions },
        { href: "/transfers/mine", label: "My transfers", badge: offers },
      ]}
    />
  );
}
