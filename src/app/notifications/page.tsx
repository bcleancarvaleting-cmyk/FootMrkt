import Link from "next/link";
import { after } from "next/server";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth/session";
import { markAllRead, myNotifications } from "@/server/notifications";
import { relativeTime } from "@/lib/view";

export const metadata = { title: "Notifications" };

const ICON: Record<string, string> = { achievement: "★", level: "⬆", streak: "🔥", prediction: "✓", watch: "👁", drop: "⚡", listing: "£", tier: "⇅" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await myNotifications(user.id);
  after(() => markAllRead(user.id));
  return (
    <div>
      <PageHeader eyebrow="Inbox" title="Notifications" intro="Achievements, level-ups, streak rewards and alerts for the players you're watching." />
      {items.length === 0 ? (
        <EmptyState title="All quiet">Watch some players and play a match — your news lands here.</EmptyState>
      ) : (
        <ul className="divide-y divide-ink-700 overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
          {items.map((n) => {
            const body = (
              <>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${n.readAt ? "bg-ink-800 text-muted" : "bg-accent text-accent-ink"}`} aria-hidden="true">
                  {ICON[n.kind] ?? "•"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{n.title}</span>
                  <span className="block text-sm text-muted">{n.body}</span>
                </span>
                <span className="shrink-0 text-xs text-faint">{relativeTime(n.createdAt)}</span>
              </>
            );
            return (
              <li key={n.id}>
                {n.href ? (
                  <Link href={n.href} className="flex items-center gap-3 px-4 py-3 hover:bg-ink-850">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
