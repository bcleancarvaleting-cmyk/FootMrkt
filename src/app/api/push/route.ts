import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { removeSubscription, saveSubscription } from "@/server/push";

const Sub = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

/** Save (POST) or remove (DELETE) this device's push subscription. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });
  const parsed = Sub.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
  await saveSubscription(user.id, parsed.data);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (body?.endpoint) await removeSubscription(body.endpoint);
  return Response.json({ ok: true });
}

/** The public key browsers need to subscribe (null = push not set up on this server). */
export async function GET() {
  const { pushPublicKey } = await import("@/server/push");
  return Response.json({ key: pushPublicKey() });
}
