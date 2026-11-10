import Link from "next/link";
import { FoundingBadge } from "@/components/founding-badge";
import { db } from "@/server/db";
import { fmtDate } from "@/lib/view";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; club?: string }> }) {
  const { q, club } = await searchParams;
  const where = {
    ...(q ? { OR: [{ displayName: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } : {}),
    ...(club ? { favouriteClub: { code: club } } : {}),
  };
  const [users, total, supporters] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { favouriteClub: { select: { name: true } }, referredBy: { select: { displayName: true } }, _count: { select: { referrals: true, entries: true } } },
    }),
    db.user.count({ where }),
    db.user.groupBy({ by: ["favouriteClubId"], _count: { _all: true }, where: { favouriteClubId: { not: null } } }),
  ]);
  const clubs = await db.club.findMany({ where: { id: { in: supporters.map((s) => s.favouriteClubId!) } }, select: { id: true, code: true, name: true } });
  const sup = supporters.map((s) => ({ ...clubs.find((c) => c.id === s.favouriteClubId)!, count: s._count._all })).filter((s) => s.code).sort((a, b) => b.count - a.count);
  return (
    <>
      <AdminTitle title="Users" intro={`${total.toLocaleString("en-GB")} manager${total === 1 ? "" : "s"}${club || q ? " matching" : ""}, newest first.`} />
      <form className="flex flex-wrap gap-2" action="/admin/users">
        <input name="q" defaultValue={q} placeholder="Search name or email" className="input max-w-xs" />
        {club && <input type="hidden" name="club" value={club} />}
        <button className="btn-ghost">Search</button>
        {(q || club) && (
          <Link href="/admin/users" className="btn-ghost">
            Clear
          </Link>
        )}
      </form>
      {sup.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sup.slice(0, 24).map((s) => (
            <Link key={s.code} href={`/admin/users?club=${s.code}`} className={`chip ${club === s.code ? "border-accent text-fg" : ""}`}>
              {s.name} <b className="text-fg">{s.count}</b>
            </Link>
          ))}
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-ink-700">
        <table className="stack w-full text-sm sm:min-w-[760px]">
          <thead className="bg-ink-850 text-left text-[11px] uppercase tracking-[0.12em] text-faint">
            <tr>
              {["Manager", "Supports", "Joined", "Matches", "Referred by", "Invites", "App", "Notifications"].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700 bg-ink-900">
            {users.map((u) => (
              <tr key={u.id}>
                <td data-label="Manager" className="px-3 py-2">
                  <span className="flex items-center gap-1.5 font-semibold">
                    {u.displayName} <FoundingBadge number={u.foundingNumber} compact />
                    {u.role !== "USER" && <span className="chip">{u.role.toLowerCase()}</span>}
                  </span>
                  <span className="block text-xs text-faint">{u.email}</span>
                </td>
                <td data-label="Supports" className="px-3 py-2">{u.favouriteClub?.name ?? <span className="text-faint">—</span>}</td>
                <td data-label="Joined" className="px-3 py-2 tabular-nums">{fmtDate(u.createdAt, { dateStyle: "medium" })}</td>
                <td data-label="Matches" className="px-3 py-2 tabular-nums">{u._count.entries}</td>
                <td data-label="Referred by" className="px-3 py-2">{u.referredBy?.displayName ?? <span className="text-faint">—</span>}</td>
                <td data-label="Invites" className="px-3 py-2 tabular-nums">{u._count.referrals}</td>
                <td data-label="App" className="px-3 py-2">{u.appInstalledAt ? <span className="text-lime">✓ {u.appPlatform}</span> : <span className="text-faint">—</span>}</td>
                <td data-label="Notifications" className="px-3 py-2">{u.notificationsEnabled ? <span className="text-lime">On</span> : <span className="text-faint">Off</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > users.length && <p className="text-xs text-faint">Showing the newest 100. Search to find others.</p>}
    </>
  );
}
