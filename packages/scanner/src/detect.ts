/* eslint-disable @typescript-eslint/no-explicit-any */
import { CARD_H, CARD_W } from '@spelldex/shared/scan';

/** OpenCV.js module (no official types). */
export type CV = any;

export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const CARD_ASPECT = 63 / 88; // width / height
const DETECT_MAX_SIDE = 480;
/** Smallest card we look for, as a fraction of the frame (a card about 30 cm away). */
const MIN_AREA = 0.035;

type Pt = [number, number];
/** Card corners in frame pixels: TL, TR, BR, BL in card orientation. */
export type Corners = [Pt, Pt, Pt, Pt];

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Order 4 points TL, TR, BR, BL around their centroid, then rotate so the card is portrait. */
export function orderQuad(pts: Pt[]): Corners {
  const cx = pts.reduce((s, p) => s + p[0], 0) / 4;
  const cy = pts.reduce((s, p) => s + p[1], 0) / 4;
  const sorted = [...pts].sort(
    (a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx),
  );
  // atan2 order starting near -pi is roughly TL, TR, BR, BL in image coords (y down).
  // Start at the point with the smallest x+y.
  let start = 0;
  for (let i = 1; i < 4; i++) if (sorted[i]![0] + sorted[i]![1] < sorted[start]![0] + sorted[start]![1]) start = i;
  let q = [0, 1, 2, 3].map((k) => sorted[(start + k) % 4]!) as Corners;
  const top = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  const side = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  if (top > side) q = [q[3], q[0], q[1], q[2]]; // card lies sideways: rotate 90 deg
  return q;
}

function quadArea(q: Pt[]): number {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i]!, n = q[(i + 1) % 4]!;
    a += p[0] * n[1] - n[0] * p[1];
  }
  return Math.abs(a) / 2;
}

function isConvex(q: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!, b = q[(i + 1) % 4]!, c = q[(i + 2) % 4]!;
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const s = Math.sign(z);
    if (s === 0) return false;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/**
 * Fraction of the quad's outline that lies on edge pixels, worst side.
 * A real card has an edge along all four sides; quads glued together from
 * background clutter usually miss at least one.
 */
function edgeSupport(edges: any, q: Pt[]): number {
  const w = edges.cols, h = edges.rows, d: Uint8Array = edges.data;
  let worst = 1;
  for (let s = 0; s < 4; s++) {
    const a = q[s]!, b = q[(s + 1) % 4]!;
    const steps = Math.max(8, Math.round(dist(a, b) / 3));
    let hit = 0, total = 0;
    for (let k = 1; k < steps; k++) {
      const x = Math.round(a[0] + ((b[0] - a[0]) * k) / steps);
      const y = Math.round(a[1] + ((b[1] - a[1]) * k) / steps);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      total++;
      // Contours of the dilated edge map sit 1-2 px off the true edge: allow a small window.
      let on = false;
      for (let dy = -2; dy <= 2 && !on; dy++)
        for (let dx = -2; dx <= 2 && !on; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && d[yy * w + xx]) on = true;
        }
      if (on) hit++;
    }
    // Sides outside the frame give no evidence either way.
    worst = Math.min(worst, total < 4 ? 0.5 : hit / total);
  }
  return worst;
}

/** How card-like is this quad? 0 = reject. Prefers big, well-supported quads with a 63:88 aspect. */
function scoreQuad(q: Pt[], frameArea: number, edges: any): number {
  if (!isConvex(q)) return 0;
  const area = quadArea(q);
  const rel = area / frameArea;
  if (rel < MIN_AREA || rel > 0.97) return 0;
  const o = orderQuad(q);
  const w = (dist(o[0], o[1]) + dist(o[3], o[2])) / 2;
  const h = (dist(o[0], o[3]) + dist(o[1], o[2])) / 2;
  const aspect = w / h;
  // Perspective skews the apparent aspect; accept a generous band.
  const err = Math.abs(Math.log(aspect / CARD_ASPECT));
  if (err > 0.35) return 0;
  // Opposite sides should be roughly parallel / similar length.
  const skew = Math.max(dist(o[0], o[1]) / dist(o[3], o[2]), dist(o[0], o[3]) / dist(o[1], o[2]));
  const skewInv = Math.max(dist(o[3], o[2]) / dist(o[0], o[1]), dist(o[1], o[2]) / dist(o[0], o[3]));
  if (Math.max(skew, skewInv) > 1.6) return 0;
  const support = edgeSupport(edges, q);
  if (support < 0.55) return 0;
  return rel * (1 - err) * support * support;
}

interface Cand { quad: Pt[]; score: number; area: number }

/** Collect every card-like 4-corner candidate from a binary edge/threshold image. */
function quadsInBinary(cv: CV, bin: any, frameArea: number, edges: any, found: Cand[]): void {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(bin, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const area = cv.contourArea(c);
    if (area < frameArea * MIN_AREA * 0.8) { c.delete(); continue; }
    const hull = new cv.Mat();
    cv.convexHull(c, hull, false, true);
    const peri = cv.arcLength(hull, true);
    const candidates: Pt[][] = [];
    for (const eps of [0.02, 0.035, 0.05]) {
      const approx = new cv.Mat();
      cv.approxPolyDP(hull, approx, eps * peri, true);
      if (approx.rows === 4) {
        const d = approx.data32S;
        candidates.push([[d[0], d[1]], [d[2], d[3]], [d[4], d[5]], [d[6], d[7]]]);
        approx.delete();
        break;
      }
      approx.delete();
    }
    // Rounded corners or a missing corner: fall back to the minimum-area rectangle
    // if the contour fills it well.
    if (candidates.length === 0) {
      const rect = cv.minAreaRect(hull);
      const rectArea = rect.size.width * rect.size.height;
      if (rectArea > 0 && cv.contourArea(hull) / rectArea > 0.9) {
        const pts = cv.RotatedRect.points(rect) as { x: number; y: number }[];
        candidates.push(pts.map((p) => [p.x, p.y] as Pt));
      }
    }
    for (const q of candidates) {
      const s = scoreQuad(q, frameArea, edges);
      if (s > 0) found.push({ quad: q, score: s, area: quadArea(q) });
    }
    hull.delete();
    c.delete();
  }
  contours.delete();
  hierarchy.delete();
}

function insideConvex(q: Pt[], p: Pt, tol: number): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!, b = q[(i + 1) % 4]!;
    const z = ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / (dist(a, b) || 1);
    if (Math.abs(z) <= tol) continue;
    const sg = Math.sign(z);
    if (sign === 0) sign = sg;
    else if (sg !== sign) return false;
  }
  return true;
}

/**
 * Find the card outline. Two complementary strategies on a downscaled frame:
 * edges (works on most tables) and Otsu threshold (dark border on a light
 * surface or vice versa, robust to sleeves' soft edges). Returns corners in
 * full-frame pixels, or null.
 */
export function detectCandidates(cv: CV, src: any, maxCandidates = 3): Corners[] {
  const scale = Math.min(1, DETECT_MAX_SIDE / Math.max(src.cols, src.rows));
  const small = new cv.Mat();
  cv.resize(src, small, new cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale)), 0, 0, cv.INTER_AREA);
  const gray = new cv.Mat();
  cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
  const frameArea = small.cols * small.rows;

  // Edge strategy, thresholds from the median brightness.
  const edges = new cv.Mat();
  const med = cv.mean(gray)[0];
  cv.Canny(gray, edges, Math.max(10, 0.4 * med), Math.min(255, 1.0 * med + 40));
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  cv.dilate(edges, edges, kernel);
  const found: Cand[] = [];
  quadsInBinary(cv, edges, frameArea, edges, found);

  // Threshold strategy, both polarities.
  const bin = new cv.Mat();
  cv.threshold(gray, bin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  quadsInBinary(cv, bin, frameArea, edges, found);
  cv.bitwise_not(bin, bin);
  quadsInBinary(cv, bin, frameArea, edges, found);

  // Local-contrast strategy: most cards have a dark (rarely white) border that is
  // darker than everything right next to it, whatever the table or clutter does.
  // The border ring's outer contour is the card, its hole the inner frame.
  const block = Math.max(15, Math.round(Math.min(small.cols, small.rows) / 12) | 1);
  for (const pol of [cv.THRESH_BINARY_INV, cv.THRESH_BINARY]) {
    cv.adaptiveThreshold(gray, bin, 255, cv.ADAPTIVE_THRESH_MEAN_C, pol, block, pol === cv.THRESH_BINARY_INV ? 8 : -8);
    quadsInBinary(cv, bin, frameArea, edges, found);
  }

  small.delete(); gray.delete(); edges.delete(); kernel.delete(); bin.delete();

  // Promote enclosing quads: a card's inner frame line is itself a card-shaped quad.
  found.sort((a, b) => b.score - a.score);
  const promoted = found.map((c) => {
    let best = c;
    for (const o of found)
      if (o.area > best.area * 1.03 && o.area < best.area * 1.8 && best.quad.every((p) => insideConvex(o.quad, p, 2))) best = o;
    return best;
  });
  // Distinct candidates, best first.
  const out: Corners[] = [];
  const diag = Math.hypot(src.cols, src.rows);
  for (const c of promoted) {
    const q = orderQuad(c.quad.map(([x, y]) => [x / scale, y / scale] as Pt));
    if (out.some((o) => o.every((p, i) => dist(p, q[i]!) < diag * 0.03))) continue;
    out.push(q);
    if (out.length >= maxCandidates) break;
  }
  return out.map((q) => refineQuad(cv, src, q));
}

/** Best card outline in the frame, or null. */
export function detectCard(cv: CV, src: any): Corners | null {
  return detectCandidates(cv, src, 1)[0] ?? null;
}

/**
 * Sub-pixel refinement on the full-resolution frame. For each side, find the
 * strongest luminance step along the side's normal at ~24 points (skipping the
 * rounded corners), fit a line through them and intersect neighbouring lines.
 * The intersections are the virtual sharp corners, which is exactly the extent
 * of a Scryfall image, so camera and index line up to about a pixel.
 */
export function refineQuad(cv: CV, src: any, quad: Corners): Corners {
  const gray = refineGray(cv, src);
  const W = gray.cols, H = gray.rows, g: Uint8Array = gray.data;
  const at = (x: number, y: number) => {
    // bilinear sample
    const x0 = Math.floor(x), y0 = Math.floor(y);
    if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) return NaN;
    const fx = x - x0, fy = y - y0, i = y0 * W + x0;
    return (g[i]! * (1 - fx) + g[i + 1]! * fx) * (1 - fy) + (g[i + W]! * (1 - fx) + g[i + W + 1]! * fx) * fy;
  };
  const cx = quad.reduce((a, p) => a + p[0], 0) / 4, cy = quad.reduce((a, p) => a + p[1], 0) / 4;
  const lines: { px: number; py: number; dx: number; dy: number }[] = [];
  for (let s = 0; s < 4; s++) {
    const a = quad[s]!, b = quad[(s + 1) % 4]!;
    const len = dist(a, b);
    const tx = (b[0] - a[0]) / len, ty = (b[1] - a[1]) / len;
    let nx = -ty, ny = tx;
    // normal pointing outwards
    if (nx * ((a[0] + b[0]) / 2 - cx) + ny * ((a[1] + b[1]) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
    const reach = Math.max(4, len * 0.02);
    const pts: Pt[] = [];
    for (let k = 0; k < 24; k++) {
      const t = 0.12 + (0.76 * k) / 23;
      const bx = a[0] + (b[0] - a[0]) * t, by = a[1] + (b[1] - a[1]) * t;
      let bestOff = 0, bestG = 0;
      for (let o = -reach; o <= reach; o += 0.5) {
        const g1 = at(bx + nx * (o + 1), by + ny * (o + 1)), g0 = at(bx + nx * (o - 1), by + ny * (o - 1));
        const grad = Math.abs(g1 - g0);
        if (grad > bestG) { bestG = grad; bestOff = o; }
      }
      if (bestG >= 12) pts.push([bx + nx * bestOff, by + ny * bestOff]);
    }
    if (pts.length < 8) return quad;
    // Fit, drop the worst third, fit again.
    let fit = fitLine(pts);
    const resid = pts.map((p) => Math.abs((p[0] - fit.px) * -fit.dy + (p[1] - fit.py) * fit.dx));
    const cut = [...resid].sort((x, y) => x - y)[Math.floor(pts.length * 0.66)]!;
    fit = fitLine(pts.filter((_, i) => resid[i]! <= cut));
    lines.push(fit);
  }
  const out: Pt[] = [];
  for (let s = 0; s < 4; s++) {
    const l1 = lines[(s + 3) % 4]!, l2 = lines[s]!; // corner s joins side s-1 and side s
    const den = l1.dx * l2.dy - l1.dy * l2.dx;
    if (Math.abs(den) < 1e-6) return quad;
    const t = ((l2.px - l1.px) * l2.dy - (l2.py - l1.py) * l2.dx) / den;
    const p: Pt = [l1.px + l1.dx * t, l1.py + l1.dy * t];
    if (dist(p, quad[s]!) > Math.max(12, dist(quad[0], quad[2]) * 0.04)) return quad;
    out.push(p);
  }
  return out as Corners;
}

// Blurred grey frame for refineQuad, shared by all hypotheses of one frame. The
// previous frame's copy is freed when the next frame comes in.
let refineCache: { src: any; gray: any } | null = null;
function refineGray(cv: CV, src: any): any {
  if (refineCache && refineCache.src === src) return refineCache.gray;
  refineCache?.gray.delete();
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0);
  refineCache = { src, gray };
  return gray;
}

function fitLine(pts: Pt[]): { px: number; py: number; dx: number; dy: number } {
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { px: mx, py: my, dx: Math.cos(ang), dy: Math.sin(ang) };
}

/** Centered card-shaped box the UI draws as a guide; used when no outline is found. */
export function guideQuad(width: number, height: number, fill = 0.8): Corners {
  let h = height * fill;
  let w = h * CARD_ASPECT;
  if (w > width * fill) { w = width * fill; h = w / CARD_ASPECT; }
  const x0 = (width - w) / 2, y0 = (height - h) / 2;
  return [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
}

/** Perspective-correct the quad into a CARD_W x CARD_H RGBA image (the Scryfall "normal" size). */
export function warpCard(cv: CV, src: any, quad: Corners, w = CARD_W, h = CARD_H, smooth = false): Uint8ClampedArray {
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, quad.flat());
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
  const m = cv.getPerspectiveTransform(from, to);
  const out = new cv.Mat();
  // Nearest neighbour for hashing: bilinear is ~6x slower in OpenCV.js (17 vs 3 ms)
  // and the hashes box-filter the image down by 5-14x anyway, so accuracy is the same.
  // `smooth` (bilinear) is for OCR, which reads small print at 3x.
  cv.warpPerspective(src, out, m, new cv.Size(w, h), smooth ? cv.INTER_LINEAR : cv.INTER_NEAREST, cv.BORDER_REPLICATE);
  const data = new Uint8ClampedArray(out.data);
  from.delete(); to.delete(); m.delete(); out.delete();
  return data;
}

/**
 * Map a rectangle given in card coordinates (0..1, may extend outside) to a
 * quad in frame pixels, following the card's perspective.
 */
export function cardRectToQuad(cv: CV, quad: Corners, r: { x: number; y: number; w: number; h: number }): Corners {
  const fromCard = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 1, 0, 1, 1, 0, 1]);
  const toFrame = cv.matFromArray(4, 1, cv.CV_32FC2, quad.flat());
  const H = cv.getPerspectiveTransform(fromCard, toFrame);
  const hd = H.data64F;
  const map = (u: number, v: number): Pt => {
    const z = hd[6] * u + hd[7] * v + hd[8];
    return [(hd[0] * u + hd[1] * v + hd[2]) / z, (hd[3] * u + hd[4] * v + hd[5]) / z];
  };
  fromCard.delete(); toFrame.delete(); H.delete();
  return [map(r.x, r.y), map(r.x + r.w, r.y), map(r.x + r.w, r.y + r.h), map(r.x, r.y + r.h)];
}

/**
 * When the outer edge merges with background clutter, the detector often
 * locks onto the card's inner frame line instead. These are the outlines the
 * card would have if the quad was such an inner line (2015+ black border,
 * older/white borders), refined onto real edges. The scanner tries them when
 * the first quad does not match well and keeps whichever matches best.
 */
export function outerHypotheses(cv: CV, src: any, quad: Corners): Corners[] {
  return [
    [0.048, 0.034],
    [0.075, 0.055],
  ].map(([ex, ey]) => {
    const q = cardRectToQuad(cv, quad, { x: -ex!, y: -ey!, w: 1 + 2 * ex!, h: 1 + 2 * ey! });
    return refineQuad(cv, src, q);
  });
}

/**
 * The illustration box of the 2015+ frame, in card coordinates. Its outline is
 * often the strongest rectangle on the card and is also roughly card-shaped
 * once rotated, so the detector can mistake it for the card.
 */
export const ART_BOX = { x: 0.082, y: 0.113, w: 0.836, h: 0.443 };

/**
 * Card outlines assuming `quad` (portrait-ordered) is really the art box,
 * lying sideways. Both 90 degree turns are returned since we cannot tell which way is up.
 */
export function artBoxHypotheses(cv: CV, src: any, quad: Corners): Corners[] {
  const a = ART_BOX;
  const rect = { x: -a.x / a.w, y: -a.y / a.h, w: 1 / a.w, h: 1 / a.h };
  // Rotate the corner order so the long side becomes the top edge.
  const turns: Corners[] = [
    [quad[1], quad[2], quad[3], quad[0]],
    [quad[3], quad[0], quad[1], quad[2]],
  ];
  return turns.map((t) => refineQuad(cv, src, orderQuad(cardRectToQuad(cv, t, rect))));
}

/** Warp only a sub-rectangle of the card (fractions), at a given output size. Used for OCR. */
export function warpCardRegion(
  cv: CV, src: any, quad: Corners,
  region: { x: number; y: number; w: number; h: number },
  outW: number, outH: number,
): Uint8ClampedArray {
  return warpCard(cv, src, cardRectToQuad(cv, quad, region), outW, outH, true);
}
