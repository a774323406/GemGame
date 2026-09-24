import fs from 'node:fs';
import { mathUuid, SCENE_UUID, SCRIPT_UUID, buildMathExamScene, appendMathExamCard } from './math_exam_authoring.mjs';
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
if (!process.argv.includes('--write')) {
  console.log('Use --write to author the math exam scene and append its lobby card.');
  process.exit(0);
}
const directory = 'assets/res/mathExamFeed';
fs.mkdirSync(directory, { recursive: true });
write(`${directory}.meta`, { ver: '1.2.0', importer: 'directory', imported: true, uuid: mathUuid('directory'), files: [], subMetas: {}, userData: {} });
for (const name of ['video-artwork.png', 'video-digits.png', 'video-digits.fnt', 'correction-fluid.png']) {
  if (!fs.existsSync(`${directory}/${name}`)) throw new Error('Run node tools/prepare_math_exam_art.mjs first.');
}
for (const name of ['mathExamFeedGameScene.ts', 'mathExamRules.ts', 'handwrittenDigits.ts', 'inkEraser.ts']) {
  write(`assets/scripts/${name}.meta`, { ver: '4.0.24', importer: 'typescript', imported: true,
    uuid: name === 'mathExamFeedGameScene.ts' ? SCRIPT_UUID : mathUuid(name), files: [], subMetas: {}, userData: {} });
}
const scene = 'assets/gamescene/MathExamFeedGameScene.scene';
if (fs.existsSync(scene) && !process.argv.includes('--replace-scene')) throw new Error('Scene exists; pass --replace-scene to replace its layout.');
write(scene, buildMathExamScene());
write(`${scene}.meta`, { ver: '1.1.50', importer: 'scene', imported: true, uuid: SCENE_UUID, files: ['.json'], subMetas: {}, userData: {} });
const lobbyFile = 'assets/gamescene/NewMainScene.scene';
const lobby = JSON.parse(fs.readFileSync(lobbyFile));
appendMathExamCard(lobby);
write(lobbyFile, lobby);
console.log(JSON.stringify({ scene, sceneUuid: SCENE_UUID, scriptUuid: SCRIPT_UUID }));
