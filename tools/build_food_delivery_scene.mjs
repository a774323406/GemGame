import fs from 'node:fs';
import path from 'node:path';
import {
  buildFoodDeliveryScene,
  SCENE_UUID,
} from './food_delivery_authoring.mjs';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const outputDir = option('--output-dir');
const scene = buildFoodDeliveryScene();
const metadata = {
  ver: '1.1.50',
  importer: 'scene',
  imported: true,
  uuid: SCENE_UUID,
  files: ['.json'],
  subMetas: {},
  userData: {},
};

if (outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const output = path.join(outputDir, 'FoodDeliveryFeedGameScene.scene');
  fs.writeFileSync(output, `${JSON.stringify(scene, null, 2)}\n`);
  fs.writeFileSync(`${output}.meta`, `${JSON.stringify(metadata, null, 2)}\n`);
}

console.log(JSON.stringify({ outputDir, objects: scene.length, sceneUuid: SCENE_UUID }, null, 2));
