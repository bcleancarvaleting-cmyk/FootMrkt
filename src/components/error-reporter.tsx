"use client";

import { useEffect } from "react";

/** Sends an error from this browser to the server (best effort, never throws). */
export function sendClientError(e: { message: string; digest?: string; stack?: string }) {
  try {
    const body = JSON.stringify({ message: e.message, digest: e.digest, stack: e.stack, path: location.pathname });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/client-error", new Blob([body], { type: "application/json" }));
    else void fetch("/api/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  } catch {
    /* never let reporting break the page */
  }
}

/** Reports errors that don't crash the page (failed scripts, unhandled promise errors). */
export function ErrorReporter() {
  useEffect(() => {
    const seen = new Set<string>();
    const report = (message: string, stack?: string) => {
      if (!message || seen.has(message) || seen.size > 20) return;
      // Browser-extension and cross-origin noise isn't ours to fix.
      if (/^Script error\.?$|extension:\/\/|ResizeObserver loop/i.test(message)) return;
      seen.add(message);
      sendClientError({ message, stack });
    };
    const onError = (ev: ErrorEvent) => report(ev.message, ev.error instanceof Error ? ev.error.stack : undefined);
    const onRejection = (ev: PromiseRejectionEvent) => report(ev.reason instanceof Error ? ev.reason.message : String(ev.reason), ev.reason instanceof Error ? ev.reason.stack : undefined);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
