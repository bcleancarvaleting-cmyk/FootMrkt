import { CustomPhotoRow, HeroCardsForm, HeroPhotoForm, PickImageForm, PlayerPhotoForm } from "@/components/admin-image-forms";
import { db } from "@/server/db";
import { STAR_NAMES } from "@/server/showcase";
import { ADMIN_IMAGE_CREDIT, PHOTO_SLOTS, heroPhotos, homeImages } from "@/server/site-images";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Images" };
export const dynamic = "force-dynamic";

export default async function ImagesAdmin() {
  const [home, photos, clubs, leagues, custom] = await Promise.all([
    homeImages(),
    heroPhotos(),
    db.club.findMany({ orderBy: [{ league: { tier: "asc" } }, { name: "asc" }], select: { id: true, name: true, crestUrl: true, league: { select: { name: true } } } }),
    db.league.findMany({ orderBy: { tier: "asc" }, select: { id: true, name: true, logoUrl: true } }),
    db.player.findMany({ where: { imageCredit: ADMIN_IMAGE_CREDIT, imageUrl: { not: null } }, orderBy: { displayName: "asc" }, take: 200, select: { id: true, displayName: true, imageUrl: true, club: { select: { name: true } } } }),
  ]);
  return (
    <>
      <AdminTitle
        title="Images"
        intro="Change the pictures on the site whenever you have better ones. Player photos, club badges and league logos come from Sportmonks with the nightly squad sync; anything you set here replaces theirs and is never overwritten. Upload a file (PNG, JPG, WebP or SVG, up to 4MB) or paste an https link."
      />

      <section className="panel space-y-4 p-5">
        <div>
          <h2 className="text-2xl">Homepage cards</h2>
          <p className="text-sm text-muted">The three cards fanned under &ldquo;Your club starts here.&rdquo; Pick any player with a Gold card, and the look: Gold, Ruby, Diamond or Rainbow.</p>
        </div>
        <HeroCardsForm cards={home.heroCards} suggestions={STAR_NAMES} />
      </section>

      <section className="panel space-y-4 p-5">
        <div>
          <h2 className="text-2xl">Homepage photos</h2>
          <p className="text-sm text-muted">The football photos behind the homepage slides. Wide photos work best (at least 1600px across); they&apos;re darkened so the text stays readable.</p>
        </div>
        {PHOTO_SLOTS.map((s) => (
          <HeroPhotoForm key={s.key} slot={s.key} label={s.label} current={photos[s.key]} />
        ))}
      </section>

      <section className="panel space-y-4 p-5">
        <div>
          <h2 className="text-2xl">Player photos</h2>
          <p className="text-sm text-muted">Swap any player&apos;s photo on every copy of their card. Cut-out head-and-shoulders shots in club kit look best (portrait, transparent background).</p>
        </div>
        <PlayerPhotoForm />
        {custom.length > 0 && (
          <div>
            <p className="eyebrow mb-1">Your photos · {custom.length}</p>
            {custom.map((p) => (
              <CustomPhotoRow key={p.id} id={p.id} name={p.displayName} club={p.club?.name ?? "—"} url={p.imageUrl!} />
            ))}
          </div>
        )}
      </section>

      <section className="panel space-y-4 p-5">
        <div>
          <h2 className="text-2xl">Club badges &amp; league logos</h2>
          <p className="text-sm text-muted">Badges show on cards, the market and club pages; league logos on the packs.</p>
        </div>
        <PickImageForm kind="club" label="Club" options={clubs.map((c) => ({ id: c.id, name: `${c.name} · ${c.league.name}`, url: c.crestUrl }))} />
        <PickImageForm kind="league" label="League" options={leagues.map((l) => ({ id: l.id, name: l.name, url: l.logoUrl }))} />
      </section>
    </>
  );
}
