"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-render the page from the server every few seconds while something is live. */
export function AutoRefresh({ every = 30_000, when = true }: { every?: number; when?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!when) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, every);
    return () => clearInterval(t);
  }, [router, every, when]);
  return null;
}
