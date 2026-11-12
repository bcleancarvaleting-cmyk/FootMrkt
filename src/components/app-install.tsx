"use client";

import { usePathname, useRouter } from "next/navigation";
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
/** Subscribe this device to push (once permission is granted and the server has push keys). */
export async function subscribePush() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || Notification.permission !== "granted") return false;
    const { key } = (await (await fetch("/api/push")).json()) as { key: string | null };
    if (!key) return false;
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=")), (c) => c.charCodeAt(0)),
      }));
    await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
    return true;
  } catch {
    return false;
  }
}

export function AppTracker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").then(() => subscribePush()).catch(() => {});
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
    if (p === "granted") await subscribePush();
  }

  return (
    <div className={`grid gap-6 rounded-2xl border border-ink-700 bg-ink-900 p-5 ${compact ? "" : "md:grid-cols-[1.1fr_1fr] sm:p-7"}`}>
      <div className="space-y-3">
        <p className="eyebrow text-lime">Take MatchX on the go</p>
        <h2 className="text-3xl leading-none">MATCHX on your home screen</h2>
        <p className="text-sm text-muted">Open your club in one tap, full screen, and get a nudge before the deadline, when free packs land and when results are in.</p>
        <p className="rounded-xl border border-accent/40 bg-accent/5 px-3 py-2 text-sm">🎁 <b>App users get special giveaways</b> — free packs and MX that web players don&apos;t.</p>
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

/** In the installed app there's no browser back button, so show one (on every page but home). */
/**
 * Back, on every page but Home: a floating round button (above the bottom bar on phones, bottom-left
 * on desktop). Goes back a step; if there's nothing to go back to on MATCHX (opened from a link or
 * a notification), it goes up to the parent page instead, e.g. /cards/123 → /account/club.
 */
const PARENT: Array<[RegExp, string]> = [
  [/^\/cards\//, "/account/club"],
  [/^\/competitions\/[^/]+\/team\//, "/matches"],
  [/^\/competitions\//, "/matches"],
  [/^\/players\//, "/top-performers"],
  [/^\/admin\/./, "/admin"],
];
function parentOf(path: string) {
  for (const [re, to] of PARENT) if (re.test(path)) return to;
  const up = path.replace(/\/[^/]+\/?$/, "");
  return up || "/";
}

// Pages visited in this tab (the button lives in the layout, so it sees every navigation).
const trail: string[] = [];

export function AppBackButton() {
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (trail[trail.length - 1] === path) return;
    if (trail[trail.length - 2] === path) trail.pop(); // went back
    else trail.push(path);
  }, [path]);
  if (path === "/" || path === "/login" || path === "/register") return null;
  const back = () => {
    if (trail.length > 1) router.back();
    else router.push(parentOf(path));
  };
  return (
    <button
      type="button"
      onClick={back}
      aria-label="Go back"
      className="fixed left-3 z-40 flex h-11 w-11 items-center justify-center gap-1 rounded-full border border-ink-600 bg-ink-900/90 text-sm font-bold text-fg shadow-[0_8px_24px_-8px_rgba(0,0,0,0.7)] backdrop-blur-md transition hover:border-fg/50 md:left-6 md:w-auto md:pl-2.5 md:pr-3.5"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + var(--back-offset, 88px))" }}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" />
      </svg>
      <span className="hidden md:inline">Back</span>
    </button>
  );
}

const ASK_KEY = "matchx-notify-asked";
/**
 * "Keep up to date with your club" — Accept | Decline. Shown once to signed-in managers whose phone
 * can take notifications (iPhone only from the installed app); Decline asks again in two weeks.
 */
export function NotifyPrompt() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (!("Notification" in window) || !("serviceWorker" in navigator) || Notification.permission !== "default") return;
        if (platform() === "ios" && !standalone()) return; // iPhone can only notify the installed app
        const asked = Number(localStorage.getItem(ASK_KEY) ?? 0);
        if (Date.now() - asked > 14 * 86_400_000) setShow(true);
      } catch {
        /* storage blocked: don't nag */
      }
    }, 2500);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  const remember = () => {
    try {
      localStorage.setItem(ASK_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setShow(false);
  };
  return (
    <div className="fixed inset-x-3 z-[65] mx-auto max-w-md rounded-2xl border border-accent/50 bg-ink-900 p-4 shadow-2xl" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)" }} role="dialog" aria-label="Notifications">
      <p className="font-display text-xl font-extrabold uppercase italic">Keep up to date with your club</p>
      <p className="mt-1 text-sm text-muted">Deadline reminders, results, auctions you&apos;ve won or lost, new players and free packs — straight to your phone.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="btn-ghost" onClick={remember}>
          Decline
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={async () => {
            const p = await Notification.requestPermission();
            report({ notifications: p === "granted" });
            if (p === "granted") await subscribePush();
            remember();
          }}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
