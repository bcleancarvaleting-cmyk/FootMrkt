"use client";

import { useEffect, useState } from "react";

type Platform = "ios" | "android" | "desktop";
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function platform(): Platform {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const report = (body: object) => fetch("/api/app", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});

/** Invisible: registers the service worker and reports installs / notification permission (signed-in pages). */
export function AppTracker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (standalone()) report({ installed: platform() });
    if ("Notification" in window) report({ notifications: Notification.permission === "granted" });
  }, []);
  return null;
}

/** "Take MatchX on the go": install steps for iPhone and Android, plus notifications. */
export function TakeItOnTheGo({ compact = false }: { compact?: boolean }) {
  const [os, setOs] = useState<Platform | null>(null);
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [notif, setNotif] = useState<NotificationPermission | "unsupported" | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setOs(platform());
      setInstalled(standalone());
      setNotif("Notification" in window ? Notification.permission : "unsupported");
    }, 0);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  async function enableNotifications() {
    if (!("Notification" in window)) return;
    const p = await Notification.requestPermission();
    setNotif(p);
    report({ notifications: p === "granted" });
  }

  return (
    <div className={`grid gap-6 rounded-2xl border border-ink-700 bg-ink-900 p-5 ${compact ? "" : "md:grid-cols-[1.1fr_1fr] sm:p-7"}`}>
      <div className="space-y-3">
        <p className="eyebrow text-lime">Take MatchX on the go</p>
        <h2 className="text-3xl leading-none">MATCHX on your home screen</h2>
        <p className="text-sm text-muted">Open your club in one tap, full screen, and get a nudge before the deadline, when free packs land and when results are in.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {installed ? (
            <span className="tag text-lime">Installed ✓</span>
          ) : prompt ? (
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                await prompt.prompt();
                const r = await prompt.userChoice;
                if (r.outcome === "accepted") report({ installed: platform() });
                setPrompt(null);
              }}
            >
              Install the app
            </button>
          ) : null}
          {notif === "granted" ? (
            <span className="tag text-lime">Notifications on ✓</span>
          ) : notif === "denied" ? (
            <span className="tag text-faint">Notifications blocked in your browser settings</span>
          ) : notif === "default" ? (
            <button type="button" className="btn-ghost" onClick={enableNotifications}>
              Turn on notifications
            </button>
          ) : null}
        </div>
      </div>
      {!installed && (
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className={`rounded-xl border p-4 ${os === "ios" ? "border-accent/60" : "border-ink-700"}`}>
            <p className="font-semibold">iPhone &amp; iPad</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted">
              <li>Open MATCHX in Safari</li>
              <li>Tap the Share button</li>
              <li>Choose <b className="text-fg">Add to Home Screen</b></li>
              <li>Open MATCHX from your home screen</li>
            </ol>
          </div>
          <div className={`rounded-xl border p-4 ${os === "android" ? "border-accent/60" : "border-ink-700"}`}>
            <p className="font-semibold">Android</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted">
              <li>Open MATCHX in Chrome</li>
              <li>Tap the ⋮ menu</li>
              <li>Choose <b className="text-fg">Install app</b> (or Add to Home screen)</li>
              <li>Open MATCHX from your home screen</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
