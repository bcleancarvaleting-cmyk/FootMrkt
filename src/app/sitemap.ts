import type { MetadataRoute } from "next";
import { db } from "@/server/db";
import { APP_URL } from "@/server/email/templates";

// Public pages for search engines, including every club's landing page.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const clubs = await db.club.findMany({ select: { code: true } }).catch(() => []);
  const fixed = ["", "/how-it-works", "/odds", "/guides", "/hall-of-fame", "/teams", "/register"];
  return [...fixed.map((p) => ({ url: `${APP_URL}${p}` })), ...clubs.map((c) => ({ url: `${APP_URL}/teams/${c.code.toLowerCase()}` }))];
}
