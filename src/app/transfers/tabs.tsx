"use client";

import { usePathname } from "next/navigation";
import { SectionTabs } from "@/components/page-header";

export function TransfersTabs({ drops, offers, auctions }: { drops: number; offers: number; auctions: number }) {
  const path = usePathname();
  return (
    <SectionTabs
      active={path}
      tabs={[
        { href: "/transfers", label: "Transfer list" },
        { href: "/transfers/drops", label: "MATCHX buy now", badge: drops },
        { href: "/transfers/auctions", label: "Auctions", badge: auctions },
        { href: "/transfers/mine", label: "My transfers", badge: offers },
      ]}
    />
  );
}
