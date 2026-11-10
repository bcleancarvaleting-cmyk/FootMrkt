import { timingSafeEqual } from "node:crypto";
import { tick } from "@/server/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled job endpoint for hosts with a cron service (Vercel Cron, Render, Railway, a GitHub
 * Action, cron-job.org …). Call every 5 minutes with:  Authorization: Bearer <CRON_SECRET>
 * (or run `npm run jobs -- tick` on a server instead).
 */
function authorised(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

async function run(req: Request) {
  if (!authorised(req)) return new Response("unauthorised", { status: 401 });
  return Response.json({ ok: true, ran: await tick() });
}

export const GET = run;
export const POST = run;
