import { getCurrentUser } from "@/server/auth/session";
import { watchTeam } from "@/server/watch";

export const dynamic = "force-dynamic";

/** A manager's team with live points (others' teams only once entries have closed). */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("entry") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const user = await getCurrentUser();
  const team = await watchTeam(id, user?.id ?? null);
  return team ? Response.json(team, { headers: { "Cache-Control": "private, no-store" } }) : Response.json({ error: "not available" }, { status: 404 });
}
