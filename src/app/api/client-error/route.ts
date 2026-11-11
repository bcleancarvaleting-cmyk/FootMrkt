import { rateLimit } from "@/lib/rate-limit";
import { reportError } from "@/server/monitoring";

/** Errors from players' browsers (error screens and uncaught errors) → Admin → Errors. */
export async function POST(req: Request) {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ?? "local";
  if (!rateLimit(`client-error:${ip}`, { capacity: 10, perMinute: 5 })) return new Response(null, { status: 204 });
  const body = (await req.json().catch(() => null)) as { message?: unknown; path?: unknown; digest?: unknown; stack?: unknown } | null;
  if (!body || typeof body.message !== "string") return new Response(null, { status: 204 });
  await reportError(
    "Browser error",
    body.message.slice(0, 500),
    { path: typeof body.path === "string" ? body.path.slice(0, 300) : undefined, digest: typeof body.digest === "string" ? body.digest.slice(0, 100) : undefined, stack: typeof body.stack === "string" ? body.stack.slice(0, 1500) : undefined, agent: req.headers.get("user-agent")?.slice(0, 200) },
    "BROWSER",
  );
  return new Response(null, { status: 204 });
}
