const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');

function transpile(file) {
  return ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      experimentalDecorators: true,
      esModuleInterop: true,
    },
  }).outputText;
}

function loadRules() {
  const output = {};
  vm.runInNewContext(transpile('assets/scripts/whiteGooseRoundRules.ts'), {
    exports: output,
    module: { exports: output },
    Math,
    Set,
    Error,
  });
  return output;
}

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
  clone() { return new Vec3(this.x, this.y, this.z); }
  static get ONE() { return new Vec3(1, 1, 1); }
  static distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
}

class Node {
  static EventType = { TOUCH_START: 'touch-start' };
  constructor(name = '') { Object.assign(this, { name, isValid: true, active: true, children: [] }); }
  on() {}
  off() {}
  getComponent() { return null; }
}

class Component {
  constructor() { this.node = new Node('Controller'); }
  scheduleOnce() {}
  unscheduleAllCallbacks() {}
}

function fixture() {
  let state = { active: true, mode: 'acquisition', entered: false, exited: false, contentId: 'xxx' };
  let added = 0;
  let removed = 0;
  let completed = 0;
  let readyOptions = null;
  let scheduled = 0;
  let cancelled = 0;
  let listener = null;

  const feed = {
    init() {},
    isActive: () => state.active,
    getState: () => state,
    addListener(value) { added += 1; listener = value; },
    removeListener(value) { removed += 1; if (listener === value) listener = null; },
    completeSession() { completed += 1; state = { ...state, active: false, entered: false }; },
    reportSceneReadyAfterStableRender: async options => { readyOptions = options; },
    activateFromFirstTouch() {},
  };
  const adc = {
    cancelFeedEntryInterstitial() { cancelled += 1; },
    scheduleFeedEntryInterstitial() { scheduled += 1; },
  };
  const audio = { setSoundEvent() {}, playMusic() {}, restartMusic() {}, pauseBgmForVideo() {}, playDefaultBgm() {} };
  const cc = {
    _decorator: { ccclass: () => value => value, property: () => () => {} },
    Button: class Button { static EventType = { CLICK: 'click' }; },
    Component,
    EventTouch: class EventTouch {},
    game: { on() {}, off() {} },
    Game: { EVENT_HIDE: 'hide', EVENT_SHOW: 'show' },
    input: { on() {}, off() {} },
    Input: { EventType: { TOUCH_START: 'touch-start' } },
    instantiate: () => new Node('Ring'),
    Label: class Label {},
    Node,
    ResolutionPolicy: { FIXED_WIDTH: 1 },
    sp: { Skeleton: class Skeleton {} },
    tween: () => ({ to() { return this; }, by() { return this; }, call() { return this; }, start() { return this; } }),
    Tween: { stopAllByTarget() {} },
    UIOpacity: class UIOpacity {},
    UITransform: class UITransform {},
    Vec3,
    view: { setDesignResolutionSize() {} },
  };
  const output = {};
  vm.runInNewContext(transpile('assets/scripts/whiteGooseFeedGameScene.ts'), {
    exports: output,
    module: { exports: output },
    require(id) {
      if (id === 'cc') return cc;
      if (id === './whiteGooseRoundRules') return loadRules();
      if (id === './framework/AudioManager') return { __esModule: true, default: audio };
      if (id === './framework/GameSceneBundle') {
        return { GameSceneBundle: { loadScene: async () => {} }, GameSceneName: { Main: 'NewMainScene', Game: 'GameScene' } };
      }
      if (id === './framework/Platform/FeedAcquisitionService') return { FeedAcquisitionService: feed };
      if (id === './framework/Platform/ADController') return { adc };
      if (id === './framework/Platform/sdk/SdkUtils') {
        return { SdkUtils: { isRewardedVideoBusy: () => false, showRewardedVideo: async () => true } };
      }
      if (id === './gamePrefabMgr') {
        return { soundName: {
          whiteGooseBgm: 'whiteGooseBgm',
          whiteGooseCall1: 'whiteGooseCall1',
          whiteGooseCall2: 'whiteGooseCall2',
          whiteGooseCall3: 'whiteGooseCall3',
        } };
      }
      throw new Error(`unexpected dependency: ${id}`);
    },
    console,
    Math,
    Promise,
    Set,
    Map,
    Error,
  });
  return {
    Controller: output.whiteGooseFeedGameScene,
    feed,
    setState(next) { state = { ...state, ...next }; },
    emit(next) { state = { ...state, ...next }; listener?.(state); },
    counts: () => ({ added, removed, completed, scheduled, cancelled }),
    ready: () => readyOptions,
  };
}

(async () => {
  const f = fixture();
  const game = new f.Controller();
  game.feedMode = true;
  game.feedEntered = false;
  game.feedExited = false;
  game.phase = 'preview';
  game.sceneBackground = new Node('Background');
  game.sceneGooseSlots = new Node('GooseSlots');
  game.sceneThrowingHand = new Node('ThrowingHand');
  game.sceneForeground = new Node('Foreground');
  game.refreshHud = () => {};

  let resets = 0;
  game.resetRound = startPlaying => {
    resets += 1;
    game.phase = startPlaying ? 'playing' : 'preview';
  };

  game.start();
  await Promise.resolve();
  assert.equal(f.counts().added, 1, 'feed listener must be registered once');
  assert.equal(f.ready().stableFrameCount, 3, 'scene readiness must wait for stable rendering');
  assert.equal(
    Array.from(f.ready().requiredVisibleNodes, node => node.name).join(','),
    'Background,GooseSlots,ThrowingHand,Foreground',
  );
  assert.equal(game.isInteractionEnabled(), false, 'preview must reject interaction');

  f.emit({ entered: true, exited: false });
  f.emit({ entered: true, exited: false });
  assert.equal(resets, 1, 'only the first real feed entry may reset the round');
  assert.equal(game.isInteractionEnabled(), true, 'real entry must enable interaction');
  assert.equal(f.counts().scheduled, 1, 'one feed entry may schedule only one interstitial');

  game.finishFeedExperience();
  game.finishFeedExperience();
  game.onDestroy();
  assert.equal(f.counts().completed, 1, 'the feed session must complete exactly once');
  assert(f.counts().removed >= 1, 'the feed listener must be removed');

  console.log('White goose feed lifecycle tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
