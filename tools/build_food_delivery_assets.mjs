// Converts imagegen outputs into compact Cocos assets. This tool only writes
// its explicit --output-dir (or the foodDeliveryFeed asset directory).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { assetUuid } from './food_delivery_authoring.mjs';

const require = createRequire(import.meta.url);
const sharp = require(process.env.FOOD_DELIVERY_SHARP_PATH
  || '/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const sourceDir = option('--source-dir');
if (!sourceDir) throw new Error('--source-dir is required');
const outputDir = option('--output-dir') || 'assets/res/foodDeliveryFeed';

const sources = {
  background: 'background.png',
  courier: 'courier.png',
  arm: 'arm.png',
  guard: 'guard.png',
  building: 'building.png',
  foodPack: 'food-order-pack.png',
  uiPack: 'ui-pack.png',
  orangeButton: 'orange-button.png',
};

for (const file of Object.values(sources)) {
  const input = path.join(sourceDir, file);
  if (!fs.existsSync(input)) throw new Error(`Missing source asset: ${input}`);
}

function imageMeta(name, width, height, hasAlpha) {
  const uuid = assetUuid(name);
  const displayName = path.parse(name).name;
  const extension = path.extname(name);
  return {
    ver: '1.0.27',
    importer: 'image',
    imported: true,
    uuid,
    files: ['.json', extension],
    subMetas: {
      '6c48a': {
        ver: '1.0.22',
        importer: 'texture',
        imported: true,
        uuid: `${uuid}@6c48a`,
        displayName,
        id: '6c48a',
        name: 'texture',
        files: ['.json'],
        subMetas: {},
        userData: {
          wrapModeS: 'clamp-to-edge',
          wrapModeT: 'clamp-to-edge',
          imageUuidOrDatabaseUri: uuid,
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
        uuid: `${uuid}@f9941`,
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
              -width / 2, -height / 2, 0,
              width / 2, -height / 2, 0,
              -width / 2, height / 2, 0,
              width / 2, height / 2, 0,
            ],
            indexes: [0, 1, 2, 2, 1, 3],
            uv: [0, height, width, height, 0, 0, width, 0],
            nuv: [0, 0, 1, 0, 0, 1, 1, 1],
            minPos: [-width / 2, -height / 2, 0],
            maxPos: [width / 2, height / 2, 0],
          },
          isUuid: true,
          imageUuidOrDatabaseUri: `${uuid}@6c48a`,
          atlasUuid: '',
        },
      },
    },
    userData: {
      type: 'sprite-frame',
      hasAlpha,
      fixAlphaTransparencyArtifacts: true,
      redirect: `${uuid}@6c48a`,
    },
  };
}

async function checkedMetadata(input) {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Invalid image: ${input}`);
  return metadata;
}

async function trimmedSprite(input) {
  await checkedMetadata(input);
  return sharp(input)
    .ensureAlpha()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 4 })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function fitSprite(input, maxWidth, maxHeight) {
  const trimmed = await trimmedSprite(input);
  return sharp(trimmed)
    .resize({ width: maxWidth, height: maxHeight, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function cropPack(input, columns, rows, column, row) {
  const metadata = await checkedMetadata(input);
  const left = Math.floor(metadata.width * column / columns);
  const top = Math.floor(metadata.height * row / rows);
  const right = Math.floor(metadata.width * (column + 1) / columns);
  const bottom = Math.floor(metadata.height * (row + 1) / rows);
  const cell = await sharp(input)
    .extract({ left, top, width: right - left, height: bottom - top })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  return sharp(cell)
    .ensureAlpha()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 4 })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function fitBuffer(buffer, maxWidth, maxHeight) {
  return sharp(buffer)
    .resize({ width: maxWidth, height: maxHeight, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

const rendered = {};
const backgroundInput = path.join(sourceDir, sources.background);
const backgroundMetadata = await checkedMetadata(backgroundInput);
const backgroundRatio = backgroundMetadata.width / backgroundMetadata.height;
if (Math.abs(backgroundRatio - 750 / 1624) > 0.025) {
  throw new Error(`background.png must already match 750:1624, got ${backgroundMetadata.width}x${backgroundMetadata.height}`);
}
rendered['background.jpg'] = await sharp(backgroundInput)
  .resize(750, 1624, { fit: 'fill' })
  .jpeg({ quality: 85, mozjpeg: true })
  .toBuffer();

for (const [output, source, width, height] of [
  ['courier.png', sources.courier, 192, 176],
  ['arm.png', sources.arm, 100, 96],
  ['guard.png', sources.guard, 176, 192],
  ['building.png', sources.building, 144, 900],
  ['orange-button.png', sources.orangeButton, 280, 92],
]) {
  rendered[output] = await fitSprite(path.join(sourceDir, source), width, height);
}

const foodCells = [
  ['food-lime.png', 0, 0],
  ['food-icecream.png', 1, 0],
  ['food-cake.png', 2, 0],
  ['food-burger.png', 0, 1],
  ['food-cola.png', 1, 1],
  ['order.png', 2, 1],
];
for (const [name, column, row] of foodCells) {
  const cell = await cropPack(path.join(sourceDir, sources.foodPack), 3, 2, column, row);
  rendered[name] = await fitBuffer(cell, name === 'order.png' ? 112 : 80, name === 'order.png' ? 112 : 88);
}

const uiCells = [
  ['star-off.png', 0, 0],
  ['star-on.png', 1, 0],
  ['check.png', 0, 1],
  ['back.png', 1, 1],
];
for (const [name, column, row] of uiCells) {
  const cell = await cropPack(path.join(sourceDir, sources.uiPack), 2, 2, column, row);
  rendered[name] = await fitBuffer(cell, name === 'back.png' ? 88 : 64, name === 'back.png' ? 88 : 64);
}

const dotSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><circle cx="4" cy="4" r="3.5" fill="#171717"/></svg>');
rendered['dot.png'] = await sharp(dotSvg).png({ compressionLevel: 9 }).toBuffer();
rendered['white.png'] = await sharp({
  create: { width: 2, height: 2, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
}).png({ compressionLevel: 9 }).toBuffer();

fs.mkdirSync(outputDir, { recursive: true });
const directoryMeta = `${outputDir}.meta`;
if (!fs.existsSync(directoryMeta)) {
  fs.writeFileSync(directoryMeta, `${JSON.stringify({
    ver: '1.2.0', importer: 'directory', imported: true,
    uuid: assetUuid('directory'), files: [], subMetas: {}, userData: {},
  }, null, 2)}\n`);
}

const report = { sourceDir, outputDir, totalBytes: 0, totalRgbaBytes: 0, assets: {} };
for (const [name, bytes] of Object.entries(rendered)) {
  const output = path.join(outputDir, name);
  fs.writeFileSync(output, bytes);
  const metadata = await sharp(bytes).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Invalid rendered asset: ${name}`);
  fs.writeFileSync(`${output}.meta`, `${JSON.stringify(imageMeta(name, metadata.width, metadata.height, !!metadata.hasAlpha), null, 2)}\n`);
  const rgbaBytes = metadata.width * metadata.height * 4;
  report.totalBytes += bytes.length;
  report.totalRgbaBytes += rgbaBytes;
  report.assets[name] = {
    bytes: bytes.length,
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    rgbaBytes,
  };
}
fs.writeFileSync(path.join(outputDir, 'asset-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
