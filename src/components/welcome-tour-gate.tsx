import { db } from "@/server/db";
import { WelcomeTour } from "./welcome-tour";

/** Shows the welcome tour to a manager who hasn't finished or skipped it yet. */
export async function WelcomeTourGate({ userId, name }: { userId: string; name: string }) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { tourSeenAt: true } }).catch(() => null);
  if (!u || u.tourSeenAt) return null;
  return <WelcomeTour name={name} />;
}
