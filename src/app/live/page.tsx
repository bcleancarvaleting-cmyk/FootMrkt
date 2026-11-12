import { LiveCentre } from "@/components/live-centre";
import { getCurrentUser } from "@/server/auth/session";
import { liveBoard } from "@/server/live";

export const metadata = { title: "Matchday Live" };
export const dynamic = "force-dynamic";

export default async function LivePage() {
  const user = await getCurrentUser();
  return <LiveCentre initial={await liveBoard(user?.id ?? null)} signedIn={!!user} />;
}
