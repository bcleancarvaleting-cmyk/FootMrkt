/**
 * Error alerts. Set ERROR_WEBHOOK_URL to a Slack or Discord incoming webhook (or any URL that
 * accepts JSON) and server errors are posted there. The same error is sent at most once every
 * 10 minutes so a broken page can't flood the channel.
 */
const recent = new Map<string, number>();
const QUIET_MS = 10 * 60_000;

export async function reportError(title: string, err: unknown, extra: Record<string, unknown> = {}) {
  const message = err instanceof Error ? err.message : String(err);
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
