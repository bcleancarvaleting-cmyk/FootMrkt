import { getCurrentUser } from "@/server/auth/session";
import { isRoom, listMessages } from "@/server/chat";

export const dynamic = "force-dynamic";

/** Messages for a room. `?after=<ISO time>` returns only newer messages (used for live polling). */
export async function GET(req: Request, ctx: { params: Promise<{ room: string }> }) {
  if (!(await getCurrentUser())) return new Response("Sign in to read chat", { status: 401 });
  const { room } = await ctx.params;
  if (!isRoom(room)) return new Response("Unknown room", { status: 404 });
  const afterRaw = new URL(req.url).searchParams.get("after");
  const after = afterRaw ? new Date(afterRaw) : undefined;
  const messages = await listMessages(room, { after: after && !isNaN(after.getTime()) ? after : undefined });
  return Response.json({ messages }, { headers: { "Cache-Control": "no-store" } });
}
