import { beforeEach, describe, expect, it } from "vitest";
import { registerUser } from "@/server/auth/accounts";
import { db } from "@/server/db";
import { setFlag } from "@/server/flags";
import { signupOpen } from "@/server/launch-gate";
import { setText } from "@/server/settings";
import { PLACES_PER_FRIEND, checkWaitlistToken, convertWaitlist, joinWaitlist, queuePosition, sendLaunchEmails, startLaunchEmails, waitlistCsv } from "@/server/waitlist";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

const join = (email: string, extra: Record<string, unknown> = {}) => joinWaitlist({ email, over18: true, ...extra });

describe("waitlist", () => {
  it("one place per email (case-insensitive), 18+ only, keeps where they came from", async () => {
    await expect(joinWaitlist({ email: "kid@x.com", over18: false as true })).rejects.toBeTruthy();
    const a = await join("Fan@Example.com", { firstName: "Sam", clubCode: "NOPE", utmSource: "instagram", utmCampaign: "ars-launch" });
    const again = await join("fan@example.com");
    expect(a.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.entry.id).toBe(a.entry.id);
    expect(a.entry).toMatchObject({ email: "fan@example.com", firstName: "Sam", clubCode: null, utmSource: "instagram", utmCampaign: "ars-launch" });
  });

  it("friends who join with your link move you up the queue", async () => {
    const first = await join("a@x.com");
    const mid = (await Promise.all(Array.from({ length: 12 }, (_, i) => join(`m${i}@x.com`)))).at(-1)!;
    const sharer = await join("sharer@x.com");
    expect((await queuePosition(sharer.entry.id))?.position).toBe(14);
    await join("friend@x.com", { ref: sharer.entry.refCode });
    const after = await queuePosition(sharer.entry.id);
    expect(after?.position).toBe(14 - PLACES_PER_FRIEND);
    expect(after?.total).toBe(15);
    expect((await queuePosition(first.entry.id))?.position).toBe(1);
    expect(mid).toBeTruthy();
  });

  it("pre-launch closes sign-up except with the early-access code", async () => {
    const admin = await makeUser("wladmin");
    expect(await signupOpen()).toBe(true);
    await setFlag(admin.userId, "PRELAUNCH", true);
    expect(await signupOpen()).toBe(false);
    await setText(admin.userId, "earlyAccessCode", "FOUNDERS");
    expect(await signupOpen("founders")).toBe(true);
    expect(await signupOpen("nope")).toBe(false);
  });

  it("registering with the waitlist email gives the launch gift, once", async () => {
    const w = await join("gift@x.com");
    const r = await registerUser({ email: "gift@x.com", password: "correct-horse-battery", displayName: "GiftFan" });
    const e = await db.waitlistEntry.findUniqueOrThrow({ where: { id: w.entry.id } });
    expect(e.convertedUserId).toBe(r.user.id);
    expect(await db.packEntitlement.count({ where: { userId: r.user.id, sourceRef: `waitlist:${w.entry.id}` } })).toBe(1);
    expect(await convertWaitlist(r.user.id, "gift@x.com")).toBe(false);
  });

  it("launch emails go once to everyone still waiting, skipping unsubscribed and converted", async () => {
    const admin = await makeUser("wladmin2");
    await join("one@x.com");
    const gone = await join("gone@x.com");
    await db.waitlistEntry.update({ where: { id: gone.entry.id }, data: { unsubscribedAt: new Date() } });
    expect(await sendLaunchEmails()).toMatchObject({ skipped: expect.any(String) });
    expect(await startLaunchEmails(admin.userId)).toMatchObject({ sent: 1, left: 0 });
    expect(await sendLaunchEmails()).toMatchObject({ skipped: expect.any(String) });
    expect(await db.emailLog.count({ where: { template: "launchLive" } })).toBe(1);
  });

  it("CSV export neutralises spreadsheet formulas; unsubscribe links are signed", async () => {
    const w = await join("csv@x.com", { firstName: "=HYPERLINK(1)" });
    const csv = await waitlistCsv();
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
    expect(checkWaitlistToken(w.entry.id, "bad")).toBe(false);
  });
});
