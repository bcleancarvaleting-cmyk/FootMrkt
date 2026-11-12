import { getCurrentUser } from "@/server/auth/session";
import { liveBoard } from "@/server/live";

export const dynamic = "force-dynamic";

/** Scores for the ticker, plus the signed-in manager's live points (their own data only). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("scope");
  const scope = q === "real" || q === "sim" ? q : "all";
  // Simulated matchdays move on while people watch.
  await (await import("@/server/sim-matchday")).tickSims().catch(() => null);
  const m = new URL(req.url).searchParams.get("mode");
  const user = await getCurrentUser();
  const board = await liveBoard(user?.id ?? null, new Date(), scope);
  // The strip under the header: extra items for the page it's on (upcoming games, top performers, transfers).
  const extras = m === "home" || m === "transfers" ? await (await import("@/server/ticker")).tickerItems(m) : undefined;
  return Response.json({ ...board, extras }, { headers: { "Cache-Control": "private, no-store" } });
}
