import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { uuid } from './truck_stack_ids.mjs';

// Rebuild with: node tools/build_truck_stack_assets.mjs
// SVG stays in this authoring file; only the small PNGs enter the game resources.
const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  sharp = require('/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'assets/res/truckStackFeed');
const templatePath = path.join(root, 'assets/res/foodDeliveryFeed/white.png.meta');
const ink = '#292c29';
const cream = '#fbf7ef';

// Coordinates use the untrimmed PNG's top-left origin. The deck's top edge is
// y=45 from x=30..430; game alignment point (240,45), center-anchor offset (-80,69).
// The truck is 640x228, faces right, and contains no baked ground/background.
const wheel = (cx) => `
  <g transform="translate(${cx} 184)" stroke="${ink}" stroke-width="3.6" stroke-linecap="round">
    <circle r="38" fill="#535b59"/>
    <circle r="26" fill="#a4aaa5"/>
    <circle r="19" fill="#818b85" stroke-width="2.4"/>
    <path d="M0-24V-10 M21-12L9-5 M21 12L9 5 M0 24V10 M-21 12L-9 5 M-21-12L-9-5" fill="none" stroke-width="2.5"/>
    <circle r="8" fill="#bcc1b9" stroke-width="2.5"/>
  </g>`;
const truckArt = `
  <g stroke="${ink}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M36 132H467V172H36Z" fill="#4f5a55"/>
    <path d="M43 139H444V153H43Z" fill="#8f9790" stroke-width="2.8"/>
    <path d="M32 47H428V137H32Z" fill="#ed756d"/>
    <path d="M33 48H427V60H33Z" fill="#f49384" stroke-width="2.2"/>
    <path d="M39 82H423M39 111H423" fill="none" stroke="#934e47" stroke-width="2.3"/>
    <path d="M39 85H423M39 114H423" fill="none" stroke="#f59686" stroke-width="1.8"/>
    <path d="M24 38H41V142H24Z" fill="#ef8177"/>
    <path d="M417 38H434V145H417Z" fill="#f2877b"/>
    <path d="M29 43V134M422 43V137" fill="none" stroke="#ffc0a8" stroke-width="2.5"/>
    <path d="M443 11H548Q557 11 563 20L621 99Q634 110 634 126V179H443Z" fill="#ee776e"/>
    <path d="M450 18H546Q550 18 553 23L608 98" fill="none" stroke="#ffad96" stroke-width="4.2"/>
    <path d="M464 31H540L588 96H464Z" fill="#94d7e6"/>
    <path d="M470 37H537L542 44H470Z" fill="#c6eff3" stroke="none"/>
    <path d="M464 105V157" fill="none" stroke="#a95750" stroke-width="2.6"/>
    <path d="M451 170H627V179H451Z" fill="#dc625e" stroke="none"/>
    <path d="M474 122H491" fill="none" stroke-width="5.2"/>
    <path d="M626 130H634V151H626Z" fill="#fff1b2" stroke-width="2.6"/>
    <path d="M625 170H636V185H625Z" fill="#a4aaa0" stroke-width="2.8"/>
    <path d="M442 11V178" fill="none"/>
  </g>
  ${wheel(112)}
  ${wheel(541)}`;

// The box outline reaches all four image edges without clipping its 4 px stroke.
// This matches the 124 px stacking interval without introducing transparent gaps.
// Its central brown packing tape ends at 62% of the image height.
const boxArt = `
  <defs>
    <linearGradient id="cardboard" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e5b17a"/>
      <stop offset="1" stop-color="#dfa66e"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="272" height="120" rx="5" fill="url(#cardboard)"/>
  <path d="M7 6H269" fill="none" stroke="#efc592" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M271 8V118H7" fill="none" stroke="#ce9661" stroke-width="2.8" stroke-linejoin="round"/>
  <path d="M121 2H155V75Q155 77 153 77H123Q121 77 121 75Z" fill="#925331"/>
  <path d="M123 4V73" fill="none" stroke="#a3653f" stroke-width="1.6"/>
  <rect x="2" y="2" width="272" height="120" rx="5" fill="none" stroke="${ink}" stroke-width="4"/>
`;

const cloudArt = `
  <path d="M21 73C10 72 4 65 5 55C5 45 14 37 27 38C30 23 47 17 61 23C69 7 86 3 101 8C111 10 118 16 123 25C137 15 152 17 163 25C168 29 171 34 172 39C186 29 205 37 213 49C218 58 214 70 204 75C193 80 177 78 168 76C155 82 138 80 127 77C115 82 96 81 84 77C68 81 54 79 45 75C36 78 28 77 21 73Z" fill="#fffefb"/>
  <path d="M7 59C14 67 24 67 34 64C45 69 57 68 68 64C79 71 91 73 104 67C118 73 132 73 145 67C156 73 170 72 182 66C196 71 207 67 214 59C216 67 211 74 204 76C192 80 178 78 168 76C155 82 138 80 127 77C115 82 96 81 84 77C68 81 54 79 45 75C36 78 28 77 21 73C12 72 7 66 7 59Z" fill="#e4e3dc"/>
  <path d="M21 73C10 72 4 65 5 55C5 45 14 37 27 38C30 23 47 17 61 23C69 7 86 3 101 8C111 10 118 16 123 25C137 15 152 17 163 25C168 29 171 34 172 39C186 29 205 37 213 49C218 58 214 70 204 75C193 80 177 78 168 76C155 82 138 80 127 77C115 82 96 81 84 77C68 81 54 79 45 75C36 78 28 77 21 73Z" fill="none" stroke="#555750" stroke-width="2.7" stroke-linejoin="round"/>
`;

const svg = (width, height, body) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
);

// Compose the thumbnail from the very same source shapes, with two supported
// boxes and one suspended box. No title/UI or extra game texture is introduced.
const lobbyArt = `
  <rect width="436" height="354" fill="${cream}"/>
  <g transform="translate(292 30) scale(.5)">${cloudArt}</g>
  <g transform="translate(13 119) scale(.36)">${cloudArt}</g>
  <path d="M214 9L142 47.5" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>
  <circle cx="214" cy="9" r="3.8" fill="${ink}"/>
  <g transform="translate(73 47.5) scale(.5)">${boxArt}</g>
  <g transform="translate(129 118.3) scale(.5)">${boxArt}</g>
  <g transform="translate(109 180.3) scale(.5)">${boxArt}</g>
  <g transform="translate(45.2 218) scale(.54)">${truckArt}</g>
`;

const writeJson = (target, value) => fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);

function writeImageMeta(name, width, height, hasAlpha) {
  const raw = fs.readFileSync(templatePath, 'utf8');
  const templateUuid = JSON.parse(raw).uuid;
  const metadata = JSON.parse(raw.replaceAll(templateUuid, uuid(name)));
  metadata.files = ['.json', '.png'];
  metadata.userData.hasAlpha = hasAlpha;
  for (const sub of Object.values(metadata.subMetas)) sub.displayName = path.parse(name).name;
  const data = metadata.subMetas.f9941.userData;
  Object.assign(data, {
    width, height, rawWidth: width, rawHeight: height,
    offsetX: 0, offsetY: 0, trimX: 0, trimY: 0,
    packable: false, trimType: 'none',
  });
  Object.assign(data.vertices, {
    rawPosition: [-width / 2, -height / 2, 0, width / 2, -height / 2, 0, -width / 2, height / 2, 0, width / 2, height / 2, 0],
    minPos: [-width / 2, -height / 2, 0], maxPos: [width / 2, height / 2, 0],
    uv: [0, height, width, height, 0, 0, width, 0],
    nuv: [0, 0, 1, 0, 0, 1, 1, 1],
  });
  writeJson(path.join(dir, `${name}.meta`), metadata);
}

fs.mkdirSync(dir, { recursive: true });
writeJson(`${dir}.meta`, {
  ver: '1.2.0', importer: 'directory', imported: true,
  uuid: uuid('folder'), files: [], subMetas: {}, userData: {},
});

const assets = [
  ['truck.png', 640, 228, truckArt, true],
  ['box.png', 276, 124, boxArt, true],
  ['cloud.png', 220, 86, cloudArt, true],
  ['lobby.png', 436, 354, lobbyArt, false],
];
let totalBytes = 0;
for (const [name, width, height, art, hasAlpha] of assets) {
  let pipeline = sharp(svg(width, height, art));
  if (!hasAlpha) pipeline = pipeline.removeAlpha();
  await pipeline.png({ palette: true, colours: 128, dither: 0, effort: 10 }).toFile(path.join(dir, name));
  writeImageMeta(name, width, height, hasAlpha);
  const bytes = fs.statSync(path.join(dir, name)).size;
  totalBytes += bytes;
  console.log(`${name}: ${width}x${height}, ${bytes} bytes`);
}
console.log(`Truck stack PNG total: ${totalBytes} bytes`);
console.log('Truck deck: image top-left (240,45), supported span x=30..430; centered Cocos local point (-80,69).');
