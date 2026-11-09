import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { allFlags } from "@/server/flags";
import { NavLinks } from "./nav-links";

export function Logo() {
  return (
    <span className="font-black tracking-tight">
      COLLECT<span className="text-lime">R</span>
    </span>
  );
}

export async function Nav() {
  const user = await getCurrentUser();
  const flags = await allFlags();
  const unopened = user ? await db.packEntitlement.count({ where: { userId: user.id, status: "UNOPENED" } }) : 0;
  const links = [
    { href: "/football", label: "Football" },
    { href: "/packs", label: "Packs", badge: unopened || undefined },
    { href: "/binder", label: "My Collection" },
    { href: "/collections", label: "Sets" },
    ...(flags.MARKET ? [{ href: "/market", label: "Market" }] : []),
    { href: "/how-it-works", label: "Rules" },
    ...(user?.role === "ADMIN" ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="text-lg">
          <Logo />
        </Link>
        {user && <NavLinks links={links} />}
        <div className="ml-auto flex items-center gap-2 text-sm">
          {user ? (
            <>
              <Link href="/profile" className="hidden text-muted hover:text-fg sm:inline">
                {user.displayName}
              </Link>
              <form action={logoutAction}>
                <button className="btn-ghost px-3 py-1.5 text-xs">Log out</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost px-3 py-1.5 text-xs">
                Log in
              </Link>
              <Link href="/register" className="btn-primary px-3 py-1.5 text-xs">
                Get your free squad
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
