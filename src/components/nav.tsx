import Image from "next/image";
import { unreadCount } from "@/server/notifications";
import Link from "next/link";
import { getCurrentUser } from "@/server/auth/session";
import { isEnabled } from "@/server/flags";
import { db } from "@/server/db";
import { balancesFor, cashableMx, fmtMp } from "@/server/wallet";
import { canModerate } from "@/server/moderation";
import { TopNav } from "./bottom-nav";
import { MobileMenu } from "./mobile-menu";
import { ClubCrest } from "./club-crest";
import { FoundingBadge } from "./founding-badge";
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
  const [bal, beta, unread, basket] = await Promise.all([
    user ? balancesFor(user.id) : null,
    isEnabled("BETA"),
    user ? unreadCount(user.id) : 0,
    user ? db.basketItem.count({ where: { userId: user.id } }) : 0,
  ]);
  const cashable = user ? await cashableMx(user.id) : 0;
  return (
    <header
      className="sticky z-30 border-b border-ink-800 bg-ink-950/90 backdrop-blur-xl"
      style={{ top: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-8 sm:px-6">
        <Link href="/" aria-label="MATCHX home" className="flex shrink-0 items-center gap-2">
          <Logo />
          {beta && <span className="hidden rounded-md border border-accent/60 px-1.5 py-0.5 sm:inline text-[10px] font-extrabold uppercase tracking-[0.16em] text-lime">Beta</span>}
        </Link>
        {user && <TopNav unopenedPacks={unopenedPacks} />}
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden md:block">
            <ThemeToggle initial={theme} />
          </span>
          {user && bal ? (
            <>
              <Link
                href="/notifications"
                className="relative hidden h-9 w-9 items-center justify-center rounded-xl border border-ink-700 bg-ink-900 text-fg hover:border-ink-600 md:flex"
                aria-label={unread ? `${unread} new notifications` : "Notifications"}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15Z" />
                  <path d="M10 20a2 2 0 0 0 4 0" />
                </svg>
                {unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>}
              </Link>
              <Link
                href="/account/wallet"
                className="flex items-center gap-2 whitespace-nowrap rounded-xl border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm font-bold tabular-nums hover:border-ink-600"
                title="Your MX balance"
              >
                <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                {fmtMp(bal.total)}
              </Link>
              <Link
                href="/transfers/basket"
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-ink-700 bg-ink-900 text-fg hover:border-ink-600"
                aria-label={basket ? `Basket: ${basket} player${basket > 1 ? "s" : ""}` : "Basket"}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 9h18l-2 11H5L3 9Z" />
                  <path d="M8 9l4-6 4 6" />
                </svg>
                {basket > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-4 text-accent-ink">{basket > 9 ? "9+" : basket}</span>}
              </Link>
              <Link
                href="/account"
                className="relative hidden h-9 w-9 items-center justify-center rounded-full bg-ink-800 font-display text-base font-extrabold uppercase text-fg ring-1 ring-ink-600 sm:flex"
                aria-label={`${user.displayName} — My Account`}
              >
                {user.crest ? <ClubCrest crest={user.crest} id="header" size={28} title={user.clubName ?? "Club crest"} /> : user.displayName.slice(0, 1)}
                {user.foundingNumber && <FoundingBadge number={user.foundingNumber} compact className="absolute -bottom-1 -right-1" />}
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost whitespace-nowrap px-2.5 py-2 text-[11px] sm:px-4 sm:text-xs">
                Log in
              </Link>
              <Link href="/register" className="btn-primary whitespace-nowrap px-2.5 py-2 text-[11px] sm:px-4 sm:text-xs">
                Join free
              </Link>
            </>
          )}
          <MobileMenu
            theme={theme}
            unread={unread}
            user={user ? { name: user.displayName, isAdmin: user.role === "ADMIN", isMod: canModerate(user.role) } : null}
            wallet={bal ? { mx: fmtMp(bal.total), earned: fmtMp(bal.earned), cashable: fmtMp(cashable), gbp: `£${(bal.withdrawable / 100).toFixed(2)}`, xp: bal.xp.toLocaleString("en-GB"), basket } : null}
          />
        </div>
      </div>
    </header>
  );
}
