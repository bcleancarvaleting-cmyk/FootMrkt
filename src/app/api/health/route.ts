import { db } from "@/server/db";
import { lastTickAt } from "@/server/jobs";

export const dynamic = "force-dynamic";

/**
 * Uptime check for the host / a monitor (e.g. UptimeRobot). 200 when the app and database are up;
 * 503 otherwise. `jobs` warns if the 5-minute scheduled job hasn't run for 15 minutes.
 */
export async function GET() {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
  const tick = await lastTickAt();
  const jobsOk = !!tick && Date.now() - tick.getTime() < 15 * 60_000;
  return Response.json({
    ok: true,
    db: "up",
    dbMs: Date.now() - started,
    jobs: tick ? (jobsOk ? "ok" : "late") : "never run",
    lastJobAt: tick?.toISOString() ?? null,
    version: process.env.APP_VERSION ?? process.env.GIT_SHA ?? "dev",
  });
}
