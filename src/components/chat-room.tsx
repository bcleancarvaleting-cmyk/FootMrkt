"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { removeChatAction, reportChatAction, sendChatAction } from "@/app/actions/chat";
import type { ChatMessageView } from "@/server/chat";

const POLL_MS = 3000;

function time(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(new Date(iso));
}

function hue(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function ChatRoom({
  room,
  initial,
  me,
  maxLength,
}: {
  room: string;
  initial: ChatMessageView[];
  me: { id: string; isAdmin: boolean };
  maxLength: number;
}) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const lastAt = messages.at(-1)?.createdAt;
  const refresh = useCallback(
    async (full = false) => {
      try {
        const url = `/api/chat/${room}${!full && lastAt ? `?after=${encodeURIComponent(lastAt)}` : ""}`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return;
        const { messages: fresh } = (await r.json()) as { messages: ChatMessageView[] };
        if (full) setMessages(fresh);
        else if (fresh.length) setMessages((m) => [...m, ...fresh.filter((f) => !m.some((x) => x.id === f.id))].slice(-200));
      } catch {
        /* offline — try again next tick */
      }
    },
    [room, lastAt],
  );

  useEffect(() => {
    const t = setInterval(() => refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setError(null);
    start(async () => {
      const r = await sendChatAction(room, body);
      if (r.ok) {
        setDraft("");
        stick.current = true;
        await refresh();
      } else setError(r.error);
    });
  }

  function moderate(kind: "report" | "remove", id: string) {
    start(async () => {
      const r = kind === "report" ? await reportChatAction(id) : await removeChatAction(id);
      setNotice(r.ok ? (r.message ?? null) : r.error);
      if (kind === "remove" && r.ok) await refresh(true);
    });
  }

  return (
    <div className="panel flex h-[calc(100dvh-470px)] min-h-[300px] flex-col overflow-hidden sm:h-[calc(100dvh-400px)]">
      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 space-y-3 overflow-y-auto p-4"
        aria-live="polite"
      >
        {messages.length === 0 && <p className="py-10 text-center text-sm text-faint">No messages yet — say hello to the other managers.</p>}
        {messages.map((m) => {
          const mine = m.userId === me.id;
          return (
            <div key={m.id} className={`group flex gap-3 ${mine ? "flex-row-reverse text-right" : ""}`}>
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-extrabold uppercase text-white"
                style={{ background: `hsl(${hue(m.displayName)} 55% 38%)` }}
                aria-hidden="true"
              >
                {m.displayName.slice(0, 1)}
              </span>
              <div className={`min-w-0 max-w-[78%] ${mine ? "items-end" : ""}`}>
                <div className={`flex items-baseline gap-2 text-xs ${mine ? "justify-end" : ""}`}>
                  <b className="text-fg">{m.displayName}</b>
                  {m.isAdmin && <span className="rounded-full bg-gold/15 px-1.5 text-[9px] font-extrabold uppercase tracking-wider text-gold">Mod</span>}
                  <span className="text-faint">{time(m.createdAt)}</span>
                </div>
                <div
                  className={`mt-1 inline-block whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-left text-sm ${
                    m.removed ? "italic text-faint" : mine ? "bg-lime text-ink-950" : "bg-ink-800 text-fg"
                  }`}
                >
                  {m.removed ? "Message removed" : m.body}
                </div>
                {!m.removed && (
                  <div className={`mt-0.5 flex gap-3 text-[11px] text-faint opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 ${mine ? "justify-end" : ""}`}>
                    {!mine && (
                      <button type="button" className="hover:text-warn" onClick={() => moderate("report", m.id)}>
                        Report
                      </button>
                    )}
                    {(mine || me.isAdmin) && (
                      <button type="button" className="hover:text-danger" onClick={() => moderate("remove", m.id)}>
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="border-t border-ink-700 p-3">
        {(error || notice) && <p className={`mb-2 text-xs ${error ? "text-danger" : "text-mint"}`}>{error ?? notice}</p>}
        <div className="flex gap-2">
          <label htmlFor="chat-input" className="sr-only">
            Message
          </label>
          <input
            id="chat-input"
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={maxLength}
            placeholder="Message the managers…"
            autoComplete="off"
          />
          <button className="btn-primary" disabled={pending || !draft.trim()}>
            Send
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-faint">Be kind. No links, no personal details. Messages can be reported and removed by moderators.</p>
      </form>
    </div>
  );
}
