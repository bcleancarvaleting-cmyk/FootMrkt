const WEMBLEY = { src: "/hero/wembley-night.webp", fallback: "/hero/wembley-night.jpg", credit: "Photo: Martin Pettitt, CC BY 2.0", href: "https://commons.wikimedia.org/wiki/File:WembleyStadiumNight.jpg" };

/** The floodlit stadium (or the admin-set photo) behind the homepage and waitlist heroes. */
export function HeroBackground({ image }: { image: string }) {
  return (
    <>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <picture>
          <source srcSet={WEMBLEY.src} type="image/webp" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={WEMBLEY.fallback} alt="Wembley Stadium's arch lit up at night" className="absolute inset-0 h-full w-full object-cover object-[50%_30%]" fetchPriority="high" />
        </picture>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#060708] via-[#060708]/35 to-transparent" aria-hidden="true" />
      <div className="absolute inset-0 hidden bg-gradient-to-r from-[#060708]/75 via-[#060708]/10 to-transparent sm:block" aria-hidden="true" />
      {!image && (
        <a href={WEMBLEY.href} target="_blank" rel="noreferrer" className="absolute right-3 top-3 z-10 rounded bg-black/40 px-1.5 py-0.5 text-[9px] text-white/55 hover:text-white">
          {WEMBLEY.credit}
        </a>
      )}
    </>
  );
}


/**
 * A football photo behind a hero slide (free-to-use Unsplash photos, stored with the site),
 * darkened so text stays readable, with a hint of MATCHX lime.
 */
export const HERO_PHOTOS = {
  nightStadium: "/hero/night-stadium.webp",
  ballBoots: "/hero/ball-boots.webp",
  floodlight: "/hero/floodlight.webp",
  bootBall: "/hero/boot-ball.webp",
} as const;

export function PhotoBackground({ src, position = "50% 50%" }: { src: string; position?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: position }} loading="lazy" />
      <div className="absolute inset-0 bg-[#060708]/45" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#060708] via-[#060708]/70 to-[#060708]/10" aria-hidden="true" />
      <div className="absolute inset-0 hidden bg-gradient-to-r from-[#060708]/90 via-[#060708]/40 to-transparent sm:block" aria-hidden="true" />
      <div className="absolute inset-0 bg-[radial-gradient(90%_60%_at_85%_0%,rgb(173_252_7/0.14),transparent_60%)]" aria-hidden="true" />
    </>
  );
}
