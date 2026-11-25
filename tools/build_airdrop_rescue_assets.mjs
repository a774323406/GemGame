import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { uuid } from './airdrop_rescue_authoring.mjs';

const require = createRequire(import.meta.url);
let sharp;
if (process.env.AIRDROP_SHARP_PATH) {
  sharp = require(process.env.AIRDROP_SHARP_PATH);
} else {
  try {
    sharp = require('sharp');
  } catch {
    sharp = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'));
  }
}
const directory = 'assets/res/airdropRescueFeed';
const sourceIndex = process.argv.indexOf('--source-dir');
const sourceDirectory = sourceIndex >= 0 ? process.argv[sourceIndex + 1] : null;

// Source images are generated with alpha. Retain their proportions and transparent interiors.
if (sourceDirectory) {
  const spriteWidths = { 'helicopter.png': 416, 'vegetable.png': 144, 'pig.png': 240, 'bottle.png': 520 };
  for (const [name, width] of Object.entries(spriteWidths)) {
    await sharp(path.join(sourceDirectory, name))
      .trim({ threshold: 16 })
      .resize({ width })
      .extend({ top: 4, bottom: 4, left: 4, right: 4, background: '#00000000' })
      .png({ palette: true, colours: 256, dither: 0, effort: 10 })
      .toFile(path.join(directory, name));
  }
  await sharp(path.join(sourceDirectory, 'background.png'))
    .resize(750, 1624, { fit: 'fill' })
    .removeAlpha()
    .png({ palette: true, colours: 256, dither: 0, effort: 10 })
    .toFile(path.join(directory, 'background.png'));
}

// The lobby slot is landscape. Compose the same sprites at their natural aspect ratios.
const previewLayers = [];
for (const [name, left, top, width] of [
  ['helicopter.png', 26, 24, 186],
  ['vegetable.png', 142, 136, 52],
  ['pig.png', 281, 225, 58],
  ['bottle.png', 240, 86, 140],
]) {
  previewLayers.push({
    input: await sharp(path.join(directory, name)).resize({ width }).toBuffer(),
    left, top,
  });
}
previewLayers.splice(1, 0, {
  input: await sharp({ create: { width: 2, height: 35, channels: 4, background: '#685739' } }).png().toBuffer(),
  left: 167, top: 107,
});
await sharp(path.join(directory, 'background.png'))
  .resize(436, 354, { fit: 'fill' })
  .composite(previewLayers)
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile(path.join(directory, 'preview.jpg'));

function imageMeta(name, width, height, hasAlpha, assetUuid) {
  const displayName = path.parse(name).name;
  const extension = path.extname(name);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  return {
    ver: '1.0.27',
    importer: 'image',
    imported: true,
    uuid: assetUuid,
    files: ['.json', extension],
    subMetas: {
      '6c48a': {
        ver: '1.0.22',
        importer: 'texture',
        imported: true,
        uuid: `${assetUuid}@6c48a`,
        displayName,
        id: '6c48a',
        name: 'texture',
        files: ['.json'],
        subMetas: {},
        userData: {
          wrapModeS: 'clamp-to-edge',
          wrapModeT: 'clamp-to-edge',
          imageUuidOrDatabaseUri: assetUuid,
          isUuid: true,
          visible: false,
          minfilter: 'linear',
          magfilter: 'linear',
          mipfilter: 'none',
          anisotropy: 0,
        },
      },
      f9941: {
        ver: '1.0.12',
        importer: 'sprite-frame',
        imported: true,
        uuid: `${assetUuid}@f9941`,
        displayName,
        id: 'f9941',
        name: 'spriteFrame',
        files: ['.json'],
        subMetas: {},
        userData: {
          trimType: 'none',
          trimThreshold: 1,
          rotated: false,
          offsetX: 0,
          offsetY: 0,
          trimX: 0,
          trimY: 0,
          width,
          height,
          rawWidth: width,
          rawHeight: height,
          borderTop: 0,
          borderBottom: 0,
          borderLeft: 0,
          borderRight: 0,
          packable: false,
          pixelsToUnit: 100,
          pivotX: 0.5,
          pivotY: 0.5,
          meshType: 0,
          vertices: {
            rawPosition: [
              -halfWidth, -halfHeight, 0,
              halfWidth, -halfHeight, 0,
              -halfWidth, halfHeight, 0,
              halfWidth, halfHeight, 0,
            ],
            indexes: [0, 1, 2, 2, 1, 3],
            uv: [0, height, width, height, 0, 0, width, 0],
            nuv: [0, 0, 1, 0, 0, 1, 1, 1],
            minPos: [-halfWidth, -halfHeight, 0],
            maxPos: [halfWidth, halfHeight, 0],
          },
          isUuid: true,
          imageUuidOrDatabaseUri: `${assetUuid}@6c48a`,
          atlasUuid: '',
        },
      },
    },
    userData: {
      type: 'sprite-frame',
      hasAlpha,
      fixAlphaTransparencyArtifacts: hasAlpha,
      redirect: `${assetUuid}@6c48a`,
    },
  };
}

const assets = [
  ['background.png', '199e3914-629e-5f00-a738-2bb3ce879537'],
  ['helicopter.png', '1cd4f710-0127-565b-a76c-b1f1d428a02c'],
  ['bottle.png', '62d15396-ae40-587e-a56c-44b9b1f0ca21'],
  ['pig.png', '88d98b43-805c-5fae-a694-886cf481fc4a'],
  ['vegetable.png', '7d592e7a-e204-554c-af4a-116761d07564'],
  ['preview.jpg', '8f2424de-29fb-5a0b-a5fa-f733be1bc4f2'],
];

for (const [name, assetUuid] of assets) {
  const file = path.join(directory, name);
  if (!fs.existsSync(file)) throw new Error(`Missing image asset: ${file}`);
  const { width, height, hasAlpha } = await sharp(file).metadata();
  fs.writeFileSync(`${file}.meta`, `${JSON.stringify(imageMeta(name, width, height, hasAlpha, assetUuid), null, 2)}\n`);
}

fs.writeFileSync(`${directory}.meta`, `${JSON.stringify({
  ver: '1.2.0',
  importer: 'directory',
  imported: true,
  uuid: uuid('folder'),
  files: [],
  subMetas: {},
  userData: {},
}, null, 2)}\n`);

if (fs.existsSync(`${directory}/rope-cut.wav`)) {
  fs.writeFileSync(`${directory}/rope-cut.wav.meta`, `${JSON.stringify({
    ver: '1.0.0', importer: 'audio-clip', imported: true,
    uuid: uuid('rope-cut.wav'), files: ['.json', '.wav'], subMetas: {},
    userData: { downloadMode: 0 },
  }, null, 2)}\n`);
}

console.log(`Authored ${assets.length} airdrop rescue image metas`);
