/** League logos on a pack front: a white chip per league, or the league's name until its logo is loaded. */
export function PackLeagueLogos({ leagues, size = "md" }: { leagues: Array<{ code: string; name: string; logoUrl: string | null }>; size?: "sm" | "md" }) {
  const h = size === "sm" ? "h-6" : "h-9";
  return (
    <span className="flex flex-wrap items-center gap-1.5" aria-label={`Players from ${leagues.map((l) => l.name).join(", ")}`}>
      {leagues.map((l) =>
        l.logoUrl ? (
          <span key={l.code} title={l.name} className={`flex ${h} items-center rounded-md bg-white/90 px-1.5 shadow-sm ring-1 ring-black/10`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={l.logoUrl} alt={l.name} className="h-[80%] w-auto object-contain" />
          </span>
        ) : (
          <span key={l.code} className="rounded-sm bg-black/70 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-white">
            {l.name}
          </span>
        ),
      )}
    </span>
  );
}
