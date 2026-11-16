import fs from 'node:fs';
import { appendJellyCrushCard, buildJellyCrushScene, SCENE_UUID, uuid } from './jelly_crush_authoring.mjs';
import { standardizeAllLobbyCards } from './lobby_card_style.mjs';

const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const names = ['jellyCrushFeedGameScene.ts', 'jellyCrushRules.ts'];
for (const name of names) {
  write(`assets/scripts/${name}.meta`, {
    ver: '4.0.24',
    importer: 'typescript',
    imported: true,
    uuid: uuid(name),
    files: [],
    subMetas: {},
    userData: {},
  });
}

const outputIndex = process.argv.indexOf('--output-dir');
const outputDir = outputIndex < 0 ? 'assets/gamescene' : process.argv[outputIndex + 1];
fs.mkdirSync(outputDir, { recursive: true });
write(`${outputDir}/JellyCrushFeedGameScene.scene`, buildJellyCrushScene());
write(`${outputDir}/JellyCrushFeedGameScene.scene.meta`, {
  ver: '1.1.50',
  importer: 'scene',
  imported: true,
  uuid: SCENE_UUID,
  files: ['.json'],
  subMetas: {},
  userData: {},
});

if (process.argv.includes('--lobby')) {
  const file = 'assets/gamescene/NewMainScene.scene';
  const lobby = JSON.parse(fs.readFileSync(file, 'utf8'));
  standardizeAllLobbyCards(lobby);
  appendJellyCrushCard(lobby);
  write(file, lobby);
}

const bundleFile = 'assets/scripts/framework/GameSceneBundle.ts';
let bundleSource = fs.readFileSync(bundleFile, 'utf8');
if (!bundleSource.includes('JellyCrushFeedGame =')) {
  bundleSource = bundleSource.replace(
    '  FoodDeliveryFeedGame = "FoodDeliveryFeedGameScene",',
    '  FoodDeliveryFeedGame = "FoodDeliveryFeedGameScene",\n  JellyCrushFeedGame = "JellyCrushFeedGameScene",',
  );
}
if (!bundleSource.includes('[GameSceneName.JellyCrushFeedGame]')) {
  bundleSource = bundleSource.replace(
    '  [GameSceneName.FoodDeliveryFeedGame]: "fccc8a6c-9bab-5757-a411-a8bf4c40935b",',
    `  [GameSceneName.FoodDeliveryFeedGame]: "fccc8a6c-9bab-5757-a411-a8bf4c40935b",\n  [GameSceneName.JellyCrushFeedGame]: "${SCENE_UUID}",`,
  );
}
fs.writeFileSync(bundleFile, bundleSource);

const configFile = 'assets/scripts/framework/Platform/FeedRevisitConfig.ts';
let configSource = fs.readFileSync(configFile, 'utf8');
if (!configSource.includes('FEED_JELLY_CRUSH_CONTENT_ID')) {
  configSource += '\n/** 果冻压压乐推荐流方案，待补充 kdzzz 专属 ID。 */\nexport const FEED_JELLY_CRUSH_CONTENT_ID = "xx-jelly";\n';
  fs.writeFileSync(configFile, configSource);
}
const routeSource = fs.readFileSync('assets/scripts/loadScene.ts', 'utf8');
if (!routeSource.includes('FEED_JELLY_CRUSH_CONTENT_ID')) {
  fs.writeFileSync('assets/scripts/loadScene.ts', routeSource.replace(
    '  FEED_HEART_CONTENT_ID,',
    '  FEED_HEART_CONTENT_ID,\n  FEED_JELLY_CRUSH_CONTENT_ID,',
  ).replace(
    '    if (contentId === FEED_HEART_CONTENT_ID) {',
    '    if (contentId === FEED_JELLY_CRUSH_CONTENT_ID) {\n      return { sceneName: GameSceneName.JellyCrushFeedGame, reason: `推荐流果冻压压乐（${contentId}）` };\n    }\n\n    if (contentId === FEED_HEART_CONTENT_ID) {',
  ));
}
console.log(`Authored JellyCrushFeedGameScene ${SCENE_UUID}`);
