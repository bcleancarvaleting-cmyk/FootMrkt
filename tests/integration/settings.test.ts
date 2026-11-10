import { beforeEach, describe, expect, it } from "vitest";
import { getText, referralRewardName, setText } from "@/server/settings";
import { makeUser, resetDb, buildWorld } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("community links (admin settings)", () => {
  it("stores the community and WhatsApp channel links, blank hides them, bad links are refused", async () => {
    const admin = await makeUser("adm-links");
    expect(await getText("facebookGroupUrl")).toBe("");
    expect(await getText("whatsappChannelUrl")).toBe("");
    await setText(admin.userId, "facebookGroupUrl", "https://www.facebook.com/groups/matchx");
    await setText(admin.userId, "whatsappChannelUrl", "https://whatsapp.com/channel/0029VaExample");
    expect(await getText("whatsappChannelUrl")).toBe("https://whatsapp.com/channel/0029VaExample");
    await expect(setText(admin.userId, "whatsappChannelUrl", "https://example.com/not-whatsapp")).rejects.toMatchObject({ code: "URL" });
    await expect(setText(admin.userId, "facebookGroupUrl", "facebook.com/groups/x")).rejects.toMatchObject({ code: "URL" });
    await setText(admin.userId, "whatsappChannelUrl", "  ");
    expect(await getText("whatsappChannelUrl")).toBe("");
    expect(await referralRewardName()).toBe("Choice of Bronze");
  });
});
