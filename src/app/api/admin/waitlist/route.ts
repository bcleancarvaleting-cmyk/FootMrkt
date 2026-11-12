import { getCurrentUser } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { waitlistCsv } from "@/server/waitlist";

/** Admin download of the whole waitlist as CSV (every download is audited). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return new Response("Not found", { status: 404 });
  await audit(db, { actorId: user.id, action: "waitlist.export", entityType: "WaitlistEntry" });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(await waitlistCsv(), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="matchx-waitlist-${day}.csv"`, "cache-control": "no-store" },
  });
}
