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
    let transferWindow = false; // later: Arsenal's player 100 joins Gillingham, a new signing arrives, 115 leaves England
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | string) => {
        const url = new URL(String(input));
        const json = (data: unknown) => new Response(JSON.stringify({ data, pagination: { has_more: false } }), { status: 200 });
        const league = url.pathname.match(/\/leagues\/(\d+)$/);
        if (league) return json({ id: Number(league[1]), currentseason: { id: Number(league[1]) * 100 } });
        const teams = url.pathname.match(/\/teams\/seasons\/(\d+)$/);
        if (teams) return json(teams[1] === "800" ? [{ id: 1, name: "Arsenal", short_code: "ARS", image_path: "https://cdn.sportmonks.com/images/soccer/teams/1/1.png" }, { id: 2, name: "Gillingham", short_code: "GIL", image_path: "https://cdn.sportmonks.com/images/soccer/placeholder.png" }] : []);
        const squad = url.pathname.match(/\/squads\/seasons\/\d+\/teams\/(\d+)$/);
        if (squad) {
          const team = Number(squad[1]);
          const rows = Array.from({ length: 16 }, (_, i) => ({
            player_id: team * 100 + i,
            jersey_number: i + 1,
            position_id: [24, 25, 25, 25, 25, 26, 26, 26, 26, 27, 27, 27, 24, 25, 26, 27][i],
            player: {
              display_name: `Player ${team}-${i}`,
              nationality: { fifa_name: "ENG" },
              // Every player has a photo except the last, who has Sportmonks' placeholder.
              image_path: i < 15 ? `https://cdn.sportmonks.com/images/soccer/players/${team * 100 + i}.png` : "https://cdn.sportmonks.com/images/soccer/placeholder.png",
            },
          }));
          if (!transferWindow) return json(rows);
          if (team === 1) return json(rows.filter((r) => r.player_id !== 100 && r.player_id !== 115));
          return json([...rows, { ...rows[0], player_id: 100, jersey_number: 77, player: { display_name: "Player 1-0" } }, { ...rows[5], player_id: 299, jersey_number: 30, player: { display_name: "New Signing", image_path: "https://cdn.sportmonks.com/images/soccer/players/299.png" } }]);
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

    // Transfer window: a manager owns a card of Arsenal's player 100, who moves to Gillingham.
    const { syncSquads, lastSquadSync } = await import("@/server/live-data");
    const mover = await db.player.findFirstOrThrow({ where: { displayName: "Player 1-0" }, include: { templates: true } });
    const owner = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
    const card = await db.cardInstance.findFirstOrThrow({ where: { templateId: mover.templates[0].id } });
    await db.cardInstance.update({ where: { id: card.id }, data: { ownerId: owner.id, supplyState: "HELD" } });
    // A photo added by hand (another licensed source) is never replaced by the sync.
    const handPicked = await db.player.findFirstOrThrow({ where: { displayName: "Player 2-3" } });
    await db.player.update({ where: { id: handPicked.id }, data: { imageUrl: "https://images.example.com/p23.jpg", imageCredit: "Club media" } });
    transferWindow = true;
    const r = await syncSquads(owner.id);
    expect(r).toEqual({ moved: 1, added: 1, missing: 1 });
    const moved = await db.player.findUniqueOrThrow({ where: { id: mover.id }, include: { club: true } });
    expect(moved.club?.name).toBe("Gillingham");
    expect(moved.squadNumber).toBe(77);
    // The owner's card is the same card, now at the new club, and they were told.
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: card.id } })).ownerId).toBe(owner.id);
    expect(await db.notification.count({ where: { userId: owner.id, title: { contains: "has moved to Gillingham" } } })).toBe(1);
    const signing = await db.player.findFirstOrThrow({ where: { displayName: "New Signing" }, include: { templates: true } });
    expect(signing.templates).toHaveLength(1);
    // Photos and badges come from Sportmonks; placeholders are skipped.
    expect((await db.player.findFirstOrThrow({ where: { displayName: "Player 2-1" } })).imageUrl).toBe("https://cdn.sportmonks.com/images/soccer/players/201.png");
    expect((await db.player.findFirstOrThrow({ where: { displayName: "Player 2-15" } })).imageUrl).toBeNull();
    expect((await db.player.findUniqueOrThrow({ where: { id: handPicked.id } })).imageUrl).toBe("https://images.example.com/p23.jpg");
    expect(signing.imageUrl).toBe("https://cdn.sportmonks.com/images/soccer/players/299.png");
    expect((await db.club.findFirstOrThrow({ where: { name: "Arsenal" } })).crestUrl).toBe("https://cdn.sportmonks.com/images/soccer/teams/1/1.png");
    expect((await db.club.findFirstOrThrow({ where: { name: "Gillingham" } })).crestUrl).toBeNull();
    const report = await lastSquadSync();
    expect(report?.badges).toBe(1);
    expect(report?.moved).toEqual([{ name: "Player 1-0", from: "Arsenal", to: "Gillingham" }]);
    expect(report?.missing.map((m) => m.name)).toEqual(["Player 1-15"]);
    // Running it again changes nothing and tells nobody twice.
    expect(await syncSquads(owner.id)).toEqual({ moved: 0, added: 0, missing: 1 });
    expect((await lastSquadSync())?.photos).toBe(0);
    expect(await db.notification.count({ where: { userId: owner.id, title: { contains: "has moved" } } })).toBe(1);
  });
});

describe("Payments switch (Admin → Integrations)", () => {
  it("off blocks every card checkout; Live needs both Stripe keys; keys are stored encrypted", async () => {
    const { loadPayments, setPaymentsMode, cardPaymentsReady } = await import("@/server/payments/config");
    const { startDeposit } = await import("@/server/wallet");
    process.env.LEGAL_GATES_CLEARED = "DEPOSITS";
    process.env.FLAG_DEPOSITS = "true";
    const { makeUser } = await import("./fixtures");
    const u = await makeUser("payer1");
    await db.user.update({ where: { id: u.userId }, data: { dateOfBirth: new Date("1990-01-01") } });

    await setPaymentsMode("off", null);
    expect((await cardPaymentsReady()).ready).toBe(false);
    await expect(startDeposit(u.userId, { bundle: "squad", acceptTerms: true, acceptRisk: true }, "k-off")).rejects.toMatchObject({ code: "PAYMENTS_OFF" });

    await expect(setPaymentsMode("stripe", null)).rejects.toMatchObject({ code: "STRIPE_KEYS" });
    await saveSecret("stripe.secret", "sk_test_abcdefghijklmnop1234", null);
    await saveSecret("stripe.webhook", "whsec_abcdefghijklmnop1234", null);
    await setPaymentsMode("stripe", null);
    const c = await loadPayments(true);
    expect(c).toMatchObject({ mode: "stripe", stripeKey: "sk_test_abcdefghijklmnop1234", webhookSecret: "whsec_abcdefghijklmnop1234" });
    const row = await db.appSetting.findUniqueOrThrow({ where: { key: "secret.stripe.secret" } });
    expect(JSON.stringify(row.value)).not.toContain("abcdefghijklmnop");

    await setPaymentsMode("test", null);
    expect((await cardPaymentsReady()).ready).toBe(true); // test checkout (Dev tools on in tests)
    await expect(startDeposit(u.userId, { bundle: "squad", acceptTerms: true, acceptRisk: true }, "k-test")).resolves.toMatchObject({ checkoutUrl: expect.stringContaining("/dev/checkout/") });
  });
});
