import Link from "next/link";
import { PosterExport } from "@/components/poster-export";
import { FORMATS, MatchdayPoster, type PosterFormat } from "@/components/social-poster";
import { requireUser } from "@/server/auth/session";
import { matchdayCard } from "@/server/matchday-card";

export const metadata = { title: "Share my matchday" };
export const dynamic = "force-dynamic";

/** The manager's gameweek as a ready-to-post image or video: points, rank and top players. */
export default async function MatchdayPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const d = await matchdayCard(user.id);
  const format = (Object.keys(FORMATS) as PosterFormat[]).find((k) => k === sp.f) ?? "story";
  const { w, h } = FORMATS[format];
  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow text-lime">Show it off</p>
        <h1 className="mt-1 text-4xl leading-none">Share my matchday</h1>
        <p className="mt-1 text-sm text-muted">Your score, your rank and your best players this gameweek — as an image or a short video for Instagram, TikTok, Facebook or WhatsApp.</p>
      </div>
      {!d ? (
        <p className="panel p-5 text-sm text-muted">
          Your matchday card appears once a gameweek you&apos;ve entered kicks off. <Link href="/matches" className="text-lime underline">Pick your seven</Link>.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(FORMATS) as PosterFormat[]).map((f) => (
              <Link key={f} href={`?f=${f}`} scroll={false} className={`chip ${f === format ? "border-accent text-fg" : ""}`}>
                {f === "story" ? "Story / TikTok" : f === "portrait" ? "Instagram post" : "Square"}
              </Link>
            ))}
          </div>
          <PosterExport filename={`matchx-gw${d.gameweek}-${d.points}pts-${format}`} width={w} height={h} scale={format === "story" ? 0.26 : 0.28}>
            <MatchdayPoster d={d} format={format} />
          </PosterExport>
        </>
      )}
    </div>
  );
}
