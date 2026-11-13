import { db } from "@/server/db";

/**
 * Same-site copy of a player photo, club badge or league logo, so share posters can be saved as
 * images (a browser won't export a picture with images from another site in it). Only relays images
 * the game already uses: Sportmonks' image server, or a link set in Admin → Images.
 */
const MAX = 5 * 1024 * 1024;

async function allowed(u: URL) {
  if (u.protocol !== "https:") return false;
  if (u.hostname === "cdn.sportmonks.com") return true;
  const s = u.toString();
  const [p, c, l] = await Promise.all([
    db.player.count({ where: { imageUrl: s } }),
    db.club.count({ where: { crestUrl: s } }),
    db.league.count({ where: { logoUrl: s } }),
  ]);
  return p + c + l > 0;
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("u") ?? "";
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return new Response("Bad image", { status: 400 });
  }
  if (!(await allowed(u))) return new Response("Not allowed", { status: 403 });
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(8000), redirect: "error" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return new Response("Not found", { status: 404 });
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > MAX) return new Response("Too big", { status: 413 });
    return new Response(bytes, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
