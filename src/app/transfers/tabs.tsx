"use client";

import { usePathname } from "next/navigation";
import { SectionTabs } from "@/components/page-header";

export function TransfersTabs({ drops, offers }: { drops: number; offers: number }) {
  const path = usePathname();
  return (
    <SectionTabs
      active={path}
      tabs={[
        { href: "/transfers", label: "Transfer list" },
        { href: "/transfers/drops", label: "Player drops", badge: drops },
        { href: "/transfers/mine", label: "My transfers", badge: offers },
      ]}
    />
  );
}
