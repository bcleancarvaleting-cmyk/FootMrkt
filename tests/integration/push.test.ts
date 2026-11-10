import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { saveSubscription, sendPush } from "@/server/push";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
  process.env.VAPID_PUBLIC_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
  process.env.VAPID_PRIVATE_KEY = "UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls";
});
afterEach(() => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

describe("push notifications", () => {
  it("sends to every device and drops subscriptions the browser has removed", async () => {
    const { userId } = await makeUser();
    await saveSubscription(userId, { endpoint: "https://push.example/live", keys: { p256dh: "k", auth: "a" } });
    await saveSubscription(userId, { endpoint: "https://push.example/gone", keys: { p256dh: "k", auth: "a" } });
    const send = vi.fn(async (sub: { endpoint: string }, _payload: string) => {
      if (sub.endpoint.endsWith("gone")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      return {} as never;
    });
    const sent = await sendPush(userId, { title: "Deadline in 1 hour", body: "Pick your squad", url: "/matches" }, send as never);
    expect(sent).toBe(1);
    expect(JSON.parse(send.mock.calls[0][1])).toMatchObject({ title: "Deadline in 1 hour", url: "/matches" });
    expect((await db.pushSubscription.findMany()).map((s) => s.endpoint)).toEqual(["https://push.example/live"]);
  });
});
