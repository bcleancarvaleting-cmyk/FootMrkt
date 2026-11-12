import { recentSignings } from "@/server/signings";

export const dynamic = "force-dynamic";

/** Signings since `after` (ISO time; default the last 30 minutes), newest first. Public: club and player names only. */
export async function GET(req: Request) {
  const after = new URL(req.url).searchParams.get("after");
  const t = after ? new Date(after) : new Date(Date.now() - 30 * 60_000);
  const since = Number.isNaN(t.getTime()) ? new Date(Date.now() - 30 * 60_000) : new Date(Math.max(t.getTime(), Date.now() - 24 * 3_600_000));
  return Response.json(await recentSignings(since), { headers: { "Cache-Control": "public, max-age=10" } });
}
