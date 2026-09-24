// Import the user's video artwork and pack its original ink glyphs for Cocos.
// ImageGen supplies local inpainting for the paper, clock and removed UI artwork.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { mathUuid } from './math_exam_authoring.mjs';
const require = createRequire(import.meta.url);
const sharp = require(process.env.MATH_EXAM_SHARP_PATH || '/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const source = 'docs/reference/math-exam';
const output = 'assets/res/mathExamFeed';
fs.mkdirSync(output, { recursive: true });
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const original = await sharp(`${source}/reference.png`).ensureAlpha().raw().toBuffer();
const cleaned = await sharp(`${source}/clean-paper-generated.png`).resize(592, 1280, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
const noCapsule = await sharp(`${source}/menu-removed-generated.png`).resize(592, 1280, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
const noBottle = await sharp(`${source}/bottle-removed-generated.png`).resize(592, 1280, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
const noRecording = await sharp(`${source}/record-button-removed-generated.png`).resize(592, 1280, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
const year2026 = await sharp(`${source}/title-year-2026-generated.png`).resize(592, 1280, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
const noPin = await sharp(`${source}/pin-badge-removed-generated.png`).resize(592, 1280, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
const plate = Buffer.from(original);
// Feather the inpainted areas into the original paper; never resample retained artwork.
for (let y = 0; y < 1280; y++) for (let x = 0; x < 592; x++) {
  const paperEdge = Math.min(x - 16, 337 - x, y - 373, 916 - y);
  const paperWeight = Math.max(0, Math.min(1, paperEdge / 10));
  const clockWeight = Math.max(0, Math.min(1, (27 - Math.hypot(x - 343, y - 49)) / 1.5));
  const weight = Math.max(paperWeight, clockWeight);
  if (!weight) continue;
  const i = (y * 592 + x) * 4;
  for (let c = 0; c < 3; c++) plate[i + c] = Math.round(original[i + c] * (1 - weight) + cleaned[i + c] * weight);
}
// Replace the three-dot/circle capsule using its original local repair patch.
for (let y = 94; y < 153; y++) for (let x = 463; x < 586; x++) {
  const weight = Math.max(0, Math.min(1, Math.min(x - 463, 585 - x, y - 94, 152 - y) / 5));
  const i = (y * 592 + x) * 4;
  for (let c = 0; c < 3; c++) plate[i + c] = Math.round(plate[i + c] * (1 - weight) + noCapsule[i + c] * weight);
}
// The bottle is now a draggable sprite: restore the desk underneath its original resting spot.
for (let y = 948; y < 1241; y++) for (let x = 10; x < 188; x++) {
  const weight = Math.max(0, Math.min(1, Math.min(x - 10, 187 - x, y - 948, 1240 - y) / 8));
  const i = (y * 592 + x) * 4;
  for (let c = 0; c < 3; c++) plate[i + c] = Math.round(plate[i + c] * (1 - weight) + noBottle[i + c] * weight);
}
// Remove the baked-in recording icon, blending only its small background patch.
for (let y = 106; y < 205; y++) for (let x = 20; x < 132; x++) {
  const weight = Math.max(0, Math.min(1, Math.min(x - 20, 131 - x, y - 106, 204 - y) / 6));
  const i = (y * 592 + x) * 4;
  for (let c = 0; c < 3; c++) plate[i + c] = Math.round(plate[i + c] * (1 - weight) + noRecording[i + c] * weight);
}
// Replace only the last year digit, preserving the original title's other pixels.
for (let y = 244; y < 295; y++) for (let x = 133; x < 164; x++) {
  const weight = Math.max(0, Math.min(1, Math.min(x - 133, 163 - x, y - 244, 294 - y) / 2));
  const i = (y * 592 + x) * 4;
  for (let c = 0; c < 3; c++) plate[i + c] = Math.round(plate[i + c] * (1 - weight) + year2026[i + c] * weight);
}
// Remove the separate person/pin badge above the tape roll, including its pale backing.
for (let y = 92; y < 155; y++) for (let x = 402; x < 464; x++) {
  const weight = Math.max(0, Math.min(1, Math.min(x - 402, 463 - x, y - 92, 154 - y) / 4));
  const i = (y * 592 + x) * 4;
  for (let c = 0; c < 3; c++) plate[i + c] = Math.round(plate[i + c] * (1 - weight) + noPin[i + c] * weight);
}
await sharp(plate, { raw: { width: 592, height: 1280, channels: 4 } }).png().toFile(`${output}/video-artwork.png`);
await sharp(`${source}/bottle-cutout-generated.png`).resize(162, 276, { fit: 'fill' }).png().toFile(`${output}/correction-fluid.png`);

// Cell coordinates from the original video, including each glyph's native bearing.
const glyphs = [
  ['0', 'glyphs-12.png', 24, 523], ['1', 'reference.png', 190, 523],
  ['2', 'reference.png', 190, 667], ['3', 'reference.png', 190, 380],
  ['4', 'reference.png', 24, 810], ['5', 'glyphs-12.png', 190, 523],
  ['6', 'glyphs-15.png', 24, 523], ['7', 'reference.png', 190, 810],
  ['8', 'reference.png', 24, 667], ['9', 'reference.png', 24, 380],
  ['+', 'reference.png', 107, 523], ['−', 'reference.png', 107, 380],
  ['×', 'reference.png', 107, 810], ['=', 'reference.png', 273, 380],
];
const width = 83 * glyphs.length, height = 104;
const atlas = Buffer.alloc(width * height * 4);
const definitions = {};
let font = `info face="Video Handwriting" size=104 bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=0,0\ncommon lineHeight=104 base=100 scaleW=${width} scaleH=${height} pages=1 packed=0\npage id=0 file="video-digits.png"\nchars count=${glyphs.length}\n`;
for (let g = 0; g < glyphs.length; g++) {
  const [character, file, left, top] = glyphs[g];
  const pixels = await sharp(`${source}/${file}`).extract({ left, top, width: 83, height }).removeAlpha().raw().toBuffer();
  for (let y = 0; y < height; y++) for (let x = 0; x < 83; x++) {
    const s = (y * 83 + x) * 3;
    const luminance = (pixels[s] + pixels[s + 1] + pixels[s + 2]) / 3;
    const d = (y * width + g * 83 + x) * 4;
    atlas[d] = atlas[d + 1] = atlas[d + 2] = 255;
    atlas[d + 3] = luminance > 215 ? 0 : Math.round(Math.min(1, (242 - luminance) / 181) * 255);
  }
  const id = character.codePointAt(0);
  definitions[id] = { rect: { x: g * 83, y: 0, width: 83, height }, xOffset: 0, yOffset: 0, xAdvance: 83 };
  font += `char id=${id} x=${g * 83} y=0 width=83 height=${height} xoffset=0 yoffset=0 xadvance=83 page=0 chnl=15\n`;
}
await sharp(atlas, { raw: { width, height, channels: 4 } }).png().toFile(`${output}/video-digits.png`);
fs.writeFileSync(`${output}/video-digits.fnt`, font);
save(`${output}/video-digits.fnt.meta`, {
  ver: '1.0.5', importer: 'bitmap-font', imported: true, uuid: mathUuid('video-digits.fnt'), files: ['.json'], subMetas: {},
  userData: { _fntConfig: { commonHeight: 104, fontSize: 104, atlasName: 'video-digits.png', fontDefDictionary: definitions, kerningDict: {} }, fontSize: 104, textureUuid: mathUuid('video-digits.png') },
});
// Generate Cocos image import metadata with an untrimmed sprite frame.
for (const [file, w, h] of [['video-artwork.png', 592, 1280], ['video-digits.png', width, height], ['correction-fluid.png', 162, 276]]) {
  const meta = JSON.parse(fs.readFileSync('assets/res/newMain/main_lobby_background.jpg.meta'));
  const uuid = mathUuid(file), name = file.replace(/\.png$/, '');
  const adapted = JSON.parse(JSON.stringify(meta).replaceAll(meta.uuid, uuid).replaceAll('main_lobby_background', name));
  adapted.files = ['.png', '.json'];
  adapted.userData.hasAlpha = true;
  const sprite = adapted.subMetas.f9941.userData;
  Object.assign(sprite, { width: w, height: h, rawWidth: w, rawHeight: h, trimX: 0, trimY: 0, trimType: 'none' });
  sprite.vertices.rawPosition = [-w/2,-h/2,0,w/2,-h/2,0,-w/2,h/2,0,w/2,h/2,0];
  sprite.vertices.uv = [0,h,w,h,0,0,w,0];
  sprite.vertices.minPos = [-w/2,-h/2,0]; sprite.vertices.maxPos = [w/2,h/2,0];
  save(`${output}/${file}.meta`, adapted);
}
console.log('Original video artwork and 14 original glyphs imported.');
