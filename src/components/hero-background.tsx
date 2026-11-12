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

