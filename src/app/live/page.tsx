import { LiveCentre } from "@/components/live-centre";
import { SimTickerScope } from "@/components/scores-ticker";
import { getCurrentUser } from "@/server/auth/session";
import { liveBoard } from "@/server/live";

export const metadata = { title: "Matchday Live" };
export const dynamic = "force-dynamic";

export default async function LivePage() {
  const user = await getCurrentUser();
  await (await import("@/server/sim-matchday")).tickSims().catch(() => null);
  const board = await liveBoard(user?.id ?? null);
  // While a simulated matchday is playing, the ticker along the top follows it.
  const simOn = board.fixtures.some((f) => f.sim && f.status === "LIVE");
  return (
    <>
      {simOn && <SimTickerScope />}
      <LiveCentre initial={board} signedIn={!!user} />
    </>
  );
}
