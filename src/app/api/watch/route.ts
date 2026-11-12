import { getCurrentUser } from "@/server/auth/session";
import { watchBoard } from "@/server/watch";

export const dynamic = "force-dynamic";

/** The watch-live screen: scores, vidiprinter and live tables for the sim matchday or real gameweek. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const scope = q.get("scope") === "real" ? "real" : "sim";
  const gw = /^[0-9a-f-]{36}$/i.test(q.get("gw") ?? "") ? q.get("gw") : null;
  if (scope === "sim") await (await import("@/server/sim-matchday")).tickSims().catch(() => null);
  const user = await getCurrentUser();
  return Response.json(await watchBoard(scope, user?.id ?? null, new Date(), gw), { headers: { "Cache-Control": "private, no-store" } });
}
