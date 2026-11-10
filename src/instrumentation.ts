import type { Instrumentation } from "next";

/** Server errors → ERROR_WEBHOOK_URL (see src/server/monitoring.ts). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("./server/monitoring");
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
  await reportError("Server error", err, { path: request.path, method: request.method, route: context.routePath, kind: context.routeType, digest });
};
