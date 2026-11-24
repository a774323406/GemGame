import fs from 'node:fs';
import { appendAirdropRescueCard, buildAirdropRescueScene, SCENE_UUID, uuid } from './airdrop_rescue_authoring.mjs';

const write = (path, value) => fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
write('assets/scripts/airdropRescueFeedGameScene.ts.meta', { ver: '4.0.24', importer: 'typescript', imported: true, uuid: uuid('airdropRescueFeedGameScene.ts'), files: [], subMetas: {}, userData: {} });
const index = process.argv.indexOf('--output-dir');
const directory = index < 0 ? 'assets/gamescene' : process.argv[index + 1];
fs.mkdirSync(directory, { recursive: true });
write(`${directory}/AirdropRescueFeedGameScene.scene`, buildAirdropRescueScene());
write(`${directory}/AirdropRescueFeedGameScene.scene.meta`, { ver: '1.1.50', importer: 'scene', imported: true, uuid: SCENE_UUID, files: ['.json'], subMetas: {}, userData: {} });
if (process.argv.includes('--lobby')) {
  const path = 'assets/gamescene/NewMainScene.scene';
  const objects = JSON.parse(fs.readFileSync(path, 'utf8'));
  appendAirdropRescueCard(objects);
  write(path, objects);
}
console.log('Authored AirdropRescueFeedGameScene', SCENE_UUID);
