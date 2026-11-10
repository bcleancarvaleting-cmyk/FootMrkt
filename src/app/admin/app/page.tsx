import { db } from "@/server/db";
import { fmtDate } from "@/lib/view";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · App" };

export default async function AppAdmin() {
  const [total, installed, byPlatform, notif, recent] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { appInstalledAt: { not: null } } }),
    db.user.groupBy({ by: ["appPlatform"], _count: { _all: true }, where: { appInstalledAt: { not: null } } }),
    db.user.count({ where: { notificationsEnabled: true } }),
    db.user.findMany({
      where: { OR: [{ appInstalledAt: { not: null } }, { notificationsUpdatedAt: { not: null } }] },
      orderBy: [{ appInstalledAt: { sort: "desc", nulls: "last" } }],
      take: 200,
      select: { id: true, displayName: true, appInstalledAt: true, appPlatform: true, notificationsEnabled: true, notificationsUpdatedAt: true },
    }),
  ]);
  const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : "0%");
  const plat = (p: string) => byPlatform.find((b) => b.appPlatform === p)?._count._all ?? 0;
  return (
    <>
      <AdminTitle
        title="App & notifications"
        intro="MATCHX installs to the home screen on iPhone and Android (no app store needed). An install is recorded the first time a manager opens it from their home screen; notification status is checked on every visit."
      />
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-700 bg-ink-700 lg:grid-cols-5">
        {[
          ["Installed", `${installed}`, `${pct(installed)} of managers`],
          ["iPhone", `${plat("ios")}`, "Safari → Add to Home Screen"],
          ["Android", `${plat("android")}`, "Chrome → Install app"],
          ["Desktop", `${plat("desktop")}`, "Installed from a computer"],
          ["Notifications on", `${notif}`, `${pct(notif)} of managers`],
        ].map(([l, v, s]) => (
          <div key={l} className="bg-ink-900 p-4">
            <p className="eyebrow">{l}</p>
            <p className="mt-1 font-display text-3xl font-extrabold italic tabular-nums">{v}</p>
            <p className="text-xs text-faint">{s}</p>
          </div>
        ))}
      </section>
      <div className="overflow-x-auto rounded-2xl border border-ink-700">
        <table className="stack w-full text-sm sm:min-w-[560px]">
          <thead className="bg-ink-850 text-left text-[11px] uppercase tracking-[0.12em] text-faint">
            <tr>
              {["Manager", "Installed", "Device", "Notifications", "Changed"].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700 bg-ink-900">
            {recent.map((u) => (
              <tr key={u.id}>
                <td data-label="Manager" className="px-3 py-2 font-semibold">{u.displayName}</td>
                <td data-label="Installed" className="px-3 py-2 tabular-nums">{u.appInstalledAt ? fmtDate(u.appInstalledAt, { dateStyle: "medium" }) : <span className="text-faint">—</span>}</td>
                <td data-label="Device" className="px-3 py-2">{u.appPlatform ?? <span className="text-faint">—</span>}</td>
                <td data-label="Notifications" className="px-3 py-2">{u.notificationsEnabled ? <span className="text-lime">On</span> : <span className="text-faint">Off</span>}</td>
                <td data-label="Changed" className="px-3 py-2 tabular-nums">{u.notificationsUpdatedAt ? fmtDate(u.notificationsUpdatedAt, { dateStyle: "medium" }) : <span className="text-faint">—</span>}</td>
              </tr>
            ))}
            {!recent.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-faint">
                  No installs yet. Managers see install steps on the home page and in My Account.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
