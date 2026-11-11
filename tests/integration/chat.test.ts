import { beforeEach, describe, expect, it } from "vitest";
import { listMessages, postMessage, removeMessage, reportMessage } from "@/server/chat";
import { db } from "@/server/db";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("manager chat", () => {
  it("posts and lists messages per room", async () => {
    const a = await makeUser();
    await postMessage(a.userId, "dugout", "  Who's captaining Saka?  ");
    const msgs = await listMessages("dugout");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toBe("Who's captaining Saka?");
    expect(await listMessages("pulls")).toHaveLength(0);
  });

  it("rejects links, empty and over-long messages, and unknown rooms", async () => {
    const a = await makeUser();
    await expect(postMessage(a.userId, "dugout", "free packs at http://scam.example")).rejects.toMatchObject({ code: "NO_LINKS" });
    await expect(postMessage(a.userId, "dugout", "visit matchx-free.com now")).rejects.toMatchObject({ code: "NO_LINKS" });
    await expect(postMessage(a.userId, "dugout", "   ")).rejects.toMatchObject({ code: "EMPTY" });
    await expect(postMessage(a.userId, "dugout", "x".repeat(401))).rejects.toMatchObject({ code: "TOO_LONG" });
    await expect(postMessage(a.userId, "nope", "hi")).rejects.toMatchObject({ code: "NO_ROOM" });
  });

  it("rate-limits bursts", async () => {
    const a = await makeUser();
    for (let i = 0; i < 5; i++) await postMessage(a.userId, "matchday", `goal ${i}`);
    await expect(postMessage(a.userId, "matchday", "one more")).rejects.toMatchObject({ code: "SLOW_DOWN" });
  });

  it("hides a message after three reports and lets authors and mods remove", async () => {
    const author = await makeUser();
    const msg = await postMessage(author.userId, "dugout", "something nasty");
    for (let i = 0; i < 3; i++) await reportMessage((await makeUser()).userId, msg.id);
    expect((await listMessages("dugout"))[0]).toMatchObject({ removed: true, body: null });
    await expect(reportMessage(author.userId, msg.id)).rejects.toMatchObject({ code: "OWN_MESSAGE" });

    const other = await makeUser();
    const m2 = await postMessage(author.userId, "dugout", "fine message");
    await expect(removeMessage({ id: other.userId, role: "USER" }, m2.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await removeMessage({ id: other.userId, role: "ADMIN" }, m2.id);
    expect(await db.adminAuditLog.count({ where: { action: "chat.remove" } })).toBe(1);
  });
});
