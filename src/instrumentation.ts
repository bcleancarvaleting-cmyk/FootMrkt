import type { Instrumentation } from "next";

/** Server errors → ERROR_WEBHOOK_URL (see src/server/monitoring.ts). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("./server/monitoring");
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
  await reportError("Server error", err, { path: request.path, method: request.method, route: context.routePath, kind: context.routeType, digest });
};

/**
 * Hosts without a cron service (e.g. a free Render test site): set RUN_JOBS_IN_APP=true and the
 * server runs the 5-minute job itself while it's awake. Production should use /api/cron instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.RUN_JOBS_IN_APP !== "true") return;
  const { tick } = await import("./server/jobs");
  const run = () => tick().catch((e) => console.error("in-app job failed", e));
  setTimeout(run, 30_000);
  setInterval(run, 5 * 60_000);
}
