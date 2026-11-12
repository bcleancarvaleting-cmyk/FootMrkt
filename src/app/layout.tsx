import type { Metadata, Viewport } from "next";
import { after } from "next/server";
import { onVisit } from "@/server/activity";
import { Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { BottomNav } from "@/components/bottom-nav";
import { ChatDrawer } from "@/components/chat-drawer";
import { AppBackButton, AppTracker, NotifyPrompt } from "@/components/app-install";
import { TransferNewsGate } from "@/components/transfer-news-gate";
import { ErrorReporter } from "@/components/error-reporter";
import { WelcomeTourGate } from "@/components/welcome-tour-gate";
import { Logo } from "@/components/nav";
import { CHAT_ROOMS, CHAT_RULES } from "@/config/chat";
import { canModerate } from "@/server/moderation";
import { grantDueWelcomePacks } from "@/server/welcome";
import Link from "next/link";
import { Header } from "@/components/nav";
import { StatsTicker } from "@/components/stats-ticker";
import { ScoresTicker } from "@/components/scores-ticker";
import { liveBoard } from "@/server/live";
import type { Theme } from "@/components/theme-toggle";
import { getCurrentUser } from "@/server/auth/session";
import { dataCredit } from "@/config/data-credit";
import { spentToday } from "@/server/safer-play";
import { fmtGbp } from "@/server/wallet";
import { RealityCheck } from "@/components/reality-check";
import { db } from "@/server/db";
import { liveStats } from "@/server/stats";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Barlow_Condensed({ variable: "--font-display-face", subsets: ["latin"], weight: ["600", "700", "800"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: { default: "MATCHX — Collect. Trade. Compete.", template: "%s · MATCHX" },
  description: "Collect football player cards, build your squad and compete on real-world performance.",
};

export const viewport: Viewport = { themeColor: "#07080a", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme: Theme = (await cookies()).get("matchx_theme")?.value === "light" ? "light" : "dark";
  const [user, stats] = await Promise.all([getCurrentUser(), liveStats()]);
  // Pre-launch: visitors don't see the live game numbers (tiny before launch).
  const hideTicker = !user && (await (await import("@/server/launch-gate")).prelaunch());
  if (user) {
    await grantDueWelcomePacks(user.id);
    // Streak, achievements, level rewards and predictions — after the page has been sent.
    const userId = user.id;
    after(() => onVisit(userId));
  }
  const [unopened, paidToday] = user
    ? await Promise.all([db.packEntitlement.count({ where: { userId: user.id, status: "UNOPENED" } }), user.realityCheckMinutes ? spentToday(user.id) : 0])
    : [0, 0];
  return (
    <html
      lang="en-GB"
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a href="#main" className="skip-link">Skip to content</a>
        {!hideTicker && <StatsTicker initial={stats} />}
        <Header theme={theme} unopenedPacks={unopened} />
        {!hideTicker && <ScoresTicker initial={await liveBoard(user?.id ?? null)} />}
        <main id="main" tabIndex={-1} className={`mx-auto outline-none w-full max-w-6xl flex-1 px-4 pt-6 sm:px-6 ${user ? "pb-32 md:pb-16" : "pb-16"}`}>{children}</main>
        <SiteFooter loggedIn={!!user} credit={await dataCredit()} />
        {user && <BottomNav unopenedPacks={unopened} />}
        <AppBackButton />
        <ErrorReporter />
        {user && <AppTracker />}
        {user && <NotifyPrompt />}
        {user && <TransferNewsGate userId={user.id} />}
        {user && <WelcomeTourGate userId={user.id} name={user.displayName} />}
        {user && user.realityCheckMinutes > 0 && <RealityCheck minutes={user.realityCheckMinutes} spentToday={fmtGbp(paidToday)} />}
        {user && (
          <ChatDrawer
            rooms={CHAT_ROOMS.map((r) => ({ id: r.id, name: r.name }))}
            me={{ id: user.id, isMod: canModerate(user.role) }}
            maxLength={CHAT_RULES.maxLength}
          />
        )}
      </body>
    </html>
  );
}

function SiteFooter({ loggedIn, credit }: { loggedIn: boolean; credit: string }) {
  const cols: [string, [string, string][]][] = [
    ["Play", [["Packs", "/packs"], ["Transfers", "/transfers"], ["Matches", "/matches"], ["Matchday Live", "/live"], ["Top performers", "/top-performers"], ["Hall of Fame", "/hall-of-fame"], ["Clubs", "/teams"], ["How it works", "/how-it-works"], ["Guides to MATCHX", "/guides"]]],
    ["Account", [["My Club", "/account/club"], ["Challenges", "/account/challenges"], ["Wallet", "/account/wallet"], ["Profile", "/account/profile"]]],
    ["Legal", [["Terms", "/legal/terms"], ["Privacy", "/legal/privacy"], ["Responsible play", "/legal/responsible-play"], ["Risk warning", "/legal/risk"], ["Pack odds", "/odds"], ["Report a problem", "/support"]]],
  ];
  return (
    <footer className={`border-t border-ink-800 bg-ink-950 ${loggedIn ? "pb-28 md:pb-0" : ""}`}>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:px-6">
        <div className="space-y-3">
          <Logo height={20} />
          <p className="max-w-xs text-xs leading-relaxed text-faint">
            Player values go up and down. MX is an in-game valuation, not an investment. 18+ only. {credit}
          </p>
        </div>
        {cols.map(([h, links]) => (
          <div key={h}>
            <p className="eyebrow mb-3">{h}</p>
            <ul className="space-y-2 text-sm">
              {links.map(([l, href]) => (
                <li key={href}>
                  <Link href={href} className="text-muted hover:text-fg">
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}
