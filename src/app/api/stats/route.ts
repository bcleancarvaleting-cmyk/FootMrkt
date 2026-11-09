import { liveStats } from "@/server/stats";

export const dynamic = "force-dynamic";

/** Live stats bar data. Public, aggregate-only (no personal data). */
export async function GET() {
  return Response.json(await liveStats(), { headers: { "Cache-Control": "public, max-age=15" } });
}
