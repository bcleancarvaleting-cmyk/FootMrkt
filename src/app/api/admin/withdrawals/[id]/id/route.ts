import { getCurrentUser } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { db } from "@/server/db";

/** Admins only: the ID photo a manager sent with a withdrawal. Every view is logged. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return new Response("Not found", { status: 404 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const w = await db.withdrawal.findUnique({ where: { id }, select: { idImage: true, idImageType: true } });
  if (!w?.idImage) return new Response("Not found", { status: 404 });
  await audit(db, { actorId: user.id, action: "withdrawal.view-id", entityType: "Withdrawal", entityId: id });
  return new Response(new Uint8Array(w.idImage), {
    headers: { "Content-Type": w.idImageType ?? "application/octet-stream", "Cache-Control": "private, no-store", "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff" },
  });
}
