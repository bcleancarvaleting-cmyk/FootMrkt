import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { BottomNav } from "@/components/bottom-nav";
import { Header } from "@/components/nav";
import { StatsTicker } from "@/components/stats-ticker";
import type { Theme } from "@/components/theme-toggle";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { liveStats } from "@/server/stats";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Barlow_Condensed({ variable: "--font-display-face", subsets: ["latin"], weight: ["600", "700", "800"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: { default: "COLLECTR — Collect. Trade. Compete.", template: "%s · COLLECTR" },
  description: "Collect football player cards, build your squad and compete on real-world performance.",
};

export const viewport: Viewport = { themeColor: "#07080a", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme: Theme = (await cookies()).get("collectr_theme")?.value === "light" ? "light" : "dark";
  const [user, stats] = await Promise.all([getCurrentUser(), liveStats()]);
  const unopened = user ? await db.packEntitlement.count({ where: { userId: user.id, status: "UNOPENED" } }) : 0;
  return (
    <html
      lang="en-GB"
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <StatsTicker initial={stats} />
        <Header theme={theme} />
        <main className={`mx-auto w-full max-w-6xl flex-1 px-4 pt-6 sm:px-6 ${user ? "pb-36" : "pb-16"}`}>{children}</main>
        <footer className={`border-t border-ink-800 px-4 py-6 text-center text-xs text-faint ${user ? "mb-24" : ""}`}>
          COLLECTR · Collect. Trade. Compete. · MP is an indicative valuation only — not cash, not withdrawable, and not a
          promise of resale value. · Development build: squads sourced from Wikipedia (CC BY-SA); match data is simulated; player,
          club and crest licensing pending.
        </footer>
        {user && <BottomNav unopenedPacks={unopened} />}
      </body>
    </html>
  );
}
