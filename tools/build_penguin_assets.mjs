// Prepares compact PNG/JPEG sprites for the penguin stack feed game.
// Runtime only consumes images; all simple UI art below is rasterized offline.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { assetUuid } from './penguin_scene_authoring.mjs';

const require = createRequire(import.meta.url);
const sharp = require(process.env.PENGUIN_SHARP_PATH ||
  '/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const output = 'assets/res/penguinStackFeed';
const generated = '/Users/skyhand/.codex/generated_images/019fc63a-6b02-70e1-b173-ca754f4eeb6d';
const sources = {
  background: 'exec-32c3e0d6-f640-416f-9a81-e447b8b795f1.png',
  penguin: 'exec-e71ee315-ec0e-49fe-a2c3-8785149c56b3.png',
  whale: 'exec-d6ae5381-44f2-4c02-9068-eb8bd91bad30.png',
  failCat: 'exec-b2feb1d9-ecc7-478f-a910-80825cbc437e.png',
  successCat: 'exec-d8206793-2481-4798-a993-421a2dc4b903.png',
};

function svg(width, height, body) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`);
}

const ui = {
  'title-plaque.png': svg(540, 118, `
    <defs><linearGradient id="g" y2="1"><stop stop-color="#fff7ba"/><stop offset="1" stop-color="#f4ce70"/></linearGradient></defs>
    <rect x="5" y="7" width="530" height="104" rx="25" fill="#80512e"/>
    <rect x="11" y="12" width="518" height="92" rx="20" fill="url(#g)" stroke="#ffe9a0" stroke-width="5"/>
    <path d="M31 25h476" stroke="#fffbe1" stroke-width="5" stroke-linecap="round" opacity=".9"/>
    <circle cx="18" cy="43" r="4" fill="#fff"/><circle cx="18" cy="59" r="4" fill="#fff"/><circle cx="18" cy="75" r="4" fill="#fff"/>
    <circle cx="522" cy="43" r="3" fill="#bd8a48"/><circle cx="522" cy="75" r="3" fill="#bd8a48"/>
  `),
  'lives-plaque.png': svg(184, 58, `
    <defs><linearGradient id="g" y2="1"><stop stop-color="#d79661"/><stop offset="1" stop-color="#a65d3c"/></linearGradient></defs>
    <rect x="3" y="3" width="178" height="52" rx="11" fill="#6f3828"/>
    <rect x="8" y="7" width="168" height="42" rx="8" fill="url(#g)" stroke="#efb27c" stroke-width="3"/>
  `),
  'goal-plaque.png': svg(420, 66, `
    <defs><linearGradient id="g" y2="1"><stop stop-color="#c58a50"/><stop offset="1" stop-color="#8a552c"/></linearGradient></defs>
    <rect x="4" y="5" width="412" height="56" rx="14" fill="#6a3e26"/>
    <rect x="10" y="9" width="400" height="46" rx="10" fill="url(#g)" stroke="#e5b778" stroke-width="3"/>
    <circle cx="27" cy="32" r="5" fill="#d9bb8c"/><circle cx="393" cy="32" r="5" fill="#d9bb8c"/>
  `),
  'heart.png': svg(72, 66, `
    <defs><linearGradient id="g" y2="1"><stop stop-color="#ff8c8a"/><stop offset="1" stop-color="#ef3f52"/></linearGradient></defs>
    <path d="M36 60C29 51 6 37 6 21 6 7 24 2 36 16 48 2 66 7 66 21c0 16-23 30-30 39z" fill="url(#g)" stroke="#a82f3e" stroke-width="3"/>
    <path d="M18 16c4-5 10-4 13 0" fill="none" stroke="#ffc5c1" stroke-width="5" stroke-linecap="round"/>
  `),
  'reward-button.png': svg(138, 138, `
    <defs><linearGradient id="g" y2="1"><stop stop-color="#ffe879"/><stop offset=".55" stop-color="#ffc842"/><stop offset="1" stop-color="#eda72c"/></linearGradient></defs>
    <rect x="5" y="5" width="128" height="128" rx="25" fill="#78431e"/>
    <rect x="10" y="9" width="118" height="115" rx="21" fill="url(#g)" stroke="#fff0a0" stroke-width="4"/>
    <path d="M19 112q50 20 100 0v9H19z" fill="#c77c24" opacity=".55"/>
    <path d="M22 20h93" stroke="#fff8bd" stroke-width="5" stroke-linecap="round" opacity=".9"/>
    <circle cx="17" cy="64" r="3" fill="#ffd971"/><circle cx="121" cy="64" r="3" fill="#b16b22"/>
  `),
  'video-badge.png': svg(54, 38, `
    <rect x="2" y="5" width="39" height="28" rx="10" fill="#fff" stroke="#5c5a58" stroke-width="3"/>
    <path d="M41 13l10-5v22l-10-5z" fill="#e9e9e9" stroke="#5c5a58" stroke-width="3" stroke-linejoin="round"/>
    <path d="M20 12l10 7-10 7z" fill="#555"/>
    <path d="M9 10h8" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>
  `),
  'stage-one.png': svg(48, 48, `
    <defs><linearGradient id="g" y2="1"><stop stop-color="#f078f2"/><stop offset="1" stop-color="#be4fdb"/></linearGradient></defs>
    <circle cx="24" cy="24" r="21" fill="#50302a"/><circle cx="24" cy="24" r="17" fill="url(#g)" stroke="#f8b0ff" stroke-width="2"/>
  `),
  'stage-two.png': svg(48, 48, `
    <defs><linearGradient id="g" y2="1"><stop stop-color="#656568"/><stop offset="1" stop-color="#343438"/></linearGradient></defs>
    <circle cx="24" cy="24" r="21" fill="#50302a"/><circle cx="24" cy="24" r="17" fill="url(#g)" stroke="#aaa9ad" stroke-width="2"/>
  `),
  'skip-icon.png': svg(84, 76, `
    <g fill="#83dd39" stroke="#377a22" stroke-width="4" stroke-linejoin="round"><path d="M4 8h20l28 30-28 30H4l27-30z"/><path d="M34 8h20l27 30-27 30H34l27-30z"/></g>
    <path d="M11 15h10l21 23" fill="none" stroke="#d8ff8e" stroke-width="4" stroke-linecap="round"/>
  `),
  'slow-icon.png': svg(84, 84, `
    <circle cx="42" cy="42" r="37" fill="#6c3c25"/>
    <circle cx="42" cy="42" r="31" fill="#303b39" stroke="#f2a62e" stroke-width="5"/>
    <path d="M18 46A25 25 0 0 1 66 46" fill="none" stroke="#f14b45" stroke-width="8"/>
    <path d="M20 46A23 23 0 0 1 36 22" fill="none" stroke="#75d843" stroke-width="8"/>
    <path d="M42 43l-15 11" stroke="#fff0a2" stroke-width="5" stroke-linecap="round"/><circle cx="42" cy="43" r="5" fill="#fff0a2"/>
  `),
  'surge-banner.png': svg(448, 162, `
    <path d="M26 28h396l-13 107H39z" fill="#85502c"/>
    <rect x="12" y="17" width="424" height="118" rx="12" fill="#fff9e9" stroke="#e6a76c" stroke-width="7"/>
    <path d="M24 30h400" stroke="#fff" stroke-width="5" opacity=".9"/>
    <path d="M31 13l18 18M399 13l-18 18" stroke="#87b9e8" stroke-width="9" stroke-linecap="round"/>
    <circle cx="30" cy="10" r="10" fill="#49a8eb"/><circle cx="418" cy="10" r="10" fill="#49a8eb"/>
  `),
  'result-panel.png': svg(650, 650, `
    <path d="M112 92L80 16l102 64M538 92l32-76-102 64" fill="#fff" stroke="#503c56" stroke-width="10" stroke-linejoin="round"/>
    <path d="M124 75L99 37l54 38M526 75l25-38-54 38" fill="#f6c8d5"/>
    <rect x="24" y="72" width="602" height="554" rx="35" fill="#4e3e5a"/>
    <rect x="38" y="84" width="574" height="522" rx="27" fill="#fff6fb" stroke="#af79a3" stroke-width="7"/>
    <circle cx="74" cy="92" r="25" fill="#fff" stroke="#4e3e5a" stroke-width="8"/><circle cx="576" cy="92" r="25" fill="#fff" stroke="#4e3e5a" stroke-width="8"/>
    <path d="M66 89l7 5 10-11M568 89l7 5 10-11" fill="none" stroke="#e8a8bd" stroke-width="5" stroke-linecap="round"/>
  `),
  'action-blue.png': actionButton('#38a8f2', '#197bc5'),
  'action-green.png': actionButton('#54d985', '#27a85a'),
  'action-orange.png': actionButton('#ffc144', '#e18918'),
  'action-purple.png': actionButton('#c778ee', '#9444bc'),
};

function actionButton(top, bottom) {
  return svg(290, 90, `
    <defs><linearGradient id="g" y2="1"><stop stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
    <rect x="4" y="5" width="282" height="80" rx="35" fill="#583d5d"/>
    <rect x="10" y="9" width="270" height="68" rx="30" fill="url(#g)" stroke="#fff4d0" stroke-width="4"/>
    <path d="M30 19h208" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".38"/>
  `);
}

function imageMeta(name, width, height, alpha) {
  const uuid = assetUuid(name);
  const displayName = path.parse(name).name;
  return {
    ver: '1.0.27', importer: 'image', imported: true, uuid, files: ['.json', path.extname(name)],
    subMetas: {
      '6c48a': {
        ver: '1.0.22', importer: 'texture', imported: true, uuid: uuid + '@6c48a', displayName,
        id: '6c48a', name: 'texture', files: ['.json'], subMetas: {},
        userData: { wrapModeS: 'clamp-to-edge', wrapModeT: 'clamp-to-edge', imageUuidOrDatabaseUri: uuid,
          isUuid: true, visible: false, minfilter: 'linear', magfilter: 'linear', mipfilter: 'none', anisotropy: 0 },
      },
      f9941: {
        ver: '1.0.12', importer: 'sprite-frame', imported: true, uuid: uuid + '@f9941', displayName,
        id: 'f9941', name: 'spriteFrame', files: ['.json'], subMetas: {},
        userData: { trimType: 'none', trimThreshold: 1, rotated: false, offsetX: 0, offsetY: 0,
          trimX: 0, trimY: 0, width, height, rawWidth: width, rawHeight: height,
          borderTop: 0, borderBottom: 0, borderLeft: 0, borderRight: 0, packable: false,
          pixelsToUnit: 100, pivotX: 0.5, pivotY: 0.5, meshType: 0,
          vertices: { rawPosition: [-width / 2, -height / 2, 0, width / 2, -height / 2, 0,
            -width / 2, height / 2, 0, width / 2, height / 2, 0], indexes: [0, 1, 2, 2, 1, 3],
            uv: [0, height, width, height, 0, 0, width, 0], nuv: [0, 0, 1, 0, 0, 1, 1, 1],
            minPos: [-width / 2, -height / 2, 0], maxPos: [width / 2, height / 2, 0] },
          isUuid: true, imageUuidOrDatabaseUri: uuid + '@6c48a', atlasUuid: '' },
      },
    },
    userData: { type: 'sprite-frame', hasAlpha: alpha, fixAlphaTransparencyArtifacts: true, redirect: uuid + '@6c48a' },
  };
}

const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
const sourcePath = key => path.join(generated, sources[key]);

async function transparentSprite(key, width, height) {
  return sharp(sourcePath(key))
    .ensureAlpha()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 4 })
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ palette: true, colours: 192, effort: 10, dither: 0.25 })
    .toBuffer();
}

fs.mkdirSync(output, { recursive: true });
if (!fs.existsSync(output + '.meta')) {
  writeJson(output + '.meta', { ver: '1.2.0', importer: 'directory', imported: true,
    uuid: assetUuid('directory'), files: [], subMetas: {}, userData: {} });
}

const rendered = {
  'background.jpg': await sharp(sourcePath('background')).resize(750, 1334, { fit: 'fill' })
    .jpeg({ quality: 76, mozjpeg: true }).toBuffer(),
  'penguin.png': await transparentSprite('penguin', 196, 98),
  'whale.png': await transparentSprite('whale', 390, 195),
  'fail-cat.png': await transparentSprite('failCat', 360, 180),
  'success-cat.png': await transparentSprite('successCat', 330, 220),
};

for (const [name, source] of Object.entries(ui)) {
  rendered[name] = await sharp(source).png({ palette: true, colours: 160, effort: 10 }).toBuffer();
}

for (const [name, bytes] of Object.entries(rendered)) {
  const file = path.join(output, name);
  fs.writeFileSync(file, bytes);
  const info = await sharp(bytes).metadata();
  writeJson(file + '.meta', imageMeta(name, info.width, info.height, !!info.hasAlpha));
}

const totalBytes = Object.values(rendered).reduce((sum, bytes) => sum + bytes.length, 0);
console.log(JSON.stringify({ output, totalBytes,
  assets: Object.fromEntries(Object.entries(rendered).map(([name, bytes]) => [name, bytes.length])) }, null, 2));
