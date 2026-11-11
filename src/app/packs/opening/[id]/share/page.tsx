import Link from "next/link";
import { notFound } from "next/navigation";
import { FINISH_STYLE, type Finish } from "@/components/finish-art";
import { PosterExport } from "@/components/poster-export";
import { FORMATS, FoundPoster, GoldPullPoster, type PosterFormat } from "@/components/social-poster";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getOpening } from "@/server/packs";
import { enrichCards } from "@/server/views";

export const metadata = { title: "Share your pull" };

/**
 * Share a great pull (from the pack reveal): a ready-made image or short video of the card for
 * Instagram, TikTok, Facebook or WhatsApp — feed, portrait or story size.
 */
export default async function SharePullPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ card?: string; f?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const opening = await getOpening(user.id, id).catch(() => null);
  if (!opening) notFound();
  const cards = await enrichCards(opening.cards.map((c) => c.card));
  const worthy = cards.filter((c) => c.finish || c.category === "GOLD").sort((a, b) => (b.finish ? FINISH_STYLE[b.finish.kind].rank * 1000 : 0) + (b.valueMp ?? 0) - ((a.finish ? FINISH_STYLE[a.finish.kind].rank * 1000 : 0) + (a.valueMp ?? 0)));
  if (!worthy.length) notFound();
  const card = worthy.find((c) => c.id === sp.card) ?? worthy[0];
  const format = (Object.keys(FORMATS) as PosterFormat[]).find((k) => k === sp.f) ?? "story";
  const me = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { displayName: true, clubName: true } });
  const { w, h } = FORMATS[format];
  const poster = card.finish ? (
    <FoundPoster card={card} kind={card.finish.kind as Finish} manager={me.displayName} clubName={me.clubName} format={format} />
  ) : (
    <GoldPullPoster card={card} manager={me.displayName} clubName={me.clubName} format={format} />
  );
  const q = (patch: { card?: string; f?: string }) => `?${new URLSearchParams({ card: card.id, f: format, ...patch })}`;
  return (
    <div className="space-y-5">
      <div>
        <Link href={`/packs/opening/${id}`} className="text-xs text-faint hover:text-fg">
          ← Back to your pack
        </Link>
        <h1 className="mt-1 text-4xl leading-none">Share your pull</h1>
        <p className="mt-1 text-sm text-muted">Show off {card.name} — share it as an image or a short shimmering video, or save it to post later.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(FORMATS) as PosterFormat[]).map((f) => (
          <Link key={f} href={q({ f })} className={`chip ${f === format ? "border-accent text-fg" : ""}`}>
            {f === "story" ? "Story / TikTok" : f === "portrait" ? "Instagram post" : "Square"}
          </Link>
        ))}
        {worthy.length > 1 && <span className="mx-1 w-px self-stretch bg-ink-700" />}
        {worthy.length > 1 &&
          worthy.map((c) => (
            <Link key={c.id} href={q({ card: c.id })} className={`chip ${c.id === card.id ? "border-accent text-fg" : ""}`}>
              {c.name}
            </Link>
          ))}
      </div>
      <PosterExport filename={`matchx-${card.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${format}`} width={w} height={h} scale={format === "story" ? 0.3 : 0.32}>
        {poster}
      </PosterExport>
    </div>
  );
}
