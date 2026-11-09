import Link from "next/link";
import { ChatRoom } from "@/components/chat-room";
import { CHAT_ROOMS, CHAT_RULES } from "@/config/chat";
import { requireUser } from "@/server/auth/session";
import { isRoom, listMessages } from "@/server/chat";
import { canModerate } from "@/server/moderation";
import { db } from "@/server/db";
import { hoursAgo } from "@/lib/view";

export const metadata = { title: "Chat" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ room?: string }> }) {
  const user = await requireUser();
  const { room: raw } = await searchParams;
  const room = raw && isRoom(raw) ? raw : CHAT_ROOMS[0].id;
  const current = CHAT_ROOMS.find((r) => r.id === room)!;
  const since = hoursAgo(24);
  const [messages, activity] = await Promise.all([
    listMessages(room),
    db.chatMessage.groupBy({ by: ["room"], where: { createdAt: { gte: since }, removedAt: null }, _count: { _all: true } }),
  ]);
  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow">Community</p>
        <h1 className="text-4xl font-extrabold sm:text-5xl">Manager chat</h1>
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="Chat rooms">
        {CHAT_ROOMS.map((r) => {
          const on = r.id === room;
          const n = activity.find((a) => a.room === r.id)?._count._all ?? 0;
          return (
            <Link
              key={r.id}
              href={`/chat?room=${r.id}`}
              role="tab"
              aria-selected={on}
              className={`shrink-0 rounded-full border px-4 py-2 text-xs font-extrabold uppercase tracking-[0.14em] ${
                on ? "border-danger bg-danger text-white shadow-[0_8px_24px_-10px_var(--color-danger)]" : "border-ink-600 text-fg hover:border-ink-600/0 hover:bg-ink-800"
              }`}
            >
              {r.name}
              {n > 0 && <span className={`ml-2 ${on ? "text-white/80" : "text-faint"}`}>{n}</span>}
            </Link>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="hidden text-sm text-muted sm:block">{current.blurb}</p>
        {canModerate(user.role) && (
          <Link href="/moderation" className="text-xs font-extrabold uppercase tracking-[0.16em] text-gold">
            Moderation queue →
          </Link>
        )}
      </div>
      <ChatRoom key={room} room={room} initial={messages} me={{ id: user.id, isMod: canModerate(user.role) }} maxLength={CHAT_RULES.maxLength} />
    </div>
  );
}
