import { getCurrentUser } from "@/server/auth/session";
import { simReplay } from "@/server/sim-replay";

export const dynamic = "force-dynamic";

/** Watch again: a finished simulated matchday, minute by minute. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("gw") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const [user, data] = await Promise.all([getCurrentUser(), simReplay(id)]);
  if (!data) return Response.json({ error: "not available" }, { status: 404 });
  return Response.json({ ...data, viewerId: user?.id ?? null }, { headers: { "Cache-Control": "private, max-age=60" } });
}
