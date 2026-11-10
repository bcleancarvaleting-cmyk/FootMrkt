"use client";

import { useEffect, useState } from "react";
import type { ChatMessageView } from "@/server/chat";
import { ChatRoom } from "./chat-room";

type Room = { id: string; name: string };

/**
 * Manager chat as a panel that slides out from the right edge. A slim tab stays docked on the
 * edge so chat is always one tap away without taking a menu slot.
 */
export function ChatDrawer({ rooms, me, maxLength }: { rooms: Room[]; me: { id: string; isMod: boolean }; maxLength: number }) {
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState(rooms[0].id);
  const [initial, setInitial] = useState<ChatMessageView[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch(`/api/chat/${room}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => live && setInitial(d.messages))
      .catch(() => live && setInitial([]));
    return () => {
      live = false;
    };
  }, [open, room]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setInitial(null);
          setOpen(true);
        }}
        aria-expanded={open}
        aria-controls="chat-drawer"
        className={`fixed right-0 top-[62%] z-40 -translate-y-1/2 sm:top-1/2 rounded-l-xl border border-r-0 border-ink-600 bg-ink-900 px-1.5 py-3 sm:px-2 sm:py-4 shadow-[0_8px_30px_-10px_rgb(0_0_0/0.6)] transition hover:bg-ink-800 ${
          open ? "pointer-events-none opacity-0" : ""
        }`}
        style={{ marginRight: "env(safe-area-inset-right, 0px)" }}
      >
        <span className="flex flex-col items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-lime" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 5h16v11H9l-5 4Z" />
          </svg>
          <span className="hidden text-[11px] font-bold uppercase tracking-[0.18em] [writing-mode:vertical-rl] sm:block">Chat</span>
          <span className="sr-only sm:hidden">Chat</span>
        </span>
      </button>

      {open && <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside
        id="chat-drawer"
        aria-label="Manager chat"
        aria-hidden={!open}
        className={`fixed bottom-0 right-0 top-0 z-50 flex w-[min(400px,92vw)] flex-col border-l border-ink-700 bg-ink-950 shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)", paddingRight: "env(safe-area-inset-right, 0px)" }}
      >
        <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
          <h2 className="text-2xl">Manager chat</h2>
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-sm text-muted hover:text-fg" aria-label="Close chat">
            ✕
          </button>
        </div>
        <div className="flex gap-4 overflow-x-auto border-b border-ink-700 px-4 pt-2 [scrollbar-width:none]" role="tablist">
          {rooms.map((r) => (
            <button key={r.id} type="button" role="tab" aria-selected={room === r.id} onClick={() => {
                if (r.id === room) return;
                setInitial(null);
                setRoom(r.id);
              }} className={`tab ${room === r.id ? "tab-on" : ""}`}>
              {r.name}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 p-3">
          {open && initial ? (
            <ChatRoom key={room} room={room} initial={initial} me={me} maxLength={maxLength} className="flex h-full flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-900" />
          ) : (
            <p className="p-6 text-center text-sm text-faint">{open ? "Loading…" : ""}</p>
          )}
        </div>
      </aside>
    </>
  );
}
