import { redirect } from "next/navigation";
import { keepMessageAction, removeReportedAction } from "@/app/actions/moderation";
import { ActionButton } from "@/components/action-button";
import { CHAT_ROOMS } from "@/config/chat";
import { requireUser } from "@/server/auth/session";
import { canModerate, reportQueue } from "@/server/moderation";
import { fmtDate } from "@/lib/view";

export const metadata = { title: "Moderation" };

export default async function ModerationPage() {
  const user = await requireUser();
  if (!canModerate(user.role)) redirect("/chat");
  const queue = await reportQueue();
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Moderators only</p>
        <h1 className="text-5xl font-extrabold">Moderation</h1>
        <p className="text-sm text-muted">Reported chat messages. Three open reports hide a message until you keep or remove it.</p>
      </div>
      {queue.length === 0 ? (
        <div className="panel p-8 text-center text-muted">Nothing to review. Nice and quiet.</div>
      ) : (
        <div className="space-y-3">
          {queue.map((m) => (
            <div key={m.id} className="panel space-y-3 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-faint">
                <span>
                  <b className="text-fg">{m.user.displayName}</b> in {CHAT_ROOMS.find((r) => r.id === m.room)?.name ?? m.room} · {fmtDate(m.createdAt)}
                </span>
                <span className={m.reports.length >= 3 ? "font-bold text-danger" : "text-warn"}>
                  {m.reports.length} report{m.reports.length > 1 ? "s" : ""}
                  {m.reports.length >= 3 ? " · hidden" : ""}
                </span>
              </div>
              <p className="whitespace-pre-wrap rounded-2xl bg-ink-800 px-4 py-3 text-sm">{m.body}</p>
              <p className="text-xs text-faint">
                Reported by {m.reports.map((r) => r.user.displayName).join(", ")}
                {m.reports.some((r) => r.reason) ? ` — ${m.reports.map((r) => r.reason).filter(Boolean).join("; ")}` : ""}
              </p>
              <div className="flex gap-2">
                <ActionButton action={removeReportedAction.bind(null, m.id)} className="btn-danger">
                  Remove message
                </ActionButton>
                <ActionButton action={keepMessageAction.bind(null, m.id)} className="btn-ghost">
                  Keep
                </ActionButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
