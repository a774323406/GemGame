import fs from 'node:fs';
import { buildWhiteGooseScene, SCENE_UUID, SCRIPT_TYPE } from './white_goose_authoring.mjs';

const sceneFile = 'assets/gamescene/WhiteGooseFeedGameScene.scene';
const objects = buildWhiteGooseScene();

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

if (process.argv.includes('--write')) {
  const replace = process.argv.includes('--replace-scene');
  if (fs.existsSync(sceneFile) && !replace) {
    throw new Error(`${sceneFile} already exists; pass --replace-scene to regenerate it.`);
  }
  writeJson(sceneFile, objects);
  writeJson(`${sceneFile}.meta`, {
    ver: '1.1.50',
    importer: 'scene',
    imported: true,
    uuid: SCENE_UUID,
    files: ['.json'],
    subMetas: {},
    userData: {},
  });
}

console.log(JSON.stringify({
  scene: sceneFile,
  sceneUuid: SCENE_UUID,
  scriptType: SCRIPT_TYPE,
  objects: objects.length,
  wrote: process.argv.includes('--write'),
}));
