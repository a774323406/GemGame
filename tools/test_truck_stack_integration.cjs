const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const compile = file => ts.transpileModule(fs.readFileSync('assets/scripts/' + file, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true},
}).outputText;
const state = {active: true, entered: false, exited: false, mode: 'acquisition', contentId: 'CONTENT17191550978'};
const cc = {_decorator: {ccclass: () => c => c, property: () => () => {}}, Component: class {}, Button: {EventType: {CLICK: 'click'}}};
const load = (file, requireFn = () => ({})) => {
  const exports = {}; vm.runInNewContext(compile(file), {exports, require: requireFn}); return exports;
};

(async () => {
  const bundle = load('framework/GameSceneBundle.ts'), config = load('framework/Platform/FeedRevisitConfig.ts');
  assert.equal(bundle.GameSceneName.TruckStackFeedGame, 'TruckStackFeedGameScene', 'new scene is registered');
  assert.equal(config.FEED_TRUCK_STACK_CONTENT_ID, 'CONTENT17191550978');
  const loader = load('loadScene.ts', name => name === 'cc' ? cc : name.endsWith('GameSceneBundle') ? bundle :
    name.endsWith('FeedRevisitConfig') ? config : name.endsWith('FeedAcquisitionService') ? {FeedAcquisitionService: {getState: () => state}} : {});
  const route = new loader.loadScene();
  for (const [id, scene] of [[config.FEED_TRUCK_STACK_CONTENT_ID,'TruckStackFeedGameScene'], [config.FEED_ROPE_DUCK_CONTENT_ID,'RopeDuckFeedGameScene'],
    [config.FEED_BRICK_CHOP_CONTENT_ID,'BrickChopFeedGameScene'], ['unknown', 'NewMainScene']]) {
    state.contentId = id; assert.equal(route.resolveFeedEntry().sceneName, scene, id + ' routes correctly');
  }
  state.contentId = config.FEED_TRUCK_STACK_CONTENT_ID; state.mode = 'revisit';
  assert.equal(route.resolveFeedEntry().sceneName, 'NewMainScene', 'retired revisit still falls back');
  const {buildTruckStackScene, appendTruckStackCard, SCENE_UUID, uuid} = await import('./truck_stack_authoring.mjs');
  const scene = JSON.parse(fs.readFileSync('assets/gamescene/TruckStackFeedGameScene.scene'));
  assert.deepEqual(scene, buildTruckStackScene(), 'serialized scene matches authoring');
  assert.equal(JSON.parse(fs.readFileSync('assets/gamescene/TruckStackFeedGameScene.scene.meta')).uuid, SCENE_UUID);
  assert(fs.readFileSync('assets/scripts/framework/GameSceneBundle.ts', 'utf8').includes(SCENE_UUID), 'UUID fallback registered');
  assert.equal(JSON.parse(fs.readFileSync('assets/scripts/truckStackFeedGameScene.ts.meta')).uuid, uuid('truckStackFeedGameScene.ts'));
  const node = name => scene.findIndex(o => o.__type__ === 'cc.Node' && o._name === name);
  const component = (id, type) => scene[id]._components.map(r => scene[r.__id__]).find(o => o.__type__ === type);
  function refs(v) {
    if (!v || typeof v !== 'object') return;
    if (Number.isInteger(v.__id__)) assert(scene[v.__id__], 'no dangling reference');
    else Object.values(v).forEach(refs);
  }
  refs(scene);
  const controller = scene.find(o => o.boxNodes && o.heldBox);
  assert.equal(controller.boxNodes.length, 18, 'fixed render pool');
  for (const key of ['backButton','slowdownButton','reviveButton','replayButton','homeButton','continueButton','restartButton','exitButton']) assert.equal(scene[controller[key].__id__].__type__, 'cc.Button');
  assert(component(node('ExitConfirmation'), 'cc.BlockInputEvents'));
  assert(component(node('ResultOverlay'), 'cc.BlockInputEvents'));
  assert(!component(node('ResultPanel'), 'cc.Sprite'), 'no result popup card');
  assert.equal(component(node('ResultDim'), 'cc.Sprite')._color.a, 145);
  assert.deepEqual(scene.find(o => o.gameplayHud).gameplayHud, [{__id__: node('HUD')}]);
  for (const height of [1334, 1624]) {
    for (const name of ['ReviveButton','ReplayButton','HomeButton']) {
      const w = component(node(name), 'cc.Widget'), s = component(node(name), 'cc.UITransform')._contentSize;
      assert.equal(w._isAbsVerticalCenter, false);
      assert(w._verticalCenter * height - s.height / 2 >= -height / 2 + 80, name + ' safe bottom');
    }
    const slow = component(node('SlowdownButton'), 'cc.Widget');
    assert.equal(slow._alignFlags, 20); assert(slow._bottom >= 80);
    const back = component(node('BackButton'), 'cc.Widget');
    assert.equal(back._alignFlags, 9); assert(back._top >= 80 && back._left >= 24);
  }
  const audio = scene.filter(o => o.__type__ === 'cc.AudioSource');
  assert.equal(audio.length, 4);
  assert(audio.every(o => !o._loop && !o._playOnAwake), 'BGM belongs to the shared manager only');
  const clipIds = ['jump','land','pickup','fall'].map(n => JSON.parse(fs.readFileSync('assets/res/ropeDuckFeed/' + n + '.wav.meta')).uuid);
  assert(audio.every(o => clipIds.includes(o._clip.__uuid__)), 'reuse existing small cues');
  const lobby = JSON.parse(fs.readFileSync('assets/gamescene/NewMainScene.scene'));
  const before = JSON.stringify(lobby); appendTruckStackCard(lobby); assert.equal(JSON.stringify(lobby), before);
  assert(lobby.find(o => o.gameList).truckStackButton);
  const lobbySource = fs.readFileSync('assets/scripts/newMainScene.ts', 'utf8');
  assert(lobbySource.includes('GameSceneName.TruckStackFeedGame'));
  assert(fs.readFileSync('tools/build_new_main_scene.mjs', 'utf8').includes('appendTruckStackCard(outputObjects)'));
  assert(fs.readFileSync('assets/scripts/framework/Platform/sdk/SdkUtils.ts', 'utf8').includes('TruckStackFeedGameScene: "货车叠叠高"'));
  const media = fs.readdirSync('assets/res/truckStackFeed').filter(n => !n.endsWith('.meta')).reduce((sum, n) => sum + fs.statSync('assets/res/truckStackFeed/' + n).size, 0);
  const runtime = media + ['assets/scripts/truckStackFeedGameScene.ts','assets/scripts/truckStackRules.ts','assets/gamescene/TruckStackFeedGameScene.scene'].reduce((sum, p) => sum + fs.statSync(p).size, 0);
  assert(runtime < 1024 * 1024, 'new uncompressed runtime inputs stay below 1 MiB');
  console.log('PASS truck scene/routing/registration, shared UI/audio, both portrait layouts, idempotence; new runtime input bytes:', runtime, 'media:', media);
})().catch(error => {console.error(error); process.exitCode = 1;});
