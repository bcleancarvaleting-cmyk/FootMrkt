import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "COLLECTR — Collect. Trade. Compete.", template: "%s · COLLECTR" },
  description: "Collect football player cards, build your squad and compete on real-world performance.",
};

export const viewport: Viewport = { themeColor: "#0a0b0d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 sm:px-6">{children}</main>
        <footer className="border-t border-ink-800 px-4 py-6 text-center text-xs text-faint">
          COLLECTR · Collect. Trade. Compete. · MP is an indicative valuation only — not cash, not withdrawable, and not a
          promise of resale value. · Development build: squads sourced from Wikipedia (CC BY-SA); match data is simulated; player,
          club and crest licensing pending.
        </footer>
      </body>
    </html>
  );
}
