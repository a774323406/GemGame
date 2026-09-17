// Offline SDK callback simulations; never sends real Douyin analytics or requests ads.
// Run from the project root: node tools/test_ad_analytics.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require(process.env.AD_TEST_TYPESCRIPT_PATH ||
  '/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const scripts = path.join(__dirname, '../assets/scripts');

function fixture() {
  const events = [], rewardedRequests = [], interstitialRequests = [], warnings = [];
  const lifecycleEvents = [], audioCalls = [], overlays = [];
  let timerId = 0, now = 10_000, timers = [];
  const config = { showAd: true };
  const playData = { ispause: false };
  let scene = { name: 'GameScene' }, bytedance = true;
  const api = { reportAnalytics(event, payload) { events.push([event, { ...payload }]); } };
  const cc = {
    director: {
      getScene: () => scene, emit(type, ...args) { lifecycleEvents.push([type, ...args]); },
      pause() { assert.fail('interstitial must not pause director'); },
      resume() { assert.fail('interstitial must not resume director'); },
    },
    Component: class {}, Node: class {}, Button: class {}, Label: class {},
    Vec3: class {},
    _decorator: { ccclass: () => type => type, property: () => () => {} },
  };
  const mocks = {
    cc,
    './EnvTool': { EnvTool: { isByteDanceMiniGame: () => bytedance } },
    './BaseSDK': { BaseSDK: class {} },
    '../../../GameConfig': { GameConfig: config },
    '../../../data/PlayData': { default: { Instance: playData } },
    '../../AudioManager': { default: new Proxy({}, { get: (_, name) => () => audioCalls.push(name) }) },
    '../../../ui/adLoadPanel': { adLoadPanel: { show() { overlays.push('show'); }, hide() { overlays.push('hide'); } } },
    './GlobalTool': { GlobalTool: { isPlayingAD: false, setWatchADTime() {} } },
  };
  function load(file) {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(path.join(scripts, file), 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        experimentalDecorators: true,
      },
    }).outputText;
    vm.runInNewContext(code, {
      exports, tt: api, Date: class extends Date { static now() { return now; } },
      setTimeout(fn, ms) { const id = ++timerId; timers.push({ id, at: now + ms, fn }); return id; },
      clearTimeout(id) { timers = timers.filter(t => t.id !== id); },
      console: { log() {}, warn(...args) { warnings.push(args); }, error() {} },
      require(name) { return mocks[name] || {}; },
    });
    return exports;
  }
  const sdk = load('framework/Platform/sdk/SdkUtils.ts').SdkUtils;
  sdk.sdk = {
    showADVideo(close, fail, shown) { rewardedRequests.push({ close, fail, shown }); },
    showInterstitialAd(close, fail, shown, canShow) { interstitialRequests.push({ close, fail, shown, canShow }); },
  };
  return {
    sdk, config, api, events, rewardedRequests, interstitialRequests, warnings, playData, load,
    lifecycleEvents, audioCalls, overlays,
    advance(ms) {
      const end = now + ms;
      while (true) {
        timers.sort((a, b) => a.at - b.at || a.id - b.id);
        if (!timers.length || timers[0].at > end) break;
        const timer = timers.shift(); now = timer.at; timer.fn();
      }
      now = end;
    },
    scene(value) { scene = value; },
    platform(value) { bytedance = value; },
  };
}

async function main() {
  const tests = [];
  const test = (name, run) => tests.push([name, run]);

  test('every current scene reports its gameplay name for both ad types', () => {
    const f = fixture();
    const cases = {
      MainScene: '拼豆排序', GameScene: '拼豆排序',
      ShootingGlassBottlesGame: '打瓶子', ArcheryGameScene: '射箭',
      JuggleBallGameScene: '乒乓球第一关', MilkTeaFeedGameScene: '奶茶',
      PenRefillFeedGameScene: '插入笔芯', NailHammerFeedGameScene: '砸钉子',
      BalloonWheelFeedGameScene: '旋转打气球', PenguinStackFeedGameScene: '企鹅叠叠乐',
    };
    const sceneNames = Object.values(f.load('framework/GameSceneBundle.ts').GameSceneName);
    assert.deepEqual(sceneNames.sort(), Object.keys(cases).sort(), 'new scenes need an analytics name');
    for (const [name, feedType] of Object.entries(cases)) {
      f.scene({ name, getComponentInChildren: () => null });
      const before = f.events.length;
      f.sdk.showADVideo();
      assert.deepEqual(f.events.slice(before), [['adType', { feedType }]]);
      f.rewardedRequests.at(-1).close();
      f.sdk.showInterstitialAd();
      assert.equal(f.events.length, before + 1, 'loading is not an impression');
      f.interstitialRequests.at(-1).shown();
      assert.deepEqual(f.events.at(-1), ['interAdType', { feedType }]);
      f.interstitialRequests.at(-1).close();
    }
  });

  test('rewarded clicks count once even when loading fails; wrappers do not double count', async () => {
    const f = fixture();
    const failed = f.sdk.showRewardedVideo();
    assert.equal(f.events.length, 1);
    f.rewardedRequests[0].fail();
    assert.equal(await failed, false);
    const succeeded = f.sdk.showRewardedVideo();
    f.rewardedRequests[1].shown();
    f.rewardedRequests[1].shown();
    f.rewardedRequests[1].close();
    f.rewardedRequests[1].close();
    assert.equal(await succeeded, true);
    assert.deepEqual(f.events.map(([name]) => name), ['adType', 'adType']);
    assert.equal(f.playData.ispause, false);
  });

  test('busy rewarded entry still records the click without requesting a second ad', () => {
    const f = fixture();
    f.sdk.showADVideo();
    assert.equal(f.sdk.showADVideo(), false);
    assert.equal(f.events.length, 2);
    assert.equal(f.rewardedRequests.length, 1);
    assert.equal(f.sdk.showInterstitialAd(), false);
    assert.equal(f.interstitialRequests.length, 0);
    assert.equal(f.events.length, 2);
    f.rewardedRequests[0].fail();
  });

  test('interstitial failures do not count; repeated or late callbacks cannot duplicate impressions', () => {
    const f = fixture();
    f.sdk.showInterstitialAd();
    f.interstitialRequests[0].fail();
    f.interstitialRequests[0].shown();
    assert.equal(f.events.length, 0);
    f.sdk.showInterstitialAd();
    const request = f.interstitialRequests[1];
    request.shown(); request.shown(); request.close(); request.shown(); request.close();
    assert.deepEqual(f.events, [['interAdType', { feedType: '拼豆排序' }]]);
    assert.equal(f.playData.ispause, false);
  });

  test('juggle attribution follows the live level and is captured before asynchronous loading', () => {
    const f = fixture();
    const juggle = new (f.load('juggleBallGameScene.ts').juggleBallGameScene)();
    f.scene({ name: 'JuggleBallGameScene', getComponentInChildren: () => juggle });
    f.sdk.showADVideo(); f.rewardedRequests.at(-1).close();
    assert.equal(f.events.at(-1)[1].feedType, '乒乓球第一关');
    juggle.currentLevel = 2;
    f.sdk.showADVideo(); f.rewardedRequests.at(-1).close();
    assert.equal(f.events.at(-1)[1].feedType, '乒乓球第二关');
    f.sdk.showInterstitialAd();
    f.scene({ name: 'GameScene' });
    f.interstitialRequests[0].shown(); f.interstitialRequests[0].close();
    assert.equal(f.events.at(-1)[1].feedType, '乒乓球第二关');
    f.sdk.showADVideo(); f.rewardedRequests.at(-1).close();
    assert.equal(f.events.at(-1)[1].feedType, '拼豆排序');
  });

  test('missing or throwing analytics API cannot break ad rewards or pause recovery', async () => {
    for (const report of [undefined, () => { throw new Error('analytics unavailable'); }]) {
      const f = fixture();
      f.api.reportAnalytics = report;
      const reward = f.sdk.showRewardedVideo();
      f.rewardedRequests[0].shown(); f.rewardedRequests[0].close();
      assert.equal(await reward, true);
      f.sdk.showInterstitialAd();
      f.interstitialRequests[0].shown(); f.interstitialRequests[0].close();
      assert.equal(f.playData.ispause, false);
      assert.equal(f.sdk.isFullscreenAdBusy(), false);
    }
  });

  test('disabled ads and non-Douyin environments never emit Douyin events', () => {
    const disabled = fixture(); disabled.config.showAd = false;
    disabled.sdk.showADVideo(); disabled.sdk.showInterstitialAd();
    assert.equal(disabled.events.length, 0);
    const web = fixture(); web.platform(false);
    web.sdk.showADVideo(); web.rewardedRequests[0].close();
    web.sdk.showInterstitialAd(); web.interstitialRequests[0].shown(); web.interstitialRequests[0].close();
    assert.equal(web.events.length, 0);
  });

  test('loading/show/close never changes game pause, audio, touch listeners or overlays', () => {
    for (const pausedBefore of [false, true]) {
      const f = fixture();
      f.scene({ name: 'GameScene', on() { assert.fail('must not install input or other scene listeners'); } });
      f.playData.ispause = pausedBefore;
      for (let i = 0; i < 3; i++) {
        f.sdk.showInterstitialAd();
        assert.equal(f.playData.ispause, pausedBefore);
        f.interstitialRequests[i].shown();
        assert.equal(f.playData.ispause, pausedBefore);
        f.interstitialRequests[i].close();
        assert.equal(f.playData.ispause, pausedBefore);
        assert.equal(f.sdk.isFullscreenAdBusy(), false);
      }
      assert.equal(f.audioCalls.length, 0);
      assert.equal(f.overlays.length, 0);
      assert.deepEqual(f.lifecycleEvents, Array.from({ length: 3 }, () => [f.sdk.EVENT_INTERSTITIAL_ENDED]));
    }
  });

  test('native load rechecks foreground/scene eligibility before calling show', () => {
    const f = fixture(); let loaded, valid = true, shows = 0, destroyed = 0, failed = 0;
    f.api.createInterstitialAd = () => ({
      onLoad(fn) { loaded = fn; }, onClose() {}, onError() {}, load() {},
      show() { shows++; }, destroy() { destroyed++; },
    });
    f.sdk.sdk = new (f.load('framework/Platform/sdk/ByteDanceSDK.ts').ByteDanceSDK)();
    f.sdk.showInterstitialAd(null, () => failed++, null, () => valid);
    valid = false; loaded();
    assert.equal(shows, 0); assert.equal(destroyed, 1); assert.equal(failed, 1);
    assert.equal(f.events.length, 0); assert.equal(f.playData.ispause, false);
    assert.equal(f.sdk.isFullscreenAdBusy(), false);
  });

  test('native event/promise duplicate callbacks show once; timeout and late callbacks never lock gameplay', async () => {
    const f = fixture(), ads = [];
    f.api.createInterstitialAd = () => {
      const item = { shows: 0, destroyed: 0 }; ads.push(item);
      return {
        onLoad(fn) { item.loaded = fn; }, onClose(fn) { item.close = fn; }, onError(fn) { item.fail = fn; },
        load() { return new Promise(resolve => { item.resolveLoad = resolve; }); },
        show() { item.shows++; return new Promise(resolve => { item.resolveShow = resolve; }); },
        destroy() { item.destroyed++; },
      };
    };
    f.sdk.sdk = new (f.load('framework/Platform/sdk/ByteDanceSDK.ts').ByteDanceSDK)();
    f.sdk.showInterstitialAd(null, null, null, () => true);
    ads[0].loaded(); ads[0].resolveLoad(); await Promise.resolve(); await Promise.resolve();
    assert.equal(ads[0].shows, 1);
    ads[0].resolveShow(); await Promise.resolve(); await Promise.resolve();
    assert.equal(f.playData.ispause, false); assert.equal(f.events.length, 1);
    ads[0].close(); ads[0].close(); assert.equal(ads[0].destroyed, 1);
    f.sdk.showInterstitialAd();
    ads[1].loaded(); f.advance(15_000);
    assert.equal(ads[1].destroyed, 1); assert.equal(f.sdk.isFullscreenAdBusy(), false);
    ads[1].resolveShow(); await Promise.resolve(); await Promise.resolve();
    assert.equal(f.playData.ispause, false); assert.equal(f.events.length, 1);
    assert.deepEqual(f.lifecycleEvents, [[f.sdk.EVENT_INTERSTITIAL_ENDED]]);
  });

  for (const [name, run] of tests) { await run(); console.log('PASS ' + name); }
  console.log(`\n${tests.length} ad analytics checks passed.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
