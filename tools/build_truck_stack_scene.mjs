import fs from 'node:fs';
import {buildTruckStackScene, appendTruckStackCard, uuid, SCENE_UUID} from './truck_stack_authoring.mjs';
const write = (path, value) => fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
for (const name of ['truckStackFeedGameScene.ts', 'truckStackRules.ts']) {
  write('assets/scripts/' + name + '.meta', {ver: '4.0.24', importer: 'typescript', imported: true, uuid: uuid(name), files: [], subMetas: {}, userData: {}});
}
const index = process.argv.indexOf('--output-dir');
const dir = index < 0 ? 'assets/gamescene' : process.argv[index + 1];
fs.mkdirSync(dir, {recursive: true});
write(dir + '/TruckStackFeedGameScene.scene', buildTruckStackScene());
write(dir + '/TruckStackFeedGameScene.scene.meta', {ver: '1.1.50', importer: 'scene', imported: true, uuid: SCENE_UUID, files: ['.json'], subMetas: {}, userData: {}});
if (process.argv.includes('--lobby')) {
  const path = 'assets/gamescene/NewMainScene.scene', objects = JSON.parse(fs.readFileSync(path));
  appendTruckStackCard(objects); write(path, objects);
}
console.log('Authored TruckStackFeedGameScene', SCENE_UUID);
