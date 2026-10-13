import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(root, '../cocosProject/drift/assets/res/texture/road');
const destination = path.join(root, 'assets/res/driftFeed');
const uuid = name => {
  const hex = crypto.createHash('sha256').update(`GemGame/driftFeed/${name}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
};
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const assets = [
  { source: path.resolve(source, '../common/hspyjiantou1.png'), target: 'road/speed-arrow.png', origin: 'original drift arrow; copied unchanged' },
  ...['road_straight_600', 'road_left_90_r300', 'road_180_r300'].map(name => ({
    source: path.join(source, `${name}.png`), target: `road/${name}.png`, origin: 'existing drift road; copied unchanged',
  })),
  { source: path.join(root, 'docs/reference/drift-feed/player-car-original.png'), target: 'car/player-car.png', origin: 'new built-in image_gen generation; original alpha preserved' },
];

for (const folder of ['', 'road', 'car']) {
  const target = path.join(destination, folder);
  fs.mkdirSync(target, { recursive: true });
  if (!fs.existsSync(`${target}.meta`)) write(`${target}.meta`, {
    ver: '1.2.0', importer: 'directory', imported: true, uuid: uuid(`directory/${folder}`), files: [], subMetas: {}, userData: {},
  });
}

const template = JSON.parse(fs.readFileSync(path.join(root, 'assets/res/foodDeliveryFeed/courier.png.meta'), 'utf8'));
const manifest = [];
for (const asset of assets) {
  const bytes = fs.readFileSync(asset.source);
  if (bytes.subarray(1, 4).toString() !== 'PNG') throw new Error(`Not PNG: ${asset.source}`);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  const target = path.join(destination, asset.target);
  const id = fs.existsSync(`${target}.meta`) ? JSON.parse(fs.readFileSync(`${target}.meta`, 'utf8')).uuid : uuid(asset.target);
  const name = path.basename(target, '.png');
  const meta = JSON.parse(JSON.stringify(template).replaceAll(template.uuid, id).replaceAll('courier', name));
  const frame = meta.subMetas.f9941.userData;
  Object.assign(frame, { width, height, rawWidth: width, rawHeight: height, trimType: 'none', trimX: 0, trimY: 0, offsetX: 0, offsetY: 0, pivotX: 0.5, pivotY: 0.5 });
  delete frame.vertices;
  fs.copyFileSync(asset.source, target);
  write(`${target}.meta`, meta);
  manifest.push({ file: `assets/res/driftFeed/${asset.target}`, uuid: id, width, height, origin: asset.origin, source: path.relative(root, asset.source), sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
}
write(path.join(root, 'docs/reference/drift-feed/asset-manifest.json'), manifest);
console.log(`Prepared ${manifest.length} drift assets and Cocos metadata.`);
