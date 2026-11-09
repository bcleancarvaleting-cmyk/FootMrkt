/**
 * Club badge. Shows the licensed crest when `crestUrl` is set; otherwise a generated shield in
 * the club's colours with its short code. Official crests are trademarks and are only shown
 * once supplied as licensed assets (spec §10).
 */
export function ClubBadge({
  short,
  primary,
  secondary,
  crestUrl,
  size = 24,
  title,
}: {
  short: string | null;
  primary: string;
  secondary: string;
  crestUrl?: string | null;
  size?: number;
  title?: string;
}) {
  if (crestUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={crestUrl} alt={title ?? short ?? "Club crest"} width={size} height={size} className="object-contain" />;
  }
  const label = (short ?? "?").slice(0, 3);
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 40 46" role="img" aria-label={title ?? label}>
      <title>{title ?? label}</title>
      <path d="M20 1 L38 7 V22 C38 34 30 41 20 45 C10 41 2 34 2 22 V7 Z" fill={primary} stroke={secondary} strokeWidth="2.5" />
      <path d="M20 1 L38 7 V14 H2 V7 Z" fill={secondary} opacity="0.25" />
      <text x="20" y="29" textAnchor="middle" fontSize="11" fontWeight="800" fontFamily="system-ui, sans-serif" fill={secondary}>
        {label}
      </text>
    </svg>
  );
}
