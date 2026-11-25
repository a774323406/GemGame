import fs from 'node:fs';
import path from 'node:path';
import { buildMarbleBottleScene, SCENE_UUID, uuid } from './marble_bottle_authoring.mjs';

const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const outputFlag = process.argv.indexOf('--output-dir');
const directory = outputFlag < 0 ? 'assets/gamescene' : process.argv[outputFlag + 1];
fs.mkdirSync(directory, { recursive: true });
for (const name of ['marbleBottleFeedGameScene.ts', 'marbleBottleRules.ts']) {
  write(`assets/scripts/${name}.meta`, {
    ver: '4.0.24', importer: 'typescript', imported: true, uuid: uuid(name), files: [], subMetas: {}, userData: {},
  });
}
const file = path.join(directory, 'MarbleBottleFeedGameScene.scene');
write(file, buildMarbleBottleScene());
write(file + '.meta', {
  ver: '1.1.50', importer: 'scene', imported: true, uuid: SCENE_UUID, files: ['.json'], subMetas: {}, userData: {},
});
console.log('Authored MarbleBottleFeedGameScene', SCENE_UUID);
