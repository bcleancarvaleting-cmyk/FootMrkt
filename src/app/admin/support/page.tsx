import { resolveTicketAction } from "@/app/actions/support";
import { AdminForm } from "@/components/admin-forms";
import { fmtDate } from "@/lib/view";
import { db } from "@/server/db";
import { SUPPORT_CATEGORIES } from "@/server/support";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Support" };

export default async function SupportAdmin({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const status = show === "resolved" ? "RESOLVED" : "OPEN";
  const [tickets, open] = await Promise.all([
    db.supportTicket.findMany({ where: { status }, orderBy: { createdAt: status === "OPEN" ? "asc" : "desc" }, take: 100 }),
    db.supportTicket.count({ where: { status: "OPEN" } }),
  ]);
  const users = await db.user.findMany({ where: { id: { in: tickets.flatMap((t) => (t.userId ? [t.userId] : [])) } }, select: { id: true, displayName: true } });
  const label = Object.fromEntries(SUPPORT_CATEGORIES);
  return (
    <>
      <AdminTitle title="Support" intro={`"Report a problem" messages, oldest first. Reply from your own email (click the address), then mark it resolved. ${open} open.`} />
      <div className="flex gap-3 text-sm">
        <a href="/admin/support" className={status === "OPEN" ? "font-bold text-lime" : "text-muted"}>Open ({open})</a>
        <a href="/admin/support?show=resolved" className={status === "RESOLVED" ? "font-bold text-lime" : "text-muted"}>Resolved</a>
      </div>
      {tickets.length === 0 ? (
        <p className="text-sm text-faint">Nothing here.</p>
      ) : (
        <ul className="space-y-3">
          {tickets.map((t) => (
            <li key={t.id} className={`panel space-y-2 p-4 ${t.category === "SAFER_PLAY" && t.status === "OPEN" ? "border-warn/60" : ""}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span>
                  <b>{label[t.category] ?? t.category}</b> · <a href={`mailto:${t.email}?subject=MATCHX%20support%20(ref%20${t.id.slice(0, 6).toUpperCase()})`} className="text-lime underline">{t.email}</a>
                  {t.userId && <span className="text-faint"> · {users.find((u) => u.id === t.userId)?.displayName}</span>}
                </span>
                <span className="text-xs text-faint">ref {t.id.slice(0, 6).toUpperCase()} · {fmtDate(t.createdAt)}{t.pagePath ? ` · from ${t.pagePath}` : ""}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-muted">{t.message}</p>
              {t.status === "OPEN" ? (
                <AdminForm action={resolveTicketAction} submit="Mark resolved">
                  <input type="hidden" name="id" value={t.id} />
                  <div className="sm:col-span-4">
                    <label className="label" htmlFor={`note-${t.id}`}>Note (optional, admin only)</label>
                    <input id={`note-${t.id}`} name="note" className="input" placeholder="e.g. Replied, refunded order" />
                  </div>
                </AdminForm>
              ) : (
                t.adminNote && <p className="text-xs text-faint">Note: {t.adminNote}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
