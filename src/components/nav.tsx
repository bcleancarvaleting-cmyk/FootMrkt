import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/server/auth/session";
import { balanceMinor, fmtMp } from "@/server/wallet";
import { type Theme, ThemeToggle } from "./theme-toggle";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display text-[26px] font-extrabold uppercase italic leading-none tracking-tight ${className}`}>
      Collect<span className="text-lime">r</span>
    </span>
  );
}

export async function Header({ theme }: { theme: Theme }) {
  const user = await getCurrentUser();
  const credit = user ? await balanceMinor(user.id) : 0;
  return (
    <header
      className="sticky z-30 border-b border-ink-800 bg-ink-950/85 backdrop-blur-xl"
      style={{ top: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="COLLECTR home">
          <Logo />
        </Link>
        <nav className="ml-4 hidden items-center gap-1 text-sm font-semibold md:flex" aria-label="Secondary">
          <Link href="/how-it-works" className="rounded-full px-3 py-1.5 text-muted hover:text-fg">
            How it works
          </Link>
          {user?.role === "ADMIN" && (
            <Link href="/admin" className="rounded-full px-3 py-1.5 text-muted hover:text-fg">
              Admin
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle initial={theme} />
          {user ? (
            <>
              <Link
                href="/profile"
                className="hidden items-center gap-1.5 rounded-full border border-gold/50 bg-gold/10 px-3 py-1.5 text-xs font-extrabold text-gold sm:inline-flex"
                title="MP credit — spend it on packs"
              >
                <span aria-hidden="true">◆</span> {fmtMp(credit)}
              </Link>
              <Link
                href="/profile"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-danger font-display text-base font-extrabold uppercase text-white ring-2 ring-white/80"
                aria-label={`${user.displayName} — profile`}
              >
                {user.displayName.slice(0, 1)}
              </Link>
              <form action={logoutAction} className="hidden sm:block">
                <button className="btn-ghost px-3 py-2 text-[10px]">Log out</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost px-4 py-2 text-[10px]">
                Log in
              </Link>
              <Link href="/register" className="btn-primary px-4 py-2 text-[10px]">
                Join free
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
