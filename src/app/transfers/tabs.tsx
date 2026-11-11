"use client";

import { usePathname } from "next/navigation";
import { SectionTabs } from "@/components/page-header";

export function TransfersTabs({ drops, offers, auctions, basket }: { drops: number; offers: number; auctions: number; basket: number }) {
  const path = usePathname();
  return (
    <SectionTabs
      active={path}
      tabs={[
        { href: "/transfers", label: "Transfer list" },
        { href: "/transfers/drops", label: "MATCHX buy now", badge: drops },
        { href: "/transfers/auctions", label: "Auctions", badge: auctions },
        { href: "/transfers/movers", label: "Market movers" },
        { href: "/transfers/basket", label: "Basket", badge: basket },
        { href: "/transfers/mine", label: "My transfers", badge: offers },
      ]}
    />
  );
}
