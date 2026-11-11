import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { currentProvider, loadIntegrationState } from "@/server/integrations";
import { rebuildBlocker, rebuildStatus, runRebuild, startRebuild } from "@/server/rebuild";
import { deleteSecret, readSecret, saveSecret, secretInfo } from "@/server/secrets";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});
afterEach(() => vi.unstubAllGlobals());

describe("API keys saved in admin", () => {
  it("are stored encrypted, read back, show only the last 4 characters, and can be removed", async () => {
    await saveSecret("sportmonks", "abcdefghijklmnopqrstuvwxyz123456", null);
    const row = await db.appSetting.findUniqueOrThrow({ where: { key: "secret.sportmonks" } });
    expect(JSON.stringify(row.value)).not.toContain("abcdefghijklmnop");
    expect(await readSecret("sportmonks")).toBe("abcdefghijklmnopqrstuvwxyz123456");
    expect(await secretInfo("sportmonks")).toMatchObject({ last4: "3456", readable: true });
    expect((await loadIntegrationState(true)).hasSportmonksToken).toBe(true);
    await deleteSecret("sportmonks", null);
    expect(await readSecret("sportmonks")).toBeNull();
  });
});

describe("Rebuild from Sportmonks", () => {
  it("refuses on a site with real payments or many players", async () => {
    const { userId } = await makeUser();
    expect(await rebuildBlocker()).toBeNull();
    await db.order.create({ data: { userId, kind: "PACK_PURCHASE", refId: "x", amountMinor: 299, provider: "stripe", status: "PAID", idempotencyKey: "real-1" } });
    expect(await rebuildBlocker()).toMatch(/real card payments/);
    await expect(startRebuild(userId)).rejects.toThrow(/real card payments/);
  });

  it("changes nothing if the download from Sportmonks fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "Invalid token provided" }), { status: 401 })));
    process.env.SPORTMONKS_API_TOKEN = "bad";
    const before = await db.player.count();
    await runRebuild(null);
    delete process.env.SPORTMONKS_API_TOKEN;
    expect(await db.player.count()).toBe(before);
    expect(await rebuildStatus()).toMatchObject({ state: "failed", error: expect.stringMatching(/Invalid token/) });
  });

  it("rebuilds the world from Sportmonks squads, keeps saved keys, and switches data on", async () => {
    await saveSecret("sportmonks", "token-kept-across-rebuilds-0001", null);
    const t = (developer_name: string) => ({ developer_name });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | string) => {
        const url = new URL(String(input));
        const json = (data: unknown) => new Response(JSON.stringify({ data, pagination: { has_more: false } }), { status: 200 });
        const league = url.pathname.match(/\/leagues\/(\d+)$/);
        if (league) return json({ id: Number(league[1]), currentseason: { id: Number(league[1]) * 100 } });
        const teams = url.pathname.match(/\/teams\/seasons\/(\d+)$/);
        if (teams) return json(teams[1] === "800" ? [{ id: 1, name: "Arsenal", short_code: "ARS" }, { id: 2, name: "Gillingham", short_code: "GIL" }] : []);
        const squad = url.pathname.match(/\/squads\/seasons\/\d+\/teams\/(\d+)$/);
        if (squad) {
          const team = Number(squad[1]);
          return json(
            Array.from({ length: 16 }, (_, i) => ({
              player_id: team * 100 + i,
              jersey_number: i + 1,
              position_id: [24, 25, 25, 25, 25, 26, 26, 26, 26, 27, 27, 27, 24, 25, 26, 27][i],
              player: { display_name: `Player ${team}-${i}`, nationality: { fifa_name: "ENG" } },
            })),
          );
        }
        void t;
        return json([]);
      }),
    );
    await db.featureFlag.upsert({ where: { key: "PACK_SHOP" }, create: { key: "PACK_SHOP", enabled: true }, update: { enabled: true } });
    await runRebuild(null, { minClubs: 2, minPlayers: 20 });
    const status = await rebuildStatus();
    expect(status.error ?? "").toBe("");
    expect(status.state).toBe("done");
    expect(await db.club.count()).toBe(2);
    expect(await db.player.count()).toBe(32);
    const p = await db.player.findFirstOrThrow({ where: { displayName: "Player 2-0" }, include: { club: true } });
    expect(p.providerRefs).toMatchObject({ sportmonks: "200" });
    expect(p.club?.providerRefs).toMatchObject({ sportmonks: "2" });
    expect(await readSecret("sportmonks")).toBe("token-kept-across-rebuilds-0001");
    // Feature switches (e.g. Pack shop on) survive a rebuild too.
    expect((await db.featureFlag.findUnique({ where: { key: "PACK_SHOP" } }))?.enabled).toBe(true);
    await loadIntegrationState(true);
    expect(currentProvider()).toBe("sportmonks");
    expect(await db.user.count({ where: { role: "ADMIN" } })).toBe(1);
  });
});
