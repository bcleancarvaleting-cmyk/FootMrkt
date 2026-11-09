import { fmtDate } from "@/lib/view";

/**
 * MP value over time. Line is green when the value is up over the period and red when it is
 * down, so the direction is obvious at a glance; min/max/latest are labelled.
 */
export function ValueChart({ points, width = 560, height = 180 }: { points: Array<{ at: Date; mp: number }>; width?: number; height?: number }) {
  if (points.length < 2) {
    return <p className="text-sm text-faint">Value history builds up as gameweeks are played. Check back after the next settlement.</p>;
  }
  const pad = { l: 36, r: 16, t: 14, b: 26 };
  const values = points.map((p) => p.mp);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const lo = Math.max(0, min - Math.max(1, (max - min) * 0.15));
  const hi = max + Math.max(1, (max - min) * 0.15);
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (width - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (height - pad.t - pad.b);
  const first = values[0];
  const last = values[values.length - 1];
  const up = last >= first;
  const colour = up ? "var(--color-mint)" : "var(--color-danger)";
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.mp).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${height - pad.b} L${x(0).toFixed(1)},${height - pad.b} Z`;
  const change = first > 0 ? Math.round(((last - first) / first) * 1000) / 10 : 0;
  const prev = values[values.length - 2];
  const latestChange = prev > 0 ? Math.round(((last - prev) / prev) * 1000) / 10 : 0;
  const latestUp = latestChange >= 0;
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <figure className="space-y-2">
      <figcaption className="flex items-baseline gap-3 text-sm">
        <span className="text-2xl font-black" style={{ color: latestUp ? "var(--color-mint)" : "var(--color-danger)" }}>
          {latestUp ? "▲" : "▼"} {Math.abs(latestChange)}%
        </span>
        <span className="text-muted">
          since last valuation · {up ? "up" : "down"} {Math.abs(change)}% overall ({first} → {last} MP over {points.length} valuations)
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-full" role="img" aria-label={`MP value ${up ? "rising" : "falling"} from ${first} to ${last}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-ink-700)" strokeDasharray="3 4" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--color-faint)">
              {Math.round(t)}
            </text>
          </g>
        ))}
        <path d={area} fill={colour} opacity="0.12" />
        <path d={line} fill="none" stroke={colour} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.mp)} r={i === points.length - 1 ? 4 : 2.5} fill={colour}>
            <title>{`${fmtDate(p.at, { dateStyle: "medium" })}: ${p.mp} MP`}</title>
          </circle>
        ))}
        <text x={pad.l} y={height - 6} fontSize="10" fill="var(--color-faint)">
          {fmtDate(points[0].at, { day: "numeric", month: "short" })}
        </text>
        <text x={width - pad.r} y={height - 6} textAnchor="end" fontSize="10" fill="var(--color-faint)">
          {fmtDate(points[points.length - 1].at, { day: "numeric", month: "short" })}
        </text>
      </svg>
    </figure>
  );
}
