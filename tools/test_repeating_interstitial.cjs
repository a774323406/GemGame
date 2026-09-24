// Offline timing and scene-transition checks; never requests native ads or sends analytics.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
function compile(file) {
  return ts.transpileModule(fs.readFileSync('assets/scripts/' + file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}
class Emitter {
  listeners = [];
  on(type, fn, owner) { this.listeners.push({ type, fn, owner }); }
  emit(type, ...args) {
    for (const item of this.listeners) if (item.type === type) item.fn.apply(item.owner, args);
  }
}
function fixture() {
  let now = 1_700_000_000_000, serial = 0, timers = [], busy = false;
  let scene = { name: 'NewMainScene', isValid: true };
  const requests = [], game = new Emitter(), director = new Emitter();
  const feed = { active: false, entered: false, exited: false, mode: 'acquisition', contentId: '' };
  const config = { showAd: true }, bundle = { isLoadingScene: false };
  director.getScene = () => scene;
  // The scheduler must never pause the engine or install touch interception.
  director.pause = director.resume = () => assert.fail('interstitial must not change engine pause');
  const sceneNames = Object.fromEntries([
    'NewMainScene', 'GameScene', 'JuggleBallGameScene', 'ShootingGlassBottlesGame',
    'PenguinStackFeedGameScene', 'FoodDeliveryFeedGameScene',
    'WhiteGooseFeedGameScene',
  ].map(name => [name, name]));
  const sdk = {
    EVENT_AD_PAUSE_CHANGED: 'rewarded-pause', EVENT_INTERSTITIAL_ENDED: 'interstitial-ended',
    isFullscreenAdBusy: () => busy,
    showInterstitialAd(close, fail, shown, canShow) {
      assert(!busy); busy = true;
      const request = {
        at: now, shown: false, ended: false, canShow,
        show() {
          if (this.ended || this.shown) return;
          if (!canShow()) { this.fail(); return; }
          this.shown = true; shown();
        },
        close() {
          if (this.ended) return;
          this.ended = true; busy = false;
          if (this.shown) director.emit('interstitial-ended');
          close();
        },
        fail() { if (this.ended) return; this.ended = true; busy = false; fail(); },
      };
      requests.push(request);
      return true;
    },
  };
  const exports = {};
  vm.runInNewContext(compile('framework/Platform/ADController.ts'), {
    exports, console: { log() {} },
    Date: class extends Date { static now() { return now; } },
    setTimeout(fn, ms) { const id = ++serial; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimeout(id) { timers = timers.filter(t => t.id !== id); },
    require(name) {
      if (name === 'cc') return { director, game, Game: { EVENT_HIDE: 'hide', EVENT_SHOW: 'show' },
        Director: { EVENT_AFTER_SCENE_LAUNCH: 'scene-launched' } };
      if (name.endsWith('GameConfig')) return { GameConfig: config };
      if (name.endsWith('GameSceneBundle')) return { GameSceneName: sceneNames, GameSceneBundle: bundle };
      if (name.endsWith('FeedAcquisitionService')) return { FeedAcquisitionService: { getState: () => feed } };
      if (name.endsWith('SdkUtils')) return { SdkUtils: sdk };
      throw Error(name);
    },
  });
  const adc = exports.adc; adc.initialize();
  return {
    adc, game, director, feed, bundle, requests, config,
    now: () => now, timers: () => timers.length, busy(value) { busy = value; },
    scene(value) { scene = value; director.emit('scene-launched'); },
    enter() { Object.assign(feed, { active: true, entered: true, exited: false }); adc.scheduleFeedEntryInterstitial(); },
    exit() { Object.assign(feed, { entered: false, exited: true }); adc.cancelFeedEntryInterstitial(); },
    advance(ms) {
      const end = now + ms;
      while (true) {
        timers.sort((a, b) => a.at - b.at || a.id - b.id);
        if (!timers.length || timers[0].at > end) break;
        const timer = timers.shift(); now = timer.at; timer.fn();
      }
      now = end;
    },
  };
}
const tests = [];
const test = (name, run) => tests.push([name, run]);
test('normal entry repeats within two minutes, then keeps repeating after close +60s', () => {
  const f = fixture(), start = f.now();
  f.advance(30_999); assert.equal(f.requests.length, 0);
  f.advance(1); f.requests[0].show(); f.advance(5_000); f.requests[0].close();
  f.advance(59_999); assert.equal(f.requests.length, 1);
  f.advance(1); assert.equal(f.requests[1].at - start, 96_000);
  f.requests[1].show(); f.requests[1].close(); f.advance(60_000);
  assert.equal(f.requests.length, 3);
});
test('one pending request even with repeated entry/result notifications or a long open ad', () => {
  const f = fixture(); f.enter(); f.advance(31_000); f.requests[0].show();
  for (let i = 0; i < 10; i++) {
    f.adc.scheduleFeedEntryInterstitial();
    f.adc.onLevelResult(1, 'pass'); f.adc.initialize();
  }
  f.advance(180_000); assert.equal(f.requests.length, 1); assert.equal(f.timers(), 0);
  f.requests[0].close(); f.requests[0].close();
  assert.equal(f.timers(), 1); f.advance(60_000); assert.equal(f.requests.length, 2);
});
test('feed preview never requests; enter waits 2s and still obeys startup 31s', () => {
  const f = fixture(); f.feed.active = true; f.advance(90_000);
  assert.equal(f.requests.length, 0); f.enter();
  f.advance(1_999); assert.equal(f.requests.length, 0);
  f.advance(1); assert.equal(f.requests.length, 1);
  const cold = fixture(); cold.enter(); cold.advance(30_999);
  assert.equal(cold.requests.length, 0); cold.advance(1); assert.equal(cold.requests.length, 1);
});
test('exit during loading cancels show, and reentry allows another attempt after 2s', () => {
  const f = fixture(); f.enter(); f.advance(31_000);
  f.exit(); f.requests[0].show(); assert(!f.requests[0].shown);
  f.advance(90_000); assert.equal(f.requests.length, 1);
  f.enter(); f.advance(2_000); assert.equal(f.requests.length, 2);
});
test('preview state is checked even when a scene omits cancellation on feed exit', () => {
  const f = fixture(); f.enter(); f.advance(31_000);
  Object.assign(f.feed, { entered: false, exited: true });
  f.requests[0].show(); assert(!f.requests[0].shown);
  f.advance(60_000); assert.equal(f.requests.length, 1);
});
test('all games, home and result pages share cooldown; feed completion does not stop ads', () => {
  const f = fixture(); f.enter(); f.advance(31_000); f.requests[0].show(); f.requests[0].close();
  f.adc.cancelFeedEntryInterstitial(); f.feed.active = false;
  for (const name of ['NewMainScene', 'GameScene', 'JuggleBallGameScene',
    'ShootingGlassBottlesGame',
    'PenguinStackFeedGameScene',
    'FoodDeliveryFeedGameScene', 'WhiteGooseFeedGameScene']) {
    f.scene({ name, isValid: true }); f.adc.onLevelResult(1, 'pass', { eligible: false });
    f.advance(1_000);
  }
  assert.equal(f.requests.length, 1);
  f.advance(53_000); assert.equal(f.requests.length, 2);
});
test('background stops timer and invalidates asynchronous native presentation', () => {
  const f = fixture(); f.advance(31_000);
  f.game.emit('hide'); f.requests[0].show();
  assert(!f.requests[0].shown); assert.equal(f.timers(), 0);
  f.advance(120_000); assert.equal(f.requests.length, 1);
  f.game.emit('show'); f.advance(250); assert.equal(f.requests.length, 2);
});
test('sharing/fullscreen requests are exclusive; rewarded end restarts cooldown', () => {
  const f = fixture(); f.busy(true); f.advance(90_000); assert.equal(f.requests.length, 0);
  f.director.emit('rewarded-pause', true); f.advance(30_000);
  f.busy(false); f.director.emit('rewarded-pause', false);
  f.advance(59_999); assert.equal(f.requests.length, 0);
  f.advance(1); assert.equal(f.requests.length, 1);
});
test('loading screen, bundle loading, scene swaps and destroyed scenes cannot display', () => {
  const f = fixture(); f.scene({ name: 'loadScene', isValid: true });
  f.advance(50_000); assert.equal(f.requests.length, 0);
  f.scene({ name: 'NewMainScene', isValid: true }); f.bundle.isLoadingScene = true;
  f.advance(50_000); assert.equal(f.requests.length, 0);
  f.bundle.isLoadingScene = false; f.scene({ name: 'PenguinStackFeedGameScene', isValid: true });
  f.advance(649); assert.equal(f.requests.length, 0);
  f.advance(1); assert.equal(f.requests.length, 1);
  f.scene({ name: 'JuggleBallGameScene', isValid: true });
  assert(!f.requests[0].canShow()); f.requests[0].show();
  f.scene(null); f.advance(100_000); assert.equal(f.requests.length, 1);
});
test('no-fill backs off 15/30/60 seconds, caps at 60 and resets after successful close', () => {
  const f = fixture(); f.advance(31_000);
  for (const delay of [15_000, 30_000, 60_000, 60_000]) {
    const count = f.requests.length;
    f.requests.at(-1).fail(); f.advance(delay - 1); assert.equal(f.requests.length, count);
    f.advance(1); assert.equal(f.requests.length, count + 1);
  }
  f.requests.at(-1).show(); f.requests.at(-1).close(); f.advance(60_000);
  const count = f.requests.length;
  f.requests.at(-1).fail(); f.advance(15_000); assert.equal(f.requests.length, count + 1);
});
test('disabled ads do not request; an invalid feed entry callback only blocks that session', () => {
  const f = fixture(); f.config.showAd = false; f.advance(100_000); assert.equal(f.requests.length, 0);
  f.config.showAd = true; f.enter(); f.adc.scheduleFeedEntryInterstitial(() => false);
  f.advance(60_000); assert.equal(f.requests.length, 0);
  f.feed.active = false; f.advance(1_000); assert.equal(f.requests.length, 1);
});
test('scene loading remains nonblocking but protects the pending launch frame', async () => {
  let launched, runCalls = 0;
  const bundle = { getSceneInfo: () => ({}), loadScene(name, cb) { cb(null, { name }); } };
  const exports = {};
  vm.runInNewContext(compile('framework/GameSceneBundle.ts'), {
    exports, require(name) {
      if (name === 'cc') return { director: { runScene(scene, before, after) { runCalls++; launched = after; } } };
      if (name.endsWith('ResourceManager')) return { ResourceManager: { ins: { loadBundle: async () => bundle } } };
      throw Error(name);
    },
  });
  const loader = exports.GameSceneBundle;
  await loader.loadScene(exports.GameSceneName.Main);
  assert.equal(loader.isLoadingScene, true, 'load call returns, but launch frame is still protected');
  await loader.loadScene(exports.GameSceneName.Game); assert.equal(runCalls, 1);
  launched(); assert.equal(loader.isLoadingScene, false);
});
(async () => {
  for (const [name, run] of tests) { await run(); console.log('PASS ' + name); }
  console.log('\n' + tests.length + ' repeating interstitial checks passed.');
})().catch(err => { console.error(err); process.exitCode = 1; });
