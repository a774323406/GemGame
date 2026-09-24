/** Small offline recognizer for upright handwritten decimal digits. No answer hint is accepted. */
export type InkPoint = { x: number; y: number };
export type InkStroke = InkPoint[];
export type HandwritingResult = { text: string; confidence: number };

function narrowArchTwo(foot: number): [string, number[][][]] {
  // Vary the foot independently of the arch: whole-glyph width normalization
  // cannot account for a longer finishing bar without also stretching the arch.
  return ['2', [[[0,5],[17,0],[31,7],[44,24],[47,43],[35,61],[0,98],[foot,100]]]];
}

// Normalized pen paths, y increases downward. Multiple forms cover open/closed 4,
// straight/serif 1, barred 7, and common continuous and lifted-pen forms.
const FORMS: [string, number[][][]][] = [
  ['0', [[[50,0],[22,4],[5,27],[0,57],[10,85],[30,100],[60,97],[78,77],[82,43],[70,12],[50,0]]]],
  ['0', [[[40,0],[10,15],[0,50],[10,85],[40,100],[70,85],[80,50],[70,15],[40,0]]]],
  ['1', [[[30,0],[30,100]]]],
  ['1', [[[5,20],[30,0],[30,100]]]],
  ['1', [[[5,20],[30,0],[30,100]],[[10,100],[55,100]]]],
  ['2', [[[0,20],[15,2],[42,0],[64,12],[67,30],[55,49],[0,100],[72,100]]]],
  ['2', [[[0,18],[22,0],[55,5],[66,25],[55,50],[5,90],[0,100],[45,95],[75,100]]]],
  // A short upper hook and a long foot are common in quick handwritten 2s.
  ['2', [[[28,8],[44,0],[63,4],[72,18],[69,33],[50,54],[0,97],[80,100]]]],
  // Some 2s start near the top of a narrow arch, with the foot extending well
  // past that arch. The diagonal return distinguishes this form from serif 1.
  narrowArchTwo(65), narrowArchTwo(85), narrowArchTwo(110),
  ['3', [[[0,10],[30,0],[60,10],[65,25],[52,42],[28,48],[52,51],[69,66],[65,85],[45,100],[15,100],[0,88]]]],
  ['3', [[[0,0],[64,0],[28,43],[55,43],[70,67],[62,90],[40,100],[5,94]]]],
  ['4', [[[52,0],[0,60],[75,60]],[[55,0],[55,100]]]],
  ['4', [[[5,0],[0,58],[70,58]],[[55,0],[55,100]]]],
  ['4', [[[60,100],[60,0],[0,65],[80,65]]]],
  ['4', [[[25,0],[0,60],[100,50]],[[55,0],[55,100]]]],
  ['5', [[[70,0],[10,0],[5,45],[34,39],[60,45],[72,64],[67,84],[46,100],[18,100],[0,87]]]],
  ['5', [[[70,0],[10,0]],[[10,0],[5,47],[38,40],[64,51],[68,79],[50,97],[20,100],[0,89]]]],
  ['6', [[[64,0],[38,8],[16,30],[3,58],[0,79],[15,98],[44,100],[66,85],[69,65],[56,48],[34,45],[14,52],[2,69]]]],
  ['6', [[[65,0],[30,18],[5,53],[0,80],[20,100],[50,97],[67,78],[56,58],[30,54],[3,73]]]],
  ['7', [[[0,0],[72,0],[45,45],[20,100]]]],
  ['7', [[[0,0],[72,0],[45,45],[20,100]],[[18,50],[66,50]]]],
  ['8', [[[36,48],[8,28],[10,8],[33,0],[58,5],[68,22],[55,39],[36,48],[5,68],[0,87],[27,100],[53,98],[72,82],[65,63],[36,48]]]],
  ['8', [[[35,48],[8,30],[10,10],[35,0],[62,12],[64,30],[35,48]],[[35,48],[5,68],[5,88],[35,100],[65,88],[65,68],[35,48]]]],
  // A cursive 8 can have a larger upper loop and a small, offset lower loop.
  ['8', [[[28,12],[47,2],[68,3],[76,13],[60,30],[36,55],[9,85],[0,98],[25,100],[44,93],[34,79],[17,55],[17,27],[22,13],[28,12]]]],
  ['9', [[[67,44],[46,52],[20,50],[2,34],[4,15],[24,0],[52,0],[69,16],[70,42],[57,75],[36,100]]]],
  ['9', [[[60,40],[40,50],[13,42],[0,22],[15,0],[44,0],[62,18],[60,100]]]],
  // A tilted upper loop may have a flatter bottom and be closed before the
  // straight stem is drawn. Keep its curved top distinct from a closed 4.
  ['9', [[[58,8],[38,0],[23,2],[13,18],[4,39],[0,55],[19,58],[43,50],[57,35],[60,9],[58,8]],[[57,8],[55,54],[53,100]]]],
];

function bounds(strokes: InkStroke[]) {
  const points = ([] as InkPoint[]).concat(...strokes);
  return { minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
    minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)) };
}

function cloud(strokes: InkStroke[], normalizeAspect = false): InkPoint[] {
  const b = bounds(strokes);
  const scale = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1);
  const scaleY = normalizeAspect ? Math.max(b.maxY - b.minY, 1) : scale;
  // A second representation removes handwriting width differences. The floor
  // avoids magnifying tiny lateral wobble in a mostly vertical stroke such as 1.
  const scaleX = normalizeAspect ? Math.max(b.maxX - b.minX, scaleY * 0.3) : scale;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const segments: { a: InkPoint; b: InkPoint; length: number }[] = [];
  let total = 0;
  for (const stroke of strokes) for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1], p = stroke[i];
    const length = Math.hypot(p.x - a.x, p.y - a.y);
    if (length > 0) { segments.push({ a, b: p, length }); total += length; }
  }
  if (!segments.length) return [];
  const result: InkPoint[] = [];
  let cursor = 0, walked = 0;
  for (let i = 0; i < 64; i++) {
    const distance = total * i / 63;
    while (cursor < segments.length - 1 && walked + segments[cursor].length < distance) walked += segments[cursor++].length;
    const s = segments[cursor];
    const t = Math.min(1, (distance - walked) / s.length);
    result.push({ x: (s.a.x + (s.b.x - s.a.x) * t - cx) / scaleX,
      y: (s.a.y + (s.b.y - s.a.y) * t - cy) / scaleY });
  }
  return result;
}

function distance(a: InkPoint[], b: InkPoint[]): number {
  let sum = 0;
  for (const p of a) {
    let closest = Infinity;
    for (const q of b) closest = Math.min(closest, (p.x - q.x) ** 2 + (p.y - q.y) ** 2);
    sum += closest;
  }
  return sum / a.length;
}

function isCross(points: InkPoint[]): boolean {
  // Two straight bars crossing through their interiors form + or ×, not a
  // complete digit. Test geometry rather than stroke count so pen lifts and
  // reversed drawing order cannot turn either symbol into 4 or 8.
  const longest = (list: InkPoint[]) => {
    let a = list[0], b = a, length = 0;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const squared = (list[i].x - list[j].x) ** 2 + (list[i].y - list[j].y) ** 2;
      if (squared > length) { a = list[i]; b = list[j]; length = squared; }
    }
    return { a, b, length: Math.sqrt(length) };
  };
  const lineDistance = (p: InkPoint, line: ReturnType<typeof longest>) =>
    Math.abs((line.b.x - line.a.x) * (p.y - line.a.y) - (line.b.y - line.a.y) * (p.x - line.a.x)) / line.length;
  const first = longest(points);
  if (first.length < 0.5) return false;
  const offLine = points.filter(p => lineDistance(p, first) > 0.05);
  if (offLine.length < 4) return false;
  const second = longest(offLine);
  if (second.length < 0.4) return false;
  if (points.some(p => Math.min(lineDistance(p, first), lineDistance(p, second)) > 0.05)) return false;
  const rx = first.b.x - first.a.x, ry = first.b.y - first.a.y;
  const sx = second.b.x - second.a.x, sy = second.b.y - second.a.y;
  const cross = rx * sy - ry * sx;
  if (Math.abs(cross) < first.length * second.length * 0.7) return false;
  const qx = second.a.x - first.a.x, qy = second.a.y - first.a.y;
  const t = (qx * sy - qy * sx) / cross, u = (qx * ry - qy * rx) / cross;
  return t > 0.2 && t < 0.8 && u > 0.2 && u < 0.8;
}

const TEMPLATES = FORMS.map(([digit, paths]) => {
  const strokes = paths.map(s => s.map(([x, y]) => ({ x, y })));
  return { digit, points: cloud(strokes), aspectPoints: cloud(strokes, true) };
});

function recognizeDigit(strokes: InkStroke[]): { digit: string; confidence: number } | null {
  const b = bounds(strokes);
  if (b.maxY - b.minY < 12 || b.maxX - b.minX > (b.maxY - b.minY) * 1.8) return null;
  const points = cloud(strokes);
  if (!points.length || isCross(points)) return null;
  const aspectPoints = cloud(strokes, true);
  const scores = new Map<string, number>();
  for (const template of TEMPLATES) {
    const regularScore = Math.sqrt((distance(points, template.points) + distance(template.points, points)) / 2);
    const aspectScore = Math.sqrt((distance(aspectPoints, template.aspectPoints) + distance(template.aspectPoints, aspectPoints)) / 2);
    // Keep the original fit (especially useful for 1) and permit a width-adjusted
    // match with a small penalty. Acceptance and ambiguity thresholds stay strict.
    const score = Math.min(regularScore, aspectScore + 0.012);
    scores.set(template.digit, Math.min(score, scores.get(template.digit) ?? Infinity));
  }
  // Creator's mini-game loose spread transform treats iterators as arrays:
  // [...scores.entries()] becomes [].concat(iterator), breaking the ranking.
  const ranked: [string, number][] = [];
  scores.forEach((score, digit) => ranked.push([digit, score]));
  ranked.sort((a, b) => a[1] - b[1]);
  const [digit, score] = ranked[0];
  if (score > 0.115 || ranked[1][1] - score < 0.008) return null;
  return { digit, confidence: Math.max(0, 1 - score / 0.15) };
}

/** Try two side-by-side glyphs even when their horizontal bounds touch or overlap slightly. */
function recognizePair(strokes: InkStroke[]): { result: HandwritingResult; quality: number } | null {
  const sorted = strokes.slice().sort((a, b) => {
    const left = bounds([a]), right = bounds([b]);
    return left.minX + left.maxX - right.minX - right.maxX;
  });
  let best: { result: HandwritingResult; quality: number } | null = null;
  for (let split = 1; split < sorted.length; split++) {
    const left = sorted.slice(0, split), right = sorted.slice(split);
    const a = bounds(left), b = bounds(right);
    const ha = a.maxY - a.minY, hb = b.maxY - b.minY;
    const minHeight = Math.min(ha, hb);
    const minWidth = Math.min(a.maxX - a.minX, b.maxX - b.minX);
    // Digits share a line and occupy separate columns. This keeps the two loops of
    // an 8 and the overlapping strokes of a 4 together, while allowing a slanted
    // digit or long finishing stroke to extend slightly into its neighbour.
    if (minHeight < 12 || minHeight < Math.max(ha, hb) * 0.5) continue;
    if (Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) < minHeight * 0.5) continue;
    // Bounding boxes include a 2's long foot and a cursive 8's leaning loops.
    // Allow those overhangs, but keep distinct horizontal centers and at least
    // half of the narrower glyph's width outside the neighbour's column.
    const maxWidth = Math.max(a.maxX - a.minX, b.maxX - b.minX);
    if ((b.minX + b.maxX - a.minX - a.maxX) / 2 < maxWidth * 0.5) continue;
    const maxOverlap = Math.min(minHeight * 0.4, Math.max(minWidth * 0.5, minHeight * 0.04));
    if (a.maxX - b.minX > maxOverlap) continue;
    // A pen lift can divide one continuous line into fragments. Do not invent
    // two digits by cutting at their shared endpoint (e.g. a zigzag into 8 + 1).
    const joinTolerance = Math.max(0.5, minHeight * 0.015);
    const joined = left.some(s => right.some(t => [s[0], s[s.length - 1]].some(p =>
      [t[0], t[t.length - 1]].some(q => Math.hypot(p.x - q.x, p.y - q.y) <= joinTolerance))));
    if (joined) continue;
    const first = recognizeDigit(left), second = recognizeDigit(right);
    if (!first || !second) continue;
    const quality = (first.confidence + second.confidence) / 2;
    if (!best || quality > best.quality) best = {
      result: { text: first.digit + second.digit, confidence: Math.min(first.confidence, second.confidence) },
      quality,
    };
  }
  return best;
}

/** Recognizes up to two digits using both stroke geometry and independent glyph matches. */
export function recognizeHandwriting(input: InkStroke[]): HandwritingResult | null {
  if (!input.length || input.length > 24 || input.some(s => s.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)))) return null;
  const strokes = input.filter(s => s.length >= 2);
  if (!strokes.length || strokes.reduce((n, s) => n + s.length, 0) > 4096) return null;
  const overall = bounds(strokes);
  const tolerance = Math.max(2, (overall.maxY - overall.minY) * 0.08);
  const sorted = strokes.map(s => ({ stroke: s, ...bounds([s]) })).sort((a, b) => a.minX - b.minX);
  const groups: { strokes: InkStroke[]; maxX: number }[] = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (last && item.minX <= last.maxX + tolerance) {
      last.strokes.push(item.stroke);
      last.maxX = Math.max(last.maxX, item.maxX);
    } else groups.push({ strokes: [item.stroke], maxX: item.maxX });
  }
  if (groups.length > 2) return null;
  if (groups.length === 1) {
    const single = recognizeDigit(strokes);
    const pair = recognizePair(strokes);
    // Splitting must explain the ink better, not just increase the digit count.
    // Compare mean fit; using the weakest digit alone unfairly penalizes pairs.
    if (pair && (!single || pair.quality > single.confidence + 0.06)) return pair.result;
    return single ? { text: single.digit, confidence: single.confidence } : null;
  }
  let text = '', confidence = 1;
  for (const group of groups) {
    const result = recognizeDigit(group.strokes);
    if (!result) return null;
    text += result.digit;
    confidence = Math.min(confidence, result.confidence);
  }
  return { text, confidence };
}
