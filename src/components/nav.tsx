import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/server/auth/session";
import { balancesFor, fmtMp } from "@/server/wallet";
import { TopNav } from "./bottom-nav";
import { type Theme, ThemeToggle } from "./theme-toggle";

export function Logo({ height = 26 }: { height?: number }) {
  const width = Math.round((height * 2049) / 347);
  return (
    <span className="relative inline-flex" style={{ height, width }}>
      <Image src="/brand/matchx-dark.png" alt="MATCHX" width={width} height={height} priority className="logo-dark h-full w-auto" />
      <Image src="/brand/matchx-light.png" alt="MATCHX" width={width} height={height} priority className="logo-light h-full w-auto" />
    </span>
  );
}

export async function Header({ theme, unopenedPacks }: { theme: Theme; unopenedPacks: number }) {
  const user = await getCurrentUser();
  const bal = user ? await balancesFor(user.id) : null;
  return (
    <header
      className="sticky z-30 border-b border-ink-800 bg-ink-950/90 backdrop-blur-xl"
      style={{ top: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="MATCHX home" className="shrink-0">
          <Logo />
        </Link>
        {user && <TopNav unopenedPacks={unopenedPacks} />}
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle initial={theme} />
          {user && bal ? (
            <>
              <Link
                href="/account/wallet"
                className="flex items-center gap-2 whitespace-nowrap rounded-xl border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm font-bold tabular-nums hover:border-ink-600"
                title="Your MP balance"
              >
                <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                {fmtMp(bal.total)}
              </Link>
              <Link
                href="/account"
                className="hidden h-9 w-9 items-center justify-center rounded-full bg-ink-800 font-display text-base font-extrabold uppercase text-fg ring-1 ring-ink-600 sm:flex"
                aria-label={`${user.displayName} — My Account`}
              >
                {user.displayName.slice(0, 1)}
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost px-4 py-2 text-xs">
                Log in
              </Link>
              <Link href="/register" className="btn-primary px-4 py-2 text-xs">
                Join free
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
