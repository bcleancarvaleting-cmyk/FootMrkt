import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { reportError } from "@/server/monitoring";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("error monitoring", () => {
  it("logs each distinct error once with a count, and emails admins only when it's new or comes back", async () => {
    const admin = await makeUser("watcher");
    await db.user.update({ where: { id: admin.userId }, data: { role: "ADMIN" } });
    await reportError("Server error", new Error("Boom on packs"), { path: "/packs" });
    await reportError("Server error", new Error("Boom on packs"), { path: "/packs" });
    const row = await db.errorLog.findFirstOrThrow({ where: { message: "Boom on packs" } });
    expect(row.count).toBeGreaterThanOrEqual(2);
    expect(await db.emailLog.count({ where: { template: "errorAlert", userId: admin.userId } })).toBe(1);
    // Marked fixed, then it happens again: one more email.
    await db.errorLog.update({ where: { id: row.id }, data: { resolvedAt: new Date() } });
    await reportError("Server error", new Error("Boom on packs"), { path: "/packs" });
    expect(await db.emailLog.count({ where: { template: "errorAlert", userId: admin.userId } })).toBe(2);
    // Browser errors on a different card page with the same message group together.
    await reportError("Browser error", "x is undefined", { path: "/cards/11111111-1111-1111-1111-111111111111" }, "BROWSER");
    await reportError("Browser error", "x is undefined", { path: "/cards/22222222-2222-2222-2222-222222222222" }, "BROWSER");
    expect(await db.errorLog.count({ where: { message: "x is undefined" } })).toBe(1);
  });
});
