import Link from "next/link";

/**
 * One hero slide in the MATCHX style: tag, two-line italic headline (second line lime), a line of
 * copy, ✓ points and big buttons — over a darkened football photo. The title is always at the top;
 * the visual (cards, packs, team) sits under it on phones and beside it on wide screens.
 */
export function HeroSlide({
  background,
  eyebrow,
  title,
  accent,
  body,
  points,
  visual,
  ctas,
}: {
  background?: React.ReactNode;
  eyebrow: string;
  title: React.ReactNode;
  accent: React.ReactNode;
  body: React.ReactNode;
  points: React.ReactNode[];
  visual?: React.ReactNode;
  ctas: Array<{ href: string; label: string; tone?: "primary" | "ghost" | "gold" | "sim" }>;
}) {
  const btn = { primary: "btn-primary", ghost: "btn border border-white/30 text-white hover:border-white/70", gold: "btn-gold", sim: "btn bg-[#8fe3ff] text-[#04121a]" } as const;
  return (
    <div className="relative h-full overflow-hidden bg-[#0b0e0c] lg:rounded-[28px]">
      {background ?? <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_80%_20%,rgb(173_252_7/0.14),transparent_60%)]" aria-hidden="true" />}
      {/* Title always first and at the same height on every slide; the picture under it on phones, beside it on wide screens. */}
      <div className="relative grid min-h-[600px] content-start gap-5 px-5 pb-10 pt-8 text-[#f4f5f2] sm:gap-8 sm:px-10 sm:pt-12 lg:grid-cols-[1.05fr_1fr] lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:gap-y-5">
        <div className="space-y-3">
          <span className="tag border-white/25 text-white/80">{eyebrow}</span>
          <h2 className="text-[52px] leading-[0.86] sm:text-7xl">
            {title}
            <br />
            <span className="text-[#adfc07]">{accent}</span>
          </h2>
        </div>
        {visual && <div className="flex justify-center lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:items-center">{visual}</div>}
        <div className="max-w-xl space-y-5">
          <p className="max-w-md text-lg text-white/75">{body}</p>
          {points.length > 0 && (
            <ul className="space-y-1.5 text-sm text-white/80">
              {points.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-[#adfc07]">✓</span> <span className="min-w-0 truncate">{p}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-3 pt-1 sm:flex-row">
            {ctas.map((c) => (
              <Link key={c.href + c.label} href={c.href} className={`${btn[c.tone ?? "primary"]} px-7 py-4 text-sm`}>
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
