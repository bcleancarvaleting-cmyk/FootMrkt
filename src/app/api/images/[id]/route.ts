import { db } from "@/server/db";

/** Images uploaded in Admin → Images. Never change once uploaded, so they cache for a year. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const img = await db.siteImage.findUnique({ where: { id }, select: { bytes: true, contentType: true } });
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(img.bytes), {
    headers: {
      "Content-Type": img.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // An uploaded SVG can't run scripts on our site.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
    },
  });
}
