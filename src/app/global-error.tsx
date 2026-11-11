"use client";

import { useEffect } from "react";
import { sendClientError } from "@/components/error-reporter";

/** Last-resort error screen (the whole layout failed). Plain HTML, reported like any other error. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    sendClientError({ message: error.message || "App error", digest: error.digest, stack: error.stack });
  }, [error]);
  return (
    <html lang="en">
      <body style={{ background: "#060708", color: "#f4f5f2", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ opacity: 0.7, fontSize: 14 }}>We&apos;ve been told automatically and will fix it. Your club, cards and MX are safe.</p>
          <button type="button" onClick={reset} style={{ marginTop: 16, background: "#adfc07", color: "#0b0e0c", border: 0, borderRadius: 12, padding: "12px 24px", fontWeight: 700, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
