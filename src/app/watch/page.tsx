import { SimTickerScope } from "@/components/scores-ticker";
import { WatchLive } from "@/components/watch-live";
import { getCurrentUser } from "@/server/auth/session";
import { watchBoard } from "@/server/watch";

export const metadata = { title: "Watch live" };
export const dynamic = "force-dynamic";

export default async function WatchPage({ searchParams }: { searchParams: Promise<{ scope?: string; gw?: string }> }) {
  const { scope: q, gw: gwq } = await searchParams;
  const gw = /^[0-9a-f-]{36}$/i.test(gwq ?? "") ? gwq! : null;
  const scope = q === "real" ? "real" : "sim";
  if (scope === "sim") await (await import("@/server/sim-matchday")).tickSims().catch(() => null);
  const user = await getCurrentUser();
  const board = await watchBoard(scope, user?.id ?? null, new Date(), gw);
  return (
    <>
      {scope === "sim" && <SimTickerScope />}
      <WatchLive initial={board} gw={gw} />
    </>
  );
}
