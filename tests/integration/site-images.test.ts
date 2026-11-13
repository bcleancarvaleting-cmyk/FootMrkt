import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { ADMIN_IMAGE_CREDIT, DEFAULT_HOME_IMAGES, dress, heroPhotos, homeImages, saveUpload, setEntityImage, setHeroCards, setHeroPhoto } from "@/server/site-images";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe("Admin → Images", () => {
  it("homepage cards: any Gold player, in Gold, Ruby, Diamond or Rainbow", async () => {
    const { userId } = await makeUser();
    expect((await homeImages()).heroCards).toEqual(DEFAULT_HOME_IMAGES.heroCards);
    const golds = await db.player.findMany({ where: { templates: { some: { category: "GOLD" } } }, take: 3, select: { displayName: true } });
    await setHeroCards(userId, [
      { name: golds[0].displayName.toLowerCase(), look: "RUBY" },
      { name: golds[1].displayName, look: "DIAMOND" },
      { name: golds[2].displayName, look: "RAINBOW" },
    ]);
    expect((await homeImages()).heroCards).toEqual([
      { name: golds[0].displayName, look: "RUBY" },
      { name: golds[1].displayName, look: "DIAMOND" },
      { name: golds[2].displayName, look: "RAINBOW" },
    ]);
    await expect(setHeroCards(userId, [{ name: "Nobody", look: "GOLD" }, { name: golds[1].displayName, look: "GOLD" }, { name: golds[2].displayName, look: "GOLD" }])).rejects.toMatchObject({ code: "HERO" });
    // The look is shown as that finish, numbered like the real thing.
    const card = { finish: null } as Parameters<typeof dress>[0];
    expect(dress(card, "DIAMOND").finish).toEqual({ kind: "DIAMOND", serial: 1, of: 10 });
    expect(dress(card, "GOLD").finish).toBeNull();
  });

  it("uploads are stored and served; homepage photos can be replaced and reset", async () => {
    const { userId } = await makeUser();
    const url = await saveUpload(userId, { bytes: PNG, type: "image/png", name: "night.png" });
    expect(url).toMatch(/^\/api\/images\/[0-9a-f-]{36}$/);
    const { GET } = await import("@/app/api/images/[id]/route");
    const res = await GET(new Request(`http://x${url}`), { params: Promise.resolve({ id: url.split("/").pop()! }) });
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    await expect(saveUpload(userId, { bytes: PNG, type: "text/html", name: "x.html" })).rejects.toMatchObject({ code: "IMAGE" });

    await setHeroPhoto(userId, "floodlight", url);
    expect((await heroPhotos()).floodlight).toBe(url);
    await setHeroPhoto(userId, "floodlight", null);
    expect((await heroPhotos()).floodlight).toBe("/hero/floodlight.webp");
  });

  it("a player photo set here is marked as ours (the Sportmonks sync leaves it alone); reset clears it", async () => {
    const { userId } = await makeUser();
    const p = await db.player.findFirstOrThrow();
    await setEntityImage(userId, "player", p.id, "https://images.example.com/better.png");
    expect(await db.player.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ imageUrl: "https://images.example.com/better.png", imageCredit: ADMIN_IMAGE_CREDIT });
    await setEntityImage(userId, "player", p.id, null);
    expect(await db.player.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ imageUrl: null, imageCredit: null });
    const lg = await db.league.findFirstOrThrow();
    await setEntityImage(userId, "league", lg.id, "/api/images/00000000-0000-0000-0000-000000000000");
    expect((await db.league.findUniqueOrThrow({ where: { id: lg.id } })).logoUrl).toContain("/api/images/");
  });
});
