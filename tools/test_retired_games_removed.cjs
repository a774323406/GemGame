// Offline retirement contract: no network, SDK, ads, or player storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require(process.env.RETIREMENT_TEST_TYPESCRIPT_PATH ||
  '/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');

function loadTypeScript(file, requireStub = () => ({})) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      experimentalDecorators: true,
    },
  }).outputText;
  vm.runInNewContext(code, { exports, require: requireStub, console });
  return exports;
}

const removedFiles = [
  ...['ArcheryGameScene', 'NailHammerFeedGameScene', 'BalloonWheelFeedGameScene']
    .flatMap(name => [`assets/gamescene/${name}.scene`, `assets/gamescene/${name}.scene.meta`]),
  ...['archeryGameScene', 'nailHammerFeedGameScene', 'balloonWheelFeedGameScene', 'balloonWheelRules']
    .flatMap(name => [`assets/scripts/${name}.ts`, `assets/scripts/${name}.ts.meta`]),
  'assets/gamescene/MainScene.scene',
  'assets/gamescene/MainScene.scene.meta',
  'assets/gamescene/MilkTeaFeedGameScene.scene',
  'assets/gamescene/MilkTeaFeedGameScene.scene.meta',
  'assets/gamescene/PenRefillFeedGameScene.scene',
  'assets/gamescene/PenRefillFeedGameScene.scene.meta',
  'assets/scripts/mainScene.ts',
  'assets/scripts/mainScene.ts.meta',
  'assets/scripts/milkTeaFeedGameScene.ts',
  'assets/scripts/milkTeaFeedGameScene.ts.meta',
  'assets/scripts/penRefillFeedGameScene.ts',
  'assets/scripts/penRefillFeedGameScene.ts.meta',
  'assets/res/milkTeaFeed.meta',
  'assets/res/penRefillFeed.meta',
];
for (const file of removedFiles) {
  assert.equal(fs.existsSync(file), false, `${file} must not ship`);
}

const { GameSceneName } = loadTypeScript(
  'assets/scripts/framework/GameSceneBundle.ts',
  name => name === 'cc' ? {} : { ResourceManager: {} },
);
assert.deepEqual(Array.from(Object.values(GameSceneName)).filter(name => !['MathExamFeedGameScene', 'RhythmCatFeedGameScene'].includes(name)), [
  'NewMainScene',
  'GameScene',
  'ShootingGlassBottlesGame',
  'JuggleBallGameScene',
  'PenguinStackFeedGameScene',
  'FoodDeliveryFeedGameScene',
  'WhiteGooseFeedGameScene',
  'MotoRaceGameScene',
]);

const feedConfig = loadTypeScript('assets/scripts/framework/Platform/FeedRevisitConfig.ts');
assert.equal(Object.hasOwn(feedConfig, 'FEED_MILK_TEA_CONTENT_ID'), false);
assert.equal(Object.hasOwn(feedConfig, 'FEED_PEN_REFILL_CONTENT_ID'), false);
for (const key of ['FEED_ARCHERY_CONTENT_ID', 'FEED_NAIL_HAMMER_CONTENT_ID', 'FEED_BALLOON_WHEEL_CONTENT_ID']) {
  assert.equal(Object.hasOwn(feedConfig, key), false);
}
let contentId;
const { loadScene } = loadTypeScript('assets/scripts/loadScene.ts', name => {
  if (name === 'cc') return { Component: class {}, _decorator: { ccclass: () => t => t, property: () => () => {} } };
  if (name.endsWith('FeedAcquisitionService')) return { FeedAcquisitionService: { getState: () => ({ active: true, mode: 'acquisition', contentId }) } };
  if (name.endsWith('FeedRevisitConfig')) return feedConfig;
  if (name.endsWith('GameSceneBundle')) return { GameSceneName };
  return {};
});
const loader = new loadScene();
loader.warnUnknownFeedContentId = () => {};
for (contentId of ['CONTENT14389077506', 'CONTENT14868790274', 'CONTENT14816266754']) {
  assert.equal(loader.resolveFeedEntry().sceneName, 'ShootingGlassBottlesGame', 'retired feed IDs must use the existing safe fallback');
}

const scene = JSON.parse(fs.readFileSync('assets/gamescene/NewMainScene.scene', 'utf8'));
const content = scene.find(item => item?.__type__ === 'cc.Node' && item._name === 'Content');
assert(content, 'NewMainScene Content node is missing');
const cardNames = content._children.map(ref => scene[ref.__id__]._name);
assert(!cardNames.some(name => /Archery|NailHammer|BalloonWheel/.test(name)), 'retired lobby cards must be removed');
assert.deepEqual(cardNames.filter(name => !['MathExamCard', 'RhythmCatCard'].includes(name)), [
  'PuzzleGameCard',
  'PenguinStackCard',
  'ShootingGlassBottlesCard',
  'FoodDeliveryCard',
  'WhiteGooseCard',
  'MotoRaceCard',
]);

for (const [index, entry] of scene.entries()) {
  const validate = value => {
    if (Array.isArray(value)) return value.forEach(validate);
    if (!value || typeof value !== 'object') return;
    if (Number.isInteger(value.__id__)) {
      assert(value.__id__ >= 0 && value.__id__ < scene.length,
        `NewMainScene object ${index} has invalid reference ${value.__id__}`);
      return;
    }
    Object.values(value).forEach(validate);
  };
  validate(entry);
}

// External delivery still uses the shooting sound even though its name contains "archery".
const { soundName, SOUND_ASSET_UUIDS } = loadTypeScript('assets/scripts/gamePrefabMgr.ts');
for (const name of ['archeryShoot', 'shoot', 'getUserBgm', 'down', 'fail']) {
  assert.equal(soundName[name], name);
  assert(fs.statSync(`assets/res/sound/${name}.mp3`).size > 0);
}
const sharedShot = JSON.parse(fs.readFileSync('assets/res/sound/archeryShoot.mp3.meta', 'utf8'));
assert.equal(SOUND_ASSET_UUIDS.archeryShoot, sharedShot.uuid);

console.log('PASS retired games and legacy main are absent; surviving lobby/assets resolve');
