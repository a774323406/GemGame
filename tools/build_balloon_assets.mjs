// Local sprite preparation approved by the user after imagegen returned baked checkerboards.
// Generated originals are never modified. Only the new balloonWheelFeed asset folder is written.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { assetUuid } from './balloon_scene_authoring.mjs';
const require = createRequire(import.meta.url);
const sharp = require(process.env.BALLOON_SHARP_PATH ||
  '/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const output = 'assets/res/balloonWheelFeed';
const generated = '/Users/skyhand/.codex/generated_images/019fc696-6c3a-7ad2-b439-d2b7b892b4bf';
const sources = {
  background: 'exec-fe2d8de0-35fa-4473-8bc4-1a32d276d754.png',
  character: 'exec-9bfa90f2-c5c3-4813-8c2e-83685336ab68.png',
  gun: 'exec-d619e48a-09d8-45de-be8a-1035a5b4c260.png',
  balloon: 'exec-525e37dc-83e5-4ed7-a639-b05c567e7949.png',
};

async function cutout(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info, total = w * h;
  const outside = new Uint8Array(total), queue = new Int32Array(total);
  let head = 0, tail = 0;
  const background = p => {
    const i = p * c, hi = Math.max(data[i], data[i + 1], data[i + 2]), lo = Math.min(data[i], data[i + 1], data[i + 2]);
    // The checkerboard is neutral grey/white. The dark outline protects the white body.
    return hi - lo < 28 && lo > 65;
  };
  function visit(p) { if (!outside[p] && background(p)) { outside[p] = 1; queue[tail++] = p; } }
  for (let x = 0; x < w; x++) { visit(x); visit((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { visit(y * w); visit(y * w + w - 1); }
  while (head < tail) {
    const p = queue[head++], x = p % w;
    if (x) visit(p - 1); if (x + 1 < w) visit(p + 1);
    if (p >= w) visit(p - w); if (p + w < total) visit(p + w);
  }
  // Discard isolated grey checker fragments; retain the connected outlined subject.
  const labels = new Int32Array(total); let largest = 0, largestSize = 0, component = 0;
  for (let seed = 0; seed < total; seed++) {
    if (outside[seed] || labels[seed]) continue;
    component++; head = 0; tail = 0; queue[tail++] = seed; labels[seed] = component;
    const add = p => { if (!outside[p] && !labels[p]) { labels[p] = component; queue[tail++] = p; } };
    while (head < tail) {
      const p = queue[head++], x = p % w;
      if (x) add(p - 1); if (x + 1 < w) add(p + 1);
      if (p >= w) add(p - w); if (p + w < total) add(p + w);
    }
    if (tail > largestSize) { largestSize = tail; largest = component; }
  }
  if (largestSize < total * 0.08 || largestSize > total * 0.85) throw new Error('Unexpected cutout coverage: ' + file);
  const rgba = Buffer.alloc(total * 4);
  let left = w, top = h, right = 0, bottom = 0;
  for (let p = 0; p < total; p++) {
    if (labels[p] !== largest) continue;
    const x = p % w, y = Math.floor(p / w), i = p * 4;
    rgba[i] = data[p * c]; rgba[i + 1] = data[p * c + 1]; rgba[i + 2] = data[p * c + 2]; rgba[i + 3] = 255;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  left = Math.max(0, left - 2); top = Math.max(0, top - 2);
  right = Math.min(w - 1, right + 2); bottom = Math.min(h - 1, bottom + 2);
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 });
}

function svg(size, body) { return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`); }
const sector = (from, to, outer = 306, inner = 153) => {
  const xy = (r, a) => `${310 + r * Math.cos(a * Math.PI / 180)},${310 + r * Math.sin(a * Math.PI / 180)}`;
  return `M ${xy(outer, from)} A ${outer} ${outer} 0 0 1 ${xy(outer, to)} L ${xy(inner, to)} A ${inner} ${inner} 0 0 0 ${xy(inner, from)} Z`;
};
const geometry = {
  'wheel.png': svg(620, Array.from({ length: 12 }, (_, i) => `<path d="${sector(i * 30, (i + 1) * 30)}" fill="${i % 2 ? '#fffefc' : '#2189e8'}"/>`).join('') +
    `<path d="${sector(180, 330)}" fill="#ffffff" opacity=".10"/><circle cx="310" cy="310" r="307" fill="none" stroke="#171b22" stroke-width="4"/><circle cx="310" cy="310" r="152" fill="none" stroke="#171b22" stroke-width="3"/>`),
  'crosshair.png': svg(96, '<g stroke="#bd1714" stroke-width="3" fill="none"><circle cx="48" cy="48" r="31"/><path d="M48 6V34M48 62V90M6 48H34M62 48H90"/></g><g fill="#ee2127" stroke="#851310" stroke-width="1"><path d="M41 2H55L48 34ZM41 94H55L48 62ZM2 41V55L34 48ZM94 41V55L62 48Z"/><circle cx="48" cy="48" r="4"/></g>'),
  'bullet-hole.png': svg(40, '<path d="M20 1L23 10L30 5L29 14L39 15L31 21L36 29L26 28L24 39L18 30L10 36L12 25L2 23L11 18L6 9L16 11Z" fill="#8d9b9e" stroke="#333c3d" stroke-width="1.4"/><circle cx="20" cy="20" r="9" fill="#212d30" stroke="#d5dcd7" stroke-width="2"/><circle cx="20" cy="20" r="6" fill="#080a0b"/>'),
  'burst.png': svg(120, '<path d="M60 3L71 34L97 14L87 44L117 49L90 64L109 91L78 86L70 117L56 90L29 109L33 78L3 69L31 54L12 27L44 33Z" fill="#ffaccb" stroke="#f55791" stroke-width="3"/><path d="M60 23L70 47L98 49L76 66L80 94L58 78L33 91L41 65L20 45L48 45Z" fill="#fff2b3"/>'),
  'skip-icon.png': svg(80, '<g fill="#73d83b" stroke="#397b20" stroke-width="3" stroke-linejoin="round"><path d="M7 8H24L47 40L24 72H7L29 40Z"/><path d="M38 8H55L77 40L55 72H38L60 40Z"/></g><path d="M10 12H21L42 40" fill="none" stroke="#d1fa87" stroke-width="3"/>'),
  'hourglass.png': svg(80, '<path d="M18 8H62V21Q62 28 47 40Q62 51 62 59V72H18V59Q18 51 33 40Q18 28 18 21Z" fill="#d7f6f4" stroke="#885124" stroke-width="4"/><path d="M25 18H55Q55 27 40 36Q25 27 25 18ZM40 46L56 62V66H24V62Z" fill="#eaaa27"/><path d="M40 38V49" stroke="#f6c44b" stroke-width="3"/><g fill="#db9835" stroke="#8d5622" stroke-width="3"><rect x="12" y="3" width="56" height="9" rx="4"/><rect x="12" y="68" width="56" height="9" rx="4"/></g>'),
};

function imageMeta(name, width, height, alpha) {
  const uuid = assetUuid(name), displayName = path.parse(name).name;
  return { ver: '1.0.27', importer: 'image', imported: true, uuid, files: ['.json', path.extname(name)], subMetas: {
    '6c48a': { ver: '1.0.22', importer: 'texture', imported: true, uuid: uuid + '@6c48a', displayName, id: '6c48a', name: 'texture',
      files: ['.json'], subMetas: {}, userData: { wrapModeS: 'clamp-to-edge', wrapModeT: 'clamp-to-edge',
        imageUuidOrDatabaseUri: uuid, isUuid: true, visible: false, minfilter: 'linear', magfilter: 'linear', mipfilter: 'none', anisotropy: 0 } },
    f9941: { ver: '1.0.12', importer: 'sprite-frame', imported: true, uuid: uuid + '@f9941', displayName, id: 'f9941', name: 'spriteFrame',
      files: ['.json'], subMetas: {}, userData: { trimType: 'none', trimThreshold: 1, rotated: false, offsetX: 0, offsetY: 0,
        trimX: 0, trimY: 0, width, height, rawWidth: width, rawHeight: height, borderTop: 0, borderBottom: 0, borderLeft: 0, borderRight: 0,
        packable: false, pixelsToUnit: 100, pivotX: 0.5, pivotY: 0.5, meshType: 0, vertices: {
          rawPosition: [-width/2,-height/2,0,width/2,-height/2,0,-width/2,height/2,0,width/2,height/2,0], indexes: [0,1,2,2,1,3],
          uv: [0,height,width,height,0,0,width,0], nuv: [0,0,1,0,0,1,1,1], minPos: [-width/2,-height/2,0], maxPos: [width/2,height/2,0],
        }, isUuid: true, imageUuidOrDatabaseUri: uuid + '@6c48a', atlasUuid: '' } },
  }, userData: { type: 'sprite-frame', hasAlpha: alpha, fixAlphaTransparencyArtifacts: false, redirect: uuid + '@6c48a' } };
}
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');

fs.mkdirSync(output, { recursive: true });
if (!fs.existsSync(output + '.meta')) writeJson(output + '.meta', { ver: '1.2.0', importer: 'directory', imported: true,
  uuid: assetUuid('directory'), files: [], subMetas: {}, userData: {} });
const rendered = {};
rendered['background.jpg'] = await sharp(path.join(generated, sources.background)).resize(600, 1300, { fit: 'fill' }).jpeg({ quality: 76, mozjpeg: true }).toBuffer();
for (const [key, width, height] of [['character', 403, 534], ['gun', 640, 430], ['balloon', 94, 108]]) {
  const sprite = await cutout(path.join(generated, sources[key]));
  rendered[key + '.png'] = await sprite.resize(width, height, { fit: 'fill' }).png({ palette: true, colours: 192, effort: 10, dither: 0.25 }).toBuffer();
}
for (const [name, source] of Object.entries(geometry)) rendered[name] = await sharp(source).png({ palette: true, colours: 128, effort: 10 }).toBuffer();
for (const [name, bytes] of Object.entries(rendered)) {
  const file = path.join(output, name); fs.writeFileSync(file, bytes);
  const info = await sharp(bytes).metadata();
  writeJson(file + '.meta', imageMeta(name, info.width, info.height, info.hasAlpha));
}

// Bake collision alpha spans once, not a runtime readback (works in Douyin native and WebGL).
const { data, info } = await sharp(rendered['character.png']).ensureAlpha().resize(128, 170).raw().toBuffer({ resolveWithObject: true });
const rows = [];
for (let y = 0; y < info.height; y++) {
  const spans = []; let start = -1;
  for (let x = 0; x <= info.width; x++) {
    const opaque = x < info.width && data[(y * info.width + x) * 4 + 3] >= 160;
    if (opaque && start < 0) start = x;
    if (!opaque && start >= 0) { spans.push(start, x); start = -1; }
  }
  rows.push(spans);
}
const maskName = 'character-mask.json';
fs.writeFileSync(path.join(output, maskName), JSON.stringify({ width: info.width, height: info.height, rows }) + '\n');
writeJson(path.join(output, maskName + '.meta'), { ver: '1.0.0', importer: 'json', imported: true,
  uuid: assetUuid(maskName), files: ['.json'], subMetas: {}, userData: {} });
const totalBytes = Object.values(rendered).reduce((sum, b) => sum + b.length, 0) + fs.statSync(path.join(output, maskName)).size;
console.log(JSON.stringify({ output, totalBytes, assets: Object.fromEntries(Object.entries(rendered).map(([n, b]) => [n, b.length])) }, null, 2));
