import type { InkPoint, InkStroke } from './handwrittenDigits';

const EPSILON = 1e-7;
const samePoint = (a: InkPoint, b: InkPoint): boolean => Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;

function distanceToSweepSquared(p: InkPoint, from: InkPoint, to: InkPoint): number {
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - from.x) * dx + (p.y - from.y) * dy) / length)) : 0;
  return (p.x - from.x - t * dx) ** 2 + (p.y - from.y - t * dy) ** 2;
}

/** Clip red ink against the capsule swept by the nozzle, preserving un-erased fragments. */
export function eraseInkAlongPath(strokes: InkStroke[], from: InkPoint, to: InkPoint, radius: number): InkStroke[] {
  if (!Number.isFinite(radius) || radius <= 0) return strokes;
  const result: InkStroke[] = [];
  const radiusSquared = radius * radius;
  const outside = (p: InkPoint): boolean => distanceToSweepSquared(p, from, to) > radiusSquared + EPSILON;
  for (const stroke of strokes) {
    if (stroke.length === 1) { if (outside(stroke[0])) result.push([{ ...stroke[0] }]); continue; }
    let fragment: InkStroke = [];
    const flush = (): void => { if (fragment.length) result.push(fragment); fragment = []; };
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1], b = stroke[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared < EPSILON) continue;
      const pointAt = (t: number): InkPoint => ({ x: a.x + dx * t, y: a.y + dy * t });
      const cuts = [0, 1];
      const addCut = (t: number): void => { if (t > EPSILON && t < 1 - EPSILON) cuts.push(t); };
      // End disks and the two parallel sides contain every capsule-boundary crossing.
      for (const center of [from, to]) {
        const ox = a.x - center.x, oy = a.y - center.y;
        const linear = 2 * (ox * dx + oy * dy);
        const discriminant = linear * linear - 4 * lengthSquared * (ox * ox + oy * oy - radiusSquared);
        if (discriminant >= 0) {
          const root = Math.sqrt(discriminant);
          addCut((-linear - root) / (2 * lengthSquared));
          addCut((-linear + root) / (2 * lengthSquared));
        }
      }
      const sx = to.x - from.x, sy = to.y - from.y;
      const slope = sx * dy - sy * dx;
      if (Math.abs(slope) > EPSILON) {
        const offset = sx * (a.y - from.y) - sy * (a.x - from.x);
        const edge = radius * Math.hypot(sx, sy);
        addCut((edge - offset) / slope); addCut((-edge - offset) / slope);
      }
      cuts.sort((x, y) => x - y);
      // Merge consecutive visible intervals so extra geometric cuts do not add ink points.
      let visibleStart: number | null = null;
      for (let j = 1; j < cuts.length; j++) {
        const start = cuts[j - 1], end = cuts[j];
        if (end - start < EPSILON) continue;
        if (outside(pointAt((start + end) / 2))) {
          if (visibleStart === null) visibleStart = start;
        } else {
          if (visibleStart !== null) {
            const first = pointAt(visibleStart);
            if (!fragment.length || !samePoint(fragment[fragment.length - 1], first)) { flush(); fragment.push(first); }
            fragment.push(pointAt(start));
            visibleStart = null;
          }
          flush();
        }
      }
      if (visibleStart !== null) {
        const first = pointAt(visibleStart);
        if (!fragment.length || !samePoint(fragment[fragment.length - 1], first)) { flush(); fragment.push(first); }
        fragment.push({ ...b });
      }
    }
    flush();
  }
  return result;
}
