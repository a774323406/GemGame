// Verify actual scene startup/lifecycle code with audio spies, without playing ads or sound.
// Run from the project root: node tools/test_feed_audio.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require(process.env.FEED_AUDIO_TEST_TYPESCRIPT_PATH ||
  '/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
  clone() { return new Vec3(this.x, this.y, this.z); }
  static ONE = new Vec3(1, 1, 1);
}
class Node {
  isValid = true;
  on() {}
  getChildByName() { return null; }
  static EventType = { TOUCH_START: 'start', TOUCH_MOVE: 'move', TOUCH_END: 'end', TOUCH_CANCEL: 'cancel' };
}

const scenes = [
  ['penguinStackFeedGameScene', 'getUserBgm', 'onFeedStateChanged', 'onHide', 'onShow', 'isFeedInteractionEnabled'],
  ['shootingGlassBottlesGame', 'getUserBgm', 'onFeedStateChanged', 'onGameHide', 'onGameShow', 'isFeedInteractionEnabled'],
  ['juggleBallGameScene', 'getUserBgm', 'onFeedStateChanged', 'onGameHide', 'onGameShow', 'isFeedInteractionEnabled'],
];

async function fixture(descriptor, active = true) {
  const [name, music, stateMethod, hideMethod, showMethod, interactionMethod] = descriptor;
  const calls = [], errors = [], cache = {};
  let scheduled = 0, rewardedBusy = false, listener;
  let state = { active, entered: false, exited: false, sceneReadyReported: false };
  const audio = new Proxy({}, { get: (_, method) => (...args) => calls.push({ method, args }) });
  const feed = {
    getState: () => state, isActive: () => state.active,
    addListener(fn) { listener = fn; fn(state); },
    reportSceneReadyAfterStableRender: async () => true,
  };
  const cc = {
    _decorator: { ccclass: () => type => type, property: () => () => {} },
    Component: class { unschedule() {} scheduleOnce() {} }, Node, Vec3, Color: class {}, Button: class {},
  };
  function load(file) {
    if (cache[file]) return cache[file];
    const exports = {}; cache[file] = exports;
    const code = ts.transpileModule(fs.readFileSync('assets/scripts/' + file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true },
    }).outputText;
    vm.runInNewContext(code, { exports,
      console: { log() {}, warn() {}, error: (...args) => errors.push(args) },
      require(path) {
        if (path === 'cc') return cc;
        if (path.endsWith('AudioManager')) return { default: audio };
        if (path.endsWith('FeedAcquisitionService')) return { FeedAcquisitionService: feed };
        if (path.endsWith('ADController')) return { adc: {
          cancelFeedEntryInterstitial() {}, scheduleFeedEntryInterstitial() { scheduled++; },
        } };
        if (path.endsWith('SdkUtils')) return { SdkUtils: { isRewardedVideoBusy: () => rewardedBusy } };
        if (path.endsWith('gamePrefabMgr')) return { soundName: { getUserBgm: 'getUserBgm' } };
        if (path.endsWith('penguinStackRules')) return load('penguinStackRules.ts');
        return {};
      },
    }, { filename: file });
    return exports;
  }
  const controller = new (load(name + '.ts')[name])();
  controller.node = new Node();
  controller.feedMode = active;
  // Leave start and all audio/feed lifecycle handlers real; stub only rendering/resource work.
  for (const method of ['refreshButtons', 'bindNativeFeedTouchFallback', 'bindNativeTouchFallback',
    'updatePreview', 'showFeedPreview', 'startChallenge', 'bindSceneReferences', 'startLevel']) controller[method] = () => {};
  for (const method of ['reportFeedSceneReady', 'reportFeedSceneAfterArtworkReady', 'loadGameResources']) {
    controller[method] = async () => {};
  }
  await controller.start();
  assert.deepEqual(errors, [], name + ' startup errors');
  return {
    controller, calls, music,
    scheduled: () => scheduled,
    playing: () => calls.filter(c => c.method === 'playMusic' || c.method === 'restartMusic'),
    pauses: () => calls.filter(c => c.method === 'pauseBgmForVideo'),
    entered: () => controller[interactionMethod](),
    notify(update) { state = { ...state, ...update }; (listener || controller[stateMethod])(state); },
    hide() { controller[hideMethod](); }, show() { controller[showMethod](); },
    rewarded(value) { rewardedBusy = value; },
  };
}

async function main() {
  let checks = 0;
  for (const descriptor of scenes) {
    const [name] = descriptor;
    const f = await fixture(descriptor);
    assert.equal(f.playing().length, 1, name + ' must play during preview startup');
    assert.equal(f.playing()[0].args[0], f.music);
    assert.equal(f.pauses().length, 0);
    assert.equal(f.entered(), false);
    assert.equal(f.scheduled(), 0);
    checks++;

    // Readiness notifications and real entry must not repeatedly restart an already playing BGM.
    f.notify({ sceneReadyReported: true });
    assert.equal(f.calls.filter(c => c.method === 'restartMusic').length, 1);
    assert.equal(f.scheduled(), 0);
    f.notify({ entered: true });
    assert.equal(f.entered(), true);
    assert.equal(f.scheduled(), 1);
    assert.equal(f.calls.filter(c => c.method === 'restartMusic').length, 1);
    checks++;

    // Returning to the visible feed card is not the same as backgrounding the application.
    f.notify({ entered: false, exited: true });
    assert.equal(f.entered(), false);
    assert.equal(f.pauses().length, 0);
    assert.equal(f.playing().at(-1).args[0], f.music);
    checks++;

    f.hide();
    const beforeHiddenEvent = f.playing().length;
    f.notify({ sceneReadyReported: true });
    assert.equal(f.playing().length, beforeHiddenEvent, name + ' must stay quiet in background');
    assert.equal(f.pauses().length, 1);
    f.show();
    assert.equal(f.playing().length, beforeHiddenEvent + 1, name + ' resume even without feedEnter');
    assert.equal(f.playing().at(-1).args[0], f.music);
    checks++;

    f.rewarded(true);
    const beforeAd = f.playing().length;
    f.notify({ entered: true, exited: false });
    f.show();
    assert.equal(f.playing().length, beforeAd, name + ' must not override rewarded-ad pause');
    f.rewarded(false);
    f.controller.adInFlight = true;
    f.notify({ entered: false });
    f.show();
    assert.equal(f.playing().length, beforeAd, name + ' must respect the scene ad guard');
    f.controller.adInFlight = false;
    f.show();
    assert.equal(f.playing().length, beforeAd + 1);
    checks++;

    const normal = await fixture(descriptor, false);
    assert.equal(normal.playing().length, 1, name + ' normal entry retains original music');
    assert.equal(normal.playing()[0].args[0], normal.music);
    assert.equal(normal.scheduled(), 0);
    checks++;
    console.log('PASS', name, 'preview BGM, feed entry/exit, background, rewarded-ad guards, normal entry');
  }
  console.log(`\n${checks} feed audio lifecycle checks passed (mock playback; not device audio verification).`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
