import { resolveAllErrorsAction, resolveErrorAction } from "@/app/actions/admin";
import { ActionButton } from "@/components/action-button";
import { fmtDate } from "@/lib/view";
import { db } from "@/server/db";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Errors" };
export const dynamic = "force-dynamic";

export default async function ErrorsPage() {
  const [open, fixed] = await Promise.all([
    db.errorLog.findMany({ where: { resolvedAt: null }, orderBy: { lastAt: "desc" }, take: 100 }),
    db.errorLog.findMany({ where: { resolvedAt: { not: null } }, orderBy: { lastAt: "desc" }, take: 20 }),
  ]);
  return (
    <>
      <AdminTitle
        title="Errors"
        intro="Every error the server or a player's browser hits, grouped and counted. New ones are emailed to admins straight away; mark one fixed and you'll be emailed again only if it comes back."
      >
        {open.length > 0 && (
          <ActionButton action={resolveAllErrorsAction} confirm="Mark every open error as fixed?">
            Mark all fixed
          </ActionButton>
        )}
      </AdminTitle>
      {open.length === 0 ? (
        <p className="panel p-5 text-sm text-mint">✓ No open errors.</p>
      ) : (
        <ul className="space-y-2">
          {open.map((e) => (
            <li key={e.id} className="panel space-y-1 p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="min-w-0 flex-1">
                  <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-extrabold ${e.source === "BROWSER" ? "bg-warn/20 text-warn" : "bg-danger/20 text-danger"}`}>{e.source === "BROWSER" ? "BROWSER" : "SERVER"}</span>
                  <b>{e.title}</b> <span className="text-faint">· {e.path ?? "—"}</span>
                </span>
                <ActionButton action={resolveErrorAction.bind(null, e.id)} className="btn-ghost px-3 py-1.5 text-[11px]">
                  Mark fixed
                </ActionButton>
              </div>
              <p className="break-words font-mono text-xs text-muted">{e.message}</p>
              <p className="text-xs text-faint">
                {e.count.toLocaleString("en-GB")}× · first {fmtDate(e.firstAt)} · last {fmtDate(e.lastAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {fixed.length > 0 && (
        <details className="panel p-4 text-sm">
          <summary className="cursor-pointer text-muted">Recently fixed ({fixed.length})</summary>
          <ul className="mt-2 space-y-1">
            {fixed.map((e) => (
              <li key={e.id} className="text-xs text-faint">
                {e.title} · {e.path ?? "—"} · {e.message.slice(0, 120)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
