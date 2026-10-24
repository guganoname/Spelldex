/** Minimal price sparkline (inline SVG, no chart library). Points: [dayOffset <= 0, eur]. */
export function Sparkline({ points, height = 48 }: { points: [number, number][]; height?: number }) {
  const w = 280;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (x: number) => (x1 === x0 ? w : ((x - x0) / (x1 - x0)) * w);
  const sy = (y: number) => (y1 === y0 ? height / 2 : height - 4 - ((y - y0) / (y1 - y0)) * (height - 8));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('');
  const last = ys.at(-1)!;
  const first = ys[0]!;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img"
      aria-label={`Preis von ${first.toFixed(2)} € auf ${last.toFixed(2)} €`}>
      <path d={d} fill="none" stroke="var(--sd-rune-glow)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
