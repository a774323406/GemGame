// Offline API/controller simulation; does not call Douyin or modify player data.
// Run from the project root: node tools/test_feed_revisit_disabled.cjs
const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const ts = require(process.env.NAIL_TEST_TYPESCRIPT_PATH ||
  '/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');

function fixture(enabledOverride) {
  const calls = [], warnings = [], storage = new Map(), cache = {};
  const noop = () => {};
  const cc = {
    _decorator: { ccclass: () => type => type, property: () => noop },
    Component: class {},
    Button: class { static EventType = { CLICK: 'click' }; },
    Node: class { static EventType = { TOUCH_END: 'touch-end' }; },
    game: { on: noop }, Game: { EVENT_SHOW: 'show' },
    sys: { localStorage: {
      getItem(key) { calls.push('storage.get'); return storage.get(key) ?? null; },
      setItem(key, value) { calls.push('storage.set'); storage.set(key, value); },
      removeItem(key) { calls.push('storage.remove'); storage.delete(key); },
    } },
  };
  const api = {
    login(options) { calls.push('login'); options.success({ isLogin: true }); },
    checkFeedSubscribeStatus(options) { calls.push('checkFeedSubscribeStatus'); options.success({ status: false }); },
    requestFeedSubscribe(options) { calls.push('requestFeedSubscribe'); options.success({ success: true }); },
    storeFeedData(options) { calls.push(['storeFeedData', options.contentID]); options.success(); },
    getEnvInfoSync() { return { microapp: { envType: 'production' } }; },
    getLaunchOptionsSync() {
      return { scene: '103041', query: {
        feed_game_scene: '0', feed_game_channel: '2', feed_game_content_id: 'CONTENT14868790274',
      } };
    },
    onFeedStatusChange: noop,
    reportScene(options) { calls.push(['reportScene', options.sceneId]); options.success(); },
  };
  const env = {
    isByteDanceMiniGame() { calls.push('checkEnvironment'); return true; },
    getMiniGameApi() { calls.push('getApi'); return api; },
  };
  function load(file) {
    if (cache[file]) return cache[file];
    const exports = {}; cache[file] = exports;
    const code = ts.transpileModule(fs.readFileSync('assets/scripts/' + file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true },
    }).outputText;
    vm.runInNewContext(code, {
      exports, setTimeout, clearTimeout,
      console: { log: noop, warn: (...args) => warnings.push(args), error: (...args) => warnings.push(args) },
      require(name) {
        if (name === 'cc') return cc;
        if (name.endsWith('EnvTool')) return { EnvTool: env };
        if (name.endsWith('FeedRevisitConfig')) return load('framework/Platform/FeedRevisitConfig.ts');
        if (name.endsWith('FeedRevisitService')) return load('framework/Platform/FeedRevisitService.ts');
        if (name.endsWith('SidebarRewardService')) return { SidebarRewardService: {
          addListener: noop, init: noop, checkAvailability: noop,
        } };
        if (name.endsWith('ShareRewardService')) return { ShareRewardService: { refreshDailyState: noop } };
        return {};
      },
    });
    if (file.endsWith('FeedRevisitConfig.ts') && enabledOverride !== undefined) {
      exports.FEED_REVISIT_ENABLED = enabledOverride;
    }
    return exports;
  }
  return { load, calls, warnings, storage };
}

async function main() {
  const tests = [];
  const test = (name, run) => tests.push([name, run]);
  test('checked-in configuration disables revisit without changing acquisition IDs', () => {
    const f = fixture(), config = f.load('framework/Platform/FeedRevisitConfig.ts');
    assert.equal(config.FEED_REVISIT_ENABLED, false);
    assert.equal(config.FEED_SHOOTING_CONTENT_ID, 'CONTENT14389313538');
    assert.equal(config.FEED_NAIL_HAMMER_CONTENT_ID, 'CONTENT14868790274');
    assert.equal(config.FEED_JUGGLE_CONTENT_ID, 'CONTENT14893670402');
    assert.equal(config.FEED_JUGGLE_LEVEL2_CONTENT_ID, 'CONTENT14759731202');
  });
  test('repeated home initialization makes no revisit API or storage calls', async () => {
    const f = fixture(), service = f.load('framework/Platform/FeedRevisitService.ts').FeedRevisitService;
    assert.equal(service.isEnabled(), false);
    for (let i = 0; i < 3; i++) {
      const result = await service.initialize();
      assert.equal(result.available, false);
      assert.equal(result.shouldShowSubscribeEntry, false);
    }
    assert.deepEqual(f.calls, []); assert.deepEqual(f.warnings, []);
  });
  test('old subscribe/settlement/reward entry points are silent no-ops even with cached state', async () => {
    const f = fixture(), service = f.load('framework/Platform/FeedRevisitService.ts').FeedRevisitService;
    service.loggedIn = true; service.subscribed = true;
    f.storage.set('gem_sort_feed_revisit_content_id_v1', 'CONTENT14389313538');
    f.storage.set('gem_sort_feed_revisit_ready_at_v1', '1900000000000');
    const before = [...f.storage];
    assert.equal(await service.requestSubscribeFromUserGesture(), 'disabled');
    assert.equal(await service.ensureImportantEventScheduled(), false);
    service.scheduleNextImportantEvent();
    service.scheduleNextImportantEvent('CONTENT14256097026');
    service.scheduleNextImportantEvent('CONTENT14389313538');
    assert.equal(service.claimChallengeReward('CONTENT14389313538', JSON.stringify({
      event: 'shooting_bottle_challenge', readyAt: 1900000000000,
    })), false);
    await Promise.resolve();
    assert.deepEqual(f.calls, []); assert.deepEqual(f.warnings, []);
    assert.deepEqual([...f.storage], before);
  });
  test('home hides the authored revisit button without initializing its service', () => {
    const f = fixture(), home = new (f.load('mainScene.ts').mainScene)();
    home.milkTeaGameBtn = { node: { on() {} } };
    const reminder = { node: { active: true, on() { assert.fail('disabled revisit must not bind clicks'); } } };
    home.feedSubscribeBtn = reminder;
    home.refreshFeedSubscribeEntry = () => assert.fail('disabled revisit must not initialize from home');
    home.showDouyinToast = () => assert.fail('disabled revisit must not show a failure toast');
    home.onLoad();
    home.handleFeedSubscribeResult('disabled');
    assert.equal(home.feedSubscribeBtn, reminder);
    assert.equal(reminder.node.active, false);
    assert.deepEqual(f.calls, []); assert.deepEqual(f.warnings, []);
  });
  test('acquisition launch and 7001 scene-ready reporting still work while revisit is off', () => {
    const f = fixture(), service = f.load('framework/Platform/FeedAcquisitionService.ts').FeedAcquisitionService;
    const state = service.getState();
    assert.equal(state.active, true); assert.equal(state.mode, 'acquisition');
    assert.equal(state.contentId, 'CONTENT14868790274');
    service.reportSceneReady(); service.reportSceneReady();
    assert.deepEqual(f.calls.filter(Array.isArray), [['reportScene', 7001]]);
    assert.deepEqual(f.warnings, []);
  });
  test('re-enabled home binds the existing reminder without constructing UI', () => {
    const f = fixture(true), home = new (f.load('mainScene.ts').mainScene)();
    const handlers = [];
    const reminder = { node: { active: true, on: (...args) => handlers.push(args) } };
    home.feedSubscribeBtn = reminder;
    let refreshCount = 0;
    home.refreshFeedSubscribeEntry = () => { refreshCount++; };
    home.onLoad();
    assert.equal(home.feedSubscribeBtn, reminder);
    assert.equal(reminder.node.active, false, 'Keep hidden until availability is known');
    assert.equal(refreshCount, 1);
    assert.equal(handlers.length, 1);
    assert.equal(handlers[0][0], 'click');
    assert.equal(handlers[0][1], home.onFeedSubscribeClicked);
    assert.equal(handlers[0][2], home);
    assert.deepEqual(f.calls, []);
  });
  test('retained revisit implementation can still initialize when explicitly re-enabled', async () => {
    const f = fixture(true), service = f.load('framework/Platform/FeedRevisitService.ts').FeedRevisitService;
    const result = await service.initialize();
    await Promise.resolve();
    assert.equal(result.available, true); assert.equal(result.shouldShowSubscribeEntry, true);
    assert(f.calls.includes('login')); assert(f.calls.includes('checkFeedSubscribeStatus'));
    assert.deepEqual(f.calls.filter(Array.isArray), [['storeFeedData', 'CONTENT14389313538']]);
    assert.deepEqual(f.warnings, []);
  });
  for (const [name, run] of tests) { await run(); console.log('PASS ' + name); }
  console.log(`\n${tests.length} revisit suspension checks passed.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
