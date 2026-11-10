"use client";

import { usePathname } from "next/navigation";
import { SectionTabs } from "@/components/page-header";

export function TransfersTabs({ auctions, offers }: { auctions: number; offers: number }) {
  const path = usePathname();
  return (
    <SectionTabs
      active={path}
      tabs={[
        { href: "/transfers", label: "Transfer list" },
        { href: "/transfers/auctions", label: "Auctions", badge: auctions },
        { href: "/transfers/mine", label: "My transfers", badge: offers },
      ]}
    />
  );
}
