"use client";

import { useState } from "react";

/** A link shown as selectable text with a Copy button. */
export function CopyLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex w-full max-w-md items-center gap-2 sm:w-auto">
      <input readOnly value={value} className="input min-w-0 flex-1 font-mono text-xs" aria-label="Your invite link" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn-primary px-4 py-2.5 text-[11px]"
        onClick={() =>
          navigator.clipboard
            ?.writeText(value)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
            .catch(() => setCopied(false))
        }
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
