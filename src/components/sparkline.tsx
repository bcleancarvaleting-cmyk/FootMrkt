/** Tiny MP history line. Values only; no axes needed at this size. */
export function Sparkline({ values, width = 240, height = 48 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <p className="text-xs text-faint">Not enough history yet.</p>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 4) + 2, height - 2 - ((v - min) / span) * (height - 4)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`MP history from ${values[0]} to ${values[values.length - 1]}`}>
      <path d={d} fill="none" stroke="var(--color-lime)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3} fill="var(--color-lime)" />
    </svg>
  );
}
