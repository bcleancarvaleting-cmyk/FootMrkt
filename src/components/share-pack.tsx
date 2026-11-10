"use client";

import { useState } from "react";

/**
 * After a pack opening: share the pull to the manager's own Facebook. The shared page carries their
 * referral, so anyone who joins from the post counts as a friend they invited.
 */
export function SharePack({ openingId, rewardName }: { openingId: string; rewardName: string }) {
  const [copied, setCopied] = useState(false);
  const link = () => `${window.location.origin}/share/${openingId}`;
  const share = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link())}`, "_blank", "noopener,noreferrer,width=640,height=600");
  };
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-5 text-center">
      <p className="font-semibold">Show off your pull</p>
      <p className="text-sm text-muted">
        Share it on your Facebook. Your post links to your own invite, so every friend who joins from it and plays a match gets you a free{" "}
        <b className="text-fg">{rewardName}</b>.
      </p>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <button type="button" onClick={share} className="btn-primary">
          Share to Facebook
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() =>
            navigator.clipboard
              ?.writeText(link())
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              })
              .catch(() => setCopied(false))
          }
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
