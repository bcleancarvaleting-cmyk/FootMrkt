"use client";

import { useState } from "react";

/** After a pack opening: share the pull to Facebook (pick our group in the share box) and open the group. */
export function SharePack({ openingId, groupUrl }: { openingId: string; groupUrl: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/share/${openingId}`;
  const share = () => {
    const link = `${window.location.origin}/share/${openingId}`;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, "_blank", "noopener,noreferrer,width=640,height=600");
  };
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-5 text-center">
      <p className="font-semibold">Show off your pull</p>
      <p className="text-sm text-muted">
        Share it to the MATCHX Facebook group: tap Share, then choose <b className="text-fg">Share to a group</b> and pick our group.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={share} className="btn-primary">
          Share on Facebook
        </button>
        {groupUrl && (
          <a href={groupUrl} target="_blank" rel="noreferrer" className="btn-ghost">
            Open our group
          </a>
        )}
        <button
          type="button"
          className="btn-ghost"
          onClick={() =>
            navigator.clipboard
              ?.writeText(url || `${window.location.origin}/share/${openingId}`)
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
