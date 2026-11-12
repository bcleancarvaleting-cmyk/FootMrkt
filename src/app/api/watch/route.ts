import { getCurrentUser } from "@/server/auth/session";
import { watchBoard } from "@/server/watch";

export const dynamic = "force-dynamic";

/** The watch-live screen: scores, vidiprinter and live tables for the sim matchday or real gameweek. */
export async function GET(req: Request) {
  const scope = new URL(req.url).searchParams.get("scope") === "real" ? "real" : "sim";
  if (scope === "sim") await (await import("@/server/sim-matchday")).tickSims().catch(() => null);
  const user = await getCurrentUser();
  return Response.json(await watchBoard(scope, user?.id ?? null), { headers: { "Cache-Control": "private, no-store" } });
}
