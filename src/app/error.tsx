"use client";

import Link from "next/link";
import { useEffect } from "react";
import { sendClientError } from "@/components/error-reporter";

/** Something broke on a page: tell the player kindly, and tell us (Admin → Errors). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    sendClientError({ message: error.message || "Page error", digest: error.digest, stack: error.stack });
  }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <p className="text-5xl" aria-hidden="true">
        🤕
      </p>
      <h1 className="text-4xl leading-none">Something went wrong</h1>
      <p className="text-sm text-muted">Sorry — that page hit a problem. We&apos;ve been told automatically and will fix it. Your club, cards and MX are safe.</p>
      <div className="flex gap-2">
        <button type="button" onClick={reset} className="btn-primary px-6">
          Try again
        </button>
        <Link href="/" className="btn-ghost px-6">
          Home
        </Link>
      </div>
      {error.digest && <p className="text-[10px] text-faint">Ref {error.digest}</p>}
    </div>
  );
}
