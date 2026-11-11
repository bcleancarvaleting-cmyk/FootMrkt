import { createHash } from "node:crypto";

/**
 * Error monitoring: every server error and every error a player's browser hits is logged to
 * Admin → Errors (the same error is one row, counted). A new error — or one that comes back after
 * being marked fixed — is emailed to the admins straight away (Resend). Optionally also set
 * ERROR_WEBHOOK_URL to a Slack or Discord incoming webhook (or any URL that
 * accepts JSON) and server errors are posted there. The same error is sent at most once every
 * 10 minutes so a broken page can't flood the channel.
 */
const recent = new Map<string, number>();
const QUIET_MS = 10 * 60_000;

export async function reportError(title: string, err: unknown, extra: Record<string, unknown> = {}, source: "SERVER" | "BROWSER" = "SERVER") {
  const message = err instanceof Error ? err.message : String(err);
  await logError(source, title, message, extra).catch(() => {});
  const key = `${title}:${message}`.slice(0, 300);
  const now = Date.now();
  if ((recent.get(key) ?? 0) > now - QUIET_MS) return;
  recent.set(key, now);
  if (recent.size > 500) for (const [k, t] of recent) if (t < now - QUIET_MS) recent.delete(k);

  console.error(`[alert] ${title}: ${message}`, extra);
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  const lines = [`🚨 MATCHX ${process.env.NODE_ENV === "production" ? "" : "(dev) "}${title}`, message, ...Object.entries(extra).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)];
  const text = lines.join("\n").slice(0, 1800);
  try {
    // Slack reads `text`, Discord reads `content`.
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, content: text }), signal: AbortSignal.timeout(5000) });
  } catch (e) {
    console.error("[alert] could not post to ERROR_WEBHOOK_URL", e);
  }
}

/** Record the error (one row per distinct error, counted); email admins the first time it's seen. */
async function logError(source: "SERVER" | "BROWSER", title: string, message: string, extra: Record<string, unknown>) {
  const { db } = await import("./db");
  const path = typeof extra.path === "string" ? extra.path.slice(0, 300) : null;
  const fingerprint = createHash("sha256").update(`${source}|${title}|${message.slice(0, 500)}|${(path ?? "").replace(/[0-9a-f-]{36}/g, ":id")}`).digest("hex");
  const existing = await db.errorLog.findUnique({ where: { fingerprint } });
  const isNew = !existing || !!existing.resolvedAt;
  await db.errorLog.upsert({
    where: { fingerprint },
    create: { fingerprint, source, title: title.slice(0, 200), message: message.slice(0, 2000), path, detail: extra as never },
    update: { count: { increment: 1 }, lastAt: new Date(), resolvedAt: null, detail: extra as never },
  });
  if (!isNew) return;
  const admins = await db.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { id: true, email: true, displayName: true } });
  const { sendEmail } = await import("./email/send");
  for (const a of admins) {
    await sendEmail("errorAlert", { userId: a.id, email: a.email }, { name: a.displayName, title, message: message.slice(0, 400), path: path ?? "—", source }, `error:${fingerprint}:${existing?.resolvedAt?.getTime() ?? 0}:${a.id}`);
  }
}
