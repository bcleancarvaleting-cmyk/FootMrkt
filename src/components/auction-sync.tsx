"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps the auctions page live: top bids and end times refresh by themselves — every few seconds
 * when an auction is in its last 90 seconds (when a late bid can put 30 seconds back on the
 * clock), otherwise every 20 seconds.
 */
export function AuctionSync({ endsAt }: { endsAt: string[] }) {
  const router = useRouter();
  const key = endsAt.join(",");
  useEffect(() => {
    const ends = key ? key.split(",").map((e) => new Date(e).getTime()) : [];
    const soonest = () => Math.min(Infinity, ...ends.map((e) => e - Date.now()).filter((ms) => ms > -15_000));
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
      t = setTimeout(tick, soonest() <= 90_000 ? 3_000 : 20_000);
    };
    t = setTimeout(tick, soonest() <= 90_000 ? 3_000 : 20_000);
    return () => clearTimeout(t);
  }, [key, router]);
  return null;
}
