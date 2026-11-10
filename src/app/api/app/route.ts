import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";

const Body = z.object({
  installed: z.enum(["ios", "android", "desktop"]).optional(),
  notifications: z.boolean().optional(),
});

/** Records that a manager opened MATCHX as an installed app, and their notification choice. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const { installed, notifications } = parsed.data;
  const current = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { appInstalledAt: true, notificationsEnabled: true } });
  await db.user.update({
    where: { id: user.id },
    data: {
      ...(installed && !current.appInstalledAt ? { appInstalledAt: new Date(), appPlatform: installed } : {}),
      ...(notifications !== undefined && notifications !== current.notificationsEnabled ? { notificationsEnabled: notifications, notificationsUpdatedAt: new Date() } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}
