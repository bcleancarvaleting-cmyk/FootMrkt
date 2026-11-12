import { getCurrentUser } from "@/server/auth/session";
import { liveBoard } from "@/server/live";

export const dynamic = "force-dynamic";

/** Scores for the ticker, plus the signed-in manager's live points (their own data only). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("scope");
  const scope = q === "real" || q === "sim" ? q : "all";
  // Simulated matchdays move on while people watch.
  await (await import("@/server/sim-matchday")).tickSims().catch(() => null);
  const user = await getCurrentUser();
  return Response.json(await liveBoard(user?.id ?? null, new Date(), scope), { headers: { "Cache-Control": "private, no-store" } });
}
