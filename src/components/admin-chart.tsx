/**
 * Single-series chart for the admin dashboard (bars for per-week amounts, a line for running
 * totals). One hue (validated against both surfaces), recessive grid, a label on the latest
 * value only, and a hover tooltip on every mark. No legend: the title names the series.
 */
export function AdminChart({
  title,
  points,
  kind = "bar",
  format = (v: number) => v.toLocaleString("en-GB"),
}: {
  title: string;
  points: Array<{ label: string; value: number }>;
  kind?: "bar" | "line";
  format?: (v: number) => string;
}) {
  const W = 560;
  const H = 180;
  const pad = { l: 44, r: 12, t: 16, b: 24 };
  const max = Math.max(1, ...points.map((p) => p.value));
  const nice = (() => {
    const p = 10 ** Math.floor(Math.log10(max));
    const m = max / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  })();
  const x = (i: number) => pad.l + ((i + 0.5) / points.length) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / nice) * (H - pad.t - pad.b);
  const bw = Math.max(4, ((W - pad.l - pad.r) / points.length) * 0.6);
  const last = points.at(-1);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  return (
    <figure className="panel min-w-0 p-4">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-semibold">{title}</span>
        {last && <span className="text-sm tabular-nums text-muted">Latest: <b className="text-fg">{format(last.value)}</b></span>}
      </figcaption>
      {points.every((p) => p.value === 0) ? (
        <p className="flex h-[150px] items-center justify-center rounded-xl border border-dashed border-ink-700 text-sm text-faint">No data yet for these 12 weeks.</p>
      ) : (
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}. ${points.map((p) => `${p.label}: ${format(p.value)}`).join(", ")}`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(nice * f)} y2={y(nice * f)} stroke="var(--color-ink-700)" strokeWidth="1" />
            <text x={pad.l - 6} y={y(nice * f) + 4} textAnchor="end" fontSize="10" fill="var(--color-faint)">
              {format(nice * f)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % Math.ceil(points.length / 6) === 0 || i === points.length - 1 ? (
            <text key={p.label} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--color-faint)">
              {p.label}
            </text>
          ) : null,
        )}
        {kind === "bar"
          ? points.map((p, i) => {
              const top = y(p.value);
              const h = Math.max(0, y(0) - top);
              return (
                <g key={p.label}>
                  <rect x={x(i) - bw / 2} y={top} width={bw} height={h} rx={h > 4 ? 4 : 0} fill="var(--color-chart)">
                    <title>{`${p.label}: ${format(p.value)}`}</title>
                  </rect>
                  <rect x={x(i) - bw / 2 - 4} y={pad.t} width={bw + 8} height={H - pad.t - pad.b} fill="transparent">
                    <title>{`${p.label}: ${format(p.value)}`}</title>
                  </rect>
                </g>
              );
            })
          : (
            <>
              <path d={line} fill="none" stroke="var(--color-chart)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {points.map((p, i) => (
                <circle key={p.label} cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 4.5 : 10} fill={i === points.length - 1 ? "var(--color-chart)" : "transparent"}>
                  <title>{`${p.label}: ${format(p.value)}`}</title>
                </circle>
              ))}
            </>
          )}
        {last && (
          <text x={Math.min(x(points.length - 1), W - pad.r - 2)} y={y(last.value) - 8} textAnchor="end" fontSize="11" fontWeight="700" fill="var(--color-fg)">
            {format(last.value)}
          </text>
        )}
      </svg>
      )}
    </figure>
  );
}
