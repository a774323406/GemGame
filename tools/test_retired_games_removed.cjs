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
assert.deepEqual(Array.from(Object.values(GameSceneName)), [
  'NewMainScene',
  'GameScene',
  'ShootingGlassBottlesGame',
  'ArcheryGameScene',
  'JuggleBallGameScene',
  'NailHammerFeedGameScene',
  'BalloonWheelFeedGameScene',
  'PenguinStackFeedGameScene',
  'FoodDeliveryFeedGameScene',
  'WhiteGooseFeedGameScene',
]);

const feedConfig = loadTypeScript('assets/scripts/framework/Platform/FeedRevisitConfig.ts');
assert.equal(Object.hasOwn(feedConfig, 'FEED_MILK_TEA_CONTENT_ID'), false);
assert.equal(Object.hasOwn(feedConfig, 'FEED_PEN_REFILL_CONTENT_ID'), false);

const scene = JSON.parse(fs.readFileSync('assets/gamescene/NewMainScene.scene', 'utf8'));
const content = scene.find(item => item?.__type__ === 'cc.Node' && item._name === 'Content');
assert(content, 'NewMainScene Content node is missing');
assert.deepEqual(content._children.map(ref => scene[ref.__id__]._name), [
  'PuzzleGameCard',
  'PenguinStackCard',
  'ShootingGlassBottlesCard',
  'ArcheryCard',
  'NailHammerCard',
  'BalloonWheelCard',
  'FoodDeliveryCard',
  'WhiteGooseCard',
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

const sharedBackPath = 'assets/res/texture/UIs/feed_back_button.png';
const sharedMeta = JSON.parse(fs.readFileSync(`${sharedBackPath}.meta`, 'utf8'));
assert.equal(sharedMeta.uuid, '8f6b54c1-3b72-4cf3-8a36-a5d9f6e4c721');
for (const file of [
  'assets/gamescene/BalloonWheelFeedGameScene.scene',
  'assets/gamescene/NailHammerFeedGameScene.scene',
]) {
  const survivingScene = fs.readFileSync(file, 'utf8');
  assert(survivingScene.includes(`${sharedMeta.uuid}@f9941`),
    `${file} lost the shared back button`);
}

console.log('PASS retired games and legacy main are absent; surviving lobby/assets resolve');
