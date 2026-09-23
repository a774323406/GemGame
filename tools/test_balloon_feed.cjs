// Offline checks; no actual ads, player storage or Douyin service calls.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require(process.env.NAIL_TEST_TYPESCRIPT_PATH ||
  '/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const scene = JSON.parse(fs.readFileSync('assets/gamescene/BalloonWheelFeedGameScene.scene', 'utf8'));

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { if (typeof x === 'object') ({ x, y, z } = x); Object.assign(this, { x, y, z }); return this; }
  clone() { return new Vec3(this.x, this.y, this.z); }
}
class Color {
  constructor(r = 255, g = 255, b = 255, a = 255) { Object.assign(this, { r, g, b, a }); }
  set(other) { Object.assign(this, other); }
  static WHITE = new Color();
}
class Emitter {
  entries = [];
  on(type, fn, owner) { this.entries.push({ type, fn, owner }); }
  off(type, fn, owner) { this.entries = this.entries.filter(x => x.type !== type || x.fn !== fn || x.owner !== owner); }
  emit(type, ...args) { for (const x of [...this.entries]) if (x.type === type) x.fn.apply(x.owner, args); }
}
class Sprite {}
class UIOpacity {}
class UITransform {
  constructor(node, data) { Object.assign(this, { node, width: data._contentSize.width, height: data._contentSize.height,
    anchorX: data._anchorPoint.x, anchorY: data._anchorPoint.y }); }
  convertToNodeSpaceAR(world) { return this.node.fromWorld(world); }
  hitTest(world) {
    const p = this.node.fromWorld(world);
    return p.x >= -this.width * this.anchorX && p.x <= this.width * (1 - this.anchorX) &&
      p.y >= -this.height * this.anchorY && p.y <= this.height * (1 - this.anchorY);
  }
}
class Node extends Emitter {
  constructor(data) { super(); this.name = data._name; this.position = new Vec3().set(data._lpos || new Vec3());
    this.scale = new Vec3().set(data._lscale || new Vec3(1, 1, 1)); this.angle = data._euler?.z || 0;
    this.active = data._active !== false; this.isValid = true; this.components = new Map(); }
  setPosition(...args) { this.position.set(...args); }
  setScale(...args) { this.scale.set(...args); }
  getComponent(type) { if (!this.isValid) throw new Error('getComponent on destroyed node'); return this.components.get(type); }
  get activeInHierarchy() { return this.active && (!this.parent || this.parent.activeInHierarchy); }
  get worldPosition() { return this.toWorld(new Vec3()); }
  toWorld(p) {
    const a = this.angle * Math.PI / 180, x = p.x * this.scale.x, y = p.y * this.scale.y;
    const q = new Vec3(this.position.x + x * Math.cos(a) - y * Math.sin(a), this.position.y + x * Math.sin(a) + y * Math.cos(a));
    return this.parent ? this.parent.toWorld(q) : q;
  }
  fromWorld(p) {
    const q = this.parent ? this.parent.fromWorld(p) : p;
    const x = q.x - this.position.x, y = q.y - this.position.y, a = -this.angle * Math.PI / 180;
    return new Vec3((x * Math.cos(a) - y * Math.sin(a)) / this.scale.x, (x * Math.sin(a) + y * Math.cos(a)) / this.scale.y, 0);
  }
}

function fixture(feedPreview = false) {
  const cache = {}, warnings = [], events = new Emitter(), app = new Emitter(), director = new Emitter();
  let currentScene = { name: 'BalloonWheelFeedGameScene', isValid: true }, rewardedBusy = false;
  director.getScene = () => currentScene;
  let feedListener, requests = 0, adResolver, busy = false, scheduled = 0, reports = 0, activations = 0;
  let now = 1_700_000_000_000, nextTimer = 0, timers = [], shown = 0;
  let state = { active: feedPreview, entered: false, exited: false };
  const feed = {
    init() {}, getState: () => state,
    addListener(fn) { feedListener = fn; fn(state); }, removeListener() { feedListener = null; },
    activateFromFirstTouch() { activations++; state = { ...state, entered: true }; feedListener?.(state); },
    reportSceneReadyAfterStableRender(options) { assert.equal(options.stableFrameCount, 3); assert.equal(options.surfaceDelayMs, 180); reports++; return Promise.resolve(true); },
    completeSession() { state = { active: false, entered: false, exited: false }; },
  };
  const cc = {
    _decorator: { ccclass: () => type => type, property: () => () => {} },
    Component: class { unscheduleAllCallbacks() {} }, Node, Vec3, Color, Sprite, UIOpacity, UITransform,
    Button: class { static EventType = { CLICK: 'click' }; },
    input: events, Input: { EventType: { TOUCH_START: 'touch' } }, game: app, director,
    Game: { EVENT_HIDE: 'hide', EVENT_SHOW: 'show' }, view: { setDesignResolutionSize() {} }, ResolutionPolicy: { FIXED_WIDTH: 1 },
    Director: { EVENT_AFTER_SCENE_LAUNCH: 'scene-launched' },
  };
  function load(file) {
    if (cache[file]) return cache[file];
    const exports = {}; cache[file] = exports;
    const code = ts.transpileModule(fs.readFileSync('assets/scripts/' + file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true },
    }).outputText;
    vm.runInNewContext(code, { exports,
      Date: class extends Date { static now() { return now; } },
      setTimeout(fn, delay) { const id = ++nextTimer; timers.push({ id, at: now + delay, fn }); return id; },
      clearTimeout(id) { timers = timers.filter(t => t.id !== id); },
      console: { log() {}, warn: (...x) => warnings.push(x), error: (...x) => warnings.push(x) }, require(name) {
      if (name === 'cc') return cc;
      if (name.endsWith('balloonWheelRules')) return load('balloonWheelRules.ts');
      if (name.endsWith('FeedAcquisitionService')) return { FeedAcquisitionService: feed };
      if (name.endsWith('AudioManager')) return { default: new Proxy({}, { get: () => () => {} }) };
      if (name.endsWith('ADController')) return load('framework/Platform/ADController.ts');
      if (name.endsWith('GameConfig')) return { GameConfig: { showAd: true } };
      if (name.endsWith('SdkUtils')) return { SdkUtils: { isFullscreenAdBusy: () => busy,
        isRewardedVideoBusy: () => rewardedBusy, EVENT_INTERSTITIAL_ENDED: 'interstitial-ended',
        EVENT_AD_PAUSE_CHANGED: 'ad-pause',
        showInterstitialAd(close, fail, onShown) { shown++; onShown(); director.emit('ad-pause', false); close(); return true; },
        showRewardedVideo() { requests++; return new Promise(resolve => adResolver = resolve); } } };
      if (name.endsWith('GameSceneBundle')) return {
        GameSceneName: { Main: 'NewMainScene', Game: 'GameScene', Balloon: 'BalloonWheelFeedGameScene' },
        GameSceneBundle: { loadScene: async name => {
          currentScene = { name, isValid: true }; director.emit('scene-launched');
        } },
      };
      if (name.endsWith('gamePrefabMgr')) return { soundName: {} };
      throw new Error(name);
    } }); return exports;
  }
  // Exercise the real shared scheduler with virtual time; never request a live ad.
  const adc = load('framework/Platform/ADController.ts').adc;
  adc.initialize(); // Mirrors loadScene boot for normal as well as feed entry.
  const schedule = adc.scheduleFeedEntryInterstitial.bind(adc);
  adc.scheduleFeedEntryInterstitial = callback => { scheduled++; schedule(callback); };
  function advance(seconds) {
    const end = now + seconds * 1000;
    while (true) {
      timers.sort((a, b) => a.at - b.at || a.id - b.id);
      if (!timers.length || timers[0].at > end) break;
      const timer = timers.shift(); now = timer.at; timer.fn();
    }
    now = end;
  }
  function controller() {
    const instance = new (load('balloonWheelFeedGameScene.ts').balloonWheelFeedGameScene)();
    const nodes = scene.map(data => data.__type__ === 'cc.Node' || data.__type__ === 'cc.Scene' ? new Node(data) : null);
    scene.forEach((data, i) => { if (nodes[i]) nodes[i].parent = nodes[data._parent?.__id__]; });
    const objects = scene.map((data, i) => {
      if (nodes[i]) return nodes[i];
      const node = nodes[data.node?.__id__]; if (!node) return {};
      const result = { node, isValid: true, string: data._string, color: new Color(), opacity: data._opacity ?? 255, interactable: true };
      if (data.__type__ === 'cc.UITransform') node.components.set(UITransform, new UITransform(node, data));
      if (data.__type__ === 'cc.Sprite') node.components.set(Sprite, result);
      if (data.__type__ === 'cc.UIOpacity') node.components.set(UIOpacity, result);
      return result;
    });
    const data = scene.find(item => item.characterHitMask);
    for (const [key, value] of Object.entries(data)) {
      if (value?.__id__ !== undefined) instance[key] = objects[value.__id__];
      else if (Array.isArray(value)) instance[key] = value.map(ref => objects[ref.__id__]);
      else if (typeof value === 'number') instance[key] = value;
    }
    instance.characterHitMask = { json: { width: 3, height: 3, rows: [[0, 3], [1, 2], [0, 1, 2, 3]] } };
    instance.onLoad(); instance.start();
    return instance;
  }
  return { load, controller, warnings, events, app, director, advance, shown: () => shown,
    requests: () => requests, reports: () => reports,
    scheduled: () => scheduled, activations: () => activations, resolveAd: value => adResolver(value),
    setBusy(value) { busy = value; }, setRewardedBusy(value) { rewardedBusy = value; },
    state(value) { state = { ...state, ...value }; feedListener?.(state); } };
}

async function main() {
  const tests = [], test = (name, run) => tests.push([name, run]);
  const rules = fixture().load('balloonWheelRules.ts');
  const round = () => { const r = new rules.BalloonWheelRound(); r.reset(); return r; };
  test('eight bullets, six balloons; perfect round leaves two bullets', () => {
    const r = round(); for (let i = 0; i < 6; i++) { r.fire(i); r.tick(0.2); }
    assert.equal(r.status, 'success'); assert.equal(r.remainingAmmo, 2); assert.equal(r.score, 2100); assert.equal(r.accuracy, 100);
  });
  test('two misses still allow the eighth bullet to win', () => {
    const r = round(); for (let i = 0; i < 2; i++) { r.fire('miss'); r.tick(0.2); }
    assert.equal(r.status, 'playing');
    for (let i = 0; i < 6; i++) { r.fire(i); r.tick(0.2); }
    assert.equal(r.status, 'success'); assert.equal(r.remainingAmmo, 0); assert.equal(r.shots, 8); assert.equal(r.score, 2100);
  });
  test('a miss spends ammo; last miss fails without awarding score', () => {
    const r = round(); for (let i = 0; i < 5; i++) { r.fire(i); r.tick(0.2); }
    for (let i = 0; i < 2; i++) { r.fire('miss'); r.tick(0.2); assert.equal(r.status, 'playing'); }
    r.fire('miss');
    assert.equal(r.failure, 'ammo'); assert.equal(r.hits, 5); assert.equal(r.score, 1750); assert.equal(r.remainingAmmo, 0);
  });
  test('character hit fails immediately, ignores any further shots', () => {
    const r = round(); r.fire('character'); assert.equal(r.failure, 'character'); assert.equal(r.remainingAmmo, 7);
    assert.equal(r.fire(0), null); assert.equal(r.shots, 1);
  });
  test('cooldown prevents double firing and a popped balloon cannot score twice', () => {
    const r = round(); r.fire(0); assert.equal(r.fire(1), null); assert.equal(r.remainingAmmo, 7);
    r.tick(0.2); r.fire(0); assert.equal(r.hits, 1); assert.equal(r.remainingAmmo, 6);
  });
  test('60 second timeout and reward increments obey round state', () => {
    const r = round(); r.addAmmo(5); r.addTime(30); assert.equal(r.remainingAmmo, 13); assert.equal(r.remainingTime, 90);
    r.tick(89.99); assert.equal(r.status, 'playing'); r.tick(0.02); assert.equal(r.failure, 'time');
    r.addAmmo(5); assert.equal(r.remainingAmmo, 13); assert.equal(r.remainingTime, 0);
  });
  test('removed skip has no UI binding, rule method, or reward request', async () => {
    const f = fixture(), g = f.controller();
    assert.equal(typeof g.round.skip, 'undefined'); assert.equal(typeof g.skipButton, 'undefined');
    await g.requestReward('skip');
    assert.equal(f.requests(), 0); assert.equal(g.round.status, 'playing'); assert.equal(g.round.remainingAmmo, 8);
  });
  test('alpha-mask spans preserve empty space between the limbs', () => {
    const m = { width: 10, height: 2, rows: [[1, 9], [1, 3, 7, 9]] };
    assert(rules.containsMaskPoint(m, 0.5, 0.2)); assert(!rules.containsMaskPoint(m, 0.5, 0.8));
    assert(rules.containsMaskPoint(m, 0.2, 0.8)); assert(!rules.containsMaskPoint(m, -0.1, 0.1));
    assert(!rules.containsMaskPoint(m, 1, 0.2));
  });
  test('preview already rotates but does not count down, spend bullets, or request ads', () => {
    const f = fixture(true), g = f.controller(); g.update(0.1);
    assert.equal(g.wheelRoot.angle, -10); assert.equal(g.round.remainingTime, 60); assert.equal(g.round.remainingAmmo, 8);
    assert.equal(f.scheduled(), 0); assert.equal(f.reports(), 1);
  });
  test('first real touch activates feed once; button corners never fire', () => {
    const f = fixture(true), g = f.controller();
    const p = g.ammoButton.node.worldPosition;
    g.onTouchStart({ windowId: 0, getLocation: () => ({ x: p.x + 62, y: p.y + 62 }),
      getUILocation: () => assert.fail('hitTest must use screen coordinates on scaled displays') });
    assert.equal(f.activations(), 1); assert.equal(f.scheduled(), 1); assert.equal(g.round.shots, 0);
    g.update(0.1); assert(g.round.remainingTime < 60);
  });
  test('normal entry gets repeated ads; feed preview never requests', () => {
    const home = fixture(); home.controller(); home.advance(120);
    assert.equal(home.scheduled(), 0); assert.equal(home.shown(), 2);
    const preview = fixture(true); preview.controller(); preview.advance(120);
    assert.equal(preview.scheduled(), 0); assert.equal(preview.shown(), 0);
  });
  test('real feed entry waits two seconds, duplicate events do not enqueue twice', () => {
    const f = fixture(true); f.controller(); f.advance(40);
    f.state({ entered: true }); f.state({ entered: true });
    assert.equal(f.scheduled(), 1); f.advance(1.99); assert.equal(f.shown(), 0);
    f.advance(0.02); assert.equal(f.shown(), 1);
  });
  test('first feed interstitial cannot show before process age thirty-one seconds', () => {
    const f = fixture(true); f.controller(); f.state({ entered: true });
    f.advance(30.99); assert.equal(f.shown(), 0);
    f.advance(0.02); assert.equal(f.shown(), 1);
  });
  test('fullscreen ad conflict postpones the feed interstitial for sixty seconds after closing', () => {
    const f = fixture(true); f.controller(); f.state({ entered: true }); f.setBusy(true);
    f.advance(35); assert.equal(f.shown(), 0);
    f.setBusy(false); f.director.emit('ad-pause', false);
    f.advance(59.99); assert.equal(f.shown(), 0);
    f.advance(0.02); assert.equal(f.shown(), 1);
  });
  test('background suspends a queued interstitial until the app is foreground', () => {
    const f = fixture(true); f.controller(); f.state({ entered: true }); f.app.emit('hide');
    f.advance(40); assert.equal(f.shown(), 0);
    f.app.emit('show'); f.advance(0.3); assert.equal(f.shown(), 1);
  });
  test('feed exit blocks display; reentry resumes the global queue after 2s', () => {
    const f = fixture(true); f.controller(); f.state({ entered: true }); f.advance(10);
    f.state({ entered: false, exited: true }); f.advance(21.01); assert.equal(f.shown(), 0);
    f.state({ entered: true, exited: false }); assert.equal(f.scheduled(), 1);
    f.advance(1.99); assert.equal(f.shown(), 0);
    f.advance(1.01); assert.equal(f.shown(), 1);
  });
  test('returning home and scene destruction preserve the global interstitial queue', async () => {
    const f = fixture(true), g = f.controller(); f.state({ entered: true }); f.advance(10);
    await g.navigate('NewMainScene'); g.onDestroy(); f.advance(21.01);
    assert.equal(f.shown(), 1); assert.equal(f.scheduled(), 1);
  });
  test('a new feed session still respects sixty seconds since the previous interstitial', () => {
    const f = fixture(true), g = f.controller(); f.state({ entered: true }); f.advance(31.01);
    assert.equal(f.shown(), 1); g.onDestroy();
    f.state({ active: true, entered: false, exited: false }); f.controller(); f.state({ entered: true });
    f.advance(59.98); assert.equal(f.shown(), 1);
    f.advance(0.02); assert.equal(f.shown(), 2);
  });
  test('existing background/feed-exit/rewarded handling remains intact', () => {
    const f = fixture(), g = f.controller(), before = g.wheelRoot.angle;
    g.onHide(); g.update(0.1); g.fire(); assert.equal(g.round.shots, 0); assert.equal(g.wheelRoot.angle, before);
    g.onShow(); f.setRewardedBusy(true); g.update(0.1); g.fire(); assert.equal(g.round.shots, 0); assert.equal(g.round.remainingTime, 60);
    f.setRewardedBusy(false); f.state({ active: true, entered: true, exited: true }); g.onFeedState({ active: true, entered: true, exited: true });
    g.update(0.1); assert.equal(g.wheelRoot.angle, before);
  });
  test('completed reward video grants +5 once, blocks concurrent requests and pauses the clock', async () => {
    const f = fixture(), g = f.controller(), p = g.requestReward('ammo');
    await g.requestReward('ammo'); assert.equal(f.requests(), 1); g.update(0.1); assert.equal(g.round.remainingTime, 60);
    f.resolveAd(true); await p; assert.equal(g.round.remainingAmmo, 13); assert.equal(g.adInFlight, false);
  });
  test('interstitial busy state does not lock touches, rotation or gameplay countdown', () => {
    const f = fixture(), g = f.controller();
    f.setBusy(true); g.update(0.1); g.fire();
    assert(g.wheelRoot.angle !== 0); assert(g.round.remainingTime < 60); assert.equal(g.round.shots, 1);
  });
  test('canceled reward grants nothing and reenables controls', async () => {
    const f = fixture(), g = f.controller(), p = g.requestReward('time'); f.resolveAd(false); await p;
    assert.equal(g.round.remainingTime, 60); assert.equal(g.timeButton.interactable, true);
  });
  test('successful time reward adds thirty seconds without completing the round', async () => {
    const f = fixture(), g = f.controller(); const p = g.requestReward('time'); f.resolveAd(true); await p;
    assert.equal(g.round.remainingTime, 90); assert.equal(g.round.remainingAmmo, 8);
    assert.equal(g.round.status, 'playing'); assert.equal(g.resultOverlay.active, false);
  });
  test('destruction during an ad ignores its late reward without accessing dead components', async () => {
    const f = fixture(), g = f.controller(), p = g.requestReward('ammo');
    for (const [button] of g.bindings) button.node.isValid = false;
    g.onDestroy(); g.node.isValid = false; f.resolveAd(true); await p;
    assert.equal(g.round.remainingAmmo, 8); assert.equal(f.events.entries.length, 0);
    assert(!f.app.entries.some(x => x.owner === g));
  });
  test('retry restores ammo/time/balloons and clears bullet holes/effects', () => {
    const f = fixture(), g = f.controller(); g.round.fire('character'); g.showResult(); g.bulletHoles[0].active = true;
    g.resetRound(); assert.equal(g.round.remainingAmmo, 8); assert.equal(g.round.remainingTime, 60); assert.equal(g.ammoLabel.string, '×8');
    assert(g.balloons.every(n => n.active)); assert(g.bulletHoles.every(n => !n.active)); assert(!g.resultOverlay.active);
  });
  test('failure shows ad revive and lower free retry; success restores the original buttons', () => {
    const g = fixture().controller(); g.round.fire('character'); g.showResult();
    assert(g.failureTitle.activeInHierarchy); assert.equal(g.failureTitle.parent, g.resultPanel);
    assert(g.reviveButton.node.activeInHierarchy); assert(g.failureRetryButton.node.activeInHierarchy);
    assert(g.resultHomeButton.node.activeInHierarchy); assert(!g.nextButton.node.active); assert(!g.retryButton.node.active);
    assert.equal(g.reviveButtonLabel.string, '原地复活');
    g.failureRetryButton.node.emit('click'); assert.equal(g.round.remainingAmmo, 8); assert(!g.resultOverlay.active);
    for (let i = 0; i < 6; i++) { g.round.fire(i); g.round.tick(0.2); } g.showResult();
    assert(g.successTitle.activeInHierarchy); assert(g.retryButton.node.activeInHierarchy); assert(g.nextButton.node.activeInHierarchy);
    assert(!g.reviveButton.node.active); assert(!g.failureRetryButton.node.active);
  });
  test('ammo revive grants five only after a completed ad and preserves progress', async () => {
    const f = fixture(), g = f.controller();
    g.round.fire(0); g.round.tick(0.2); g.balloons[0].active = false;
    while (g.round.status === 'playing') { g.round.fire('miss'); g.round.tick(0.2); }
    g.wheelRoot.angle = 123; g.showResult(); const time = g.round.remainingTime;
    assert.equal(g.reviveButtonLabel.string, '+5子弹复活');
    const p = g.requestReward('revive'); await g.requestReward('revive');
    assert.equal(f.requests(), 1); assert(!g.reviveButton.interactable); assert(!g.failureRetryButton.interactable);
    g.resetRound(); g.update(0.1); assert.equal(g.round.status, 'failed'); assert.equal(g.round.remainingAmmo, 0);
    f.resolveAd(true); await p;
    assert.equal(g.round.status, 'playing'); assert.equal(g.round.remainingAmmo, 5); assert.equal(g.round.remainingTime, time);
    assert.equal(g.round.hits, 1); assert.equal(g.round.score, 350); assert.equal(g.round.shots, 8);
    assert(!g.balloons[0].active); assert.equal(g.wheelRoot.angle, 123); assert(!g.resultOverlay.active);
    await g.requestReward('revive'); assert.equal(f.requests(), 1);
  });
  test('timeout revive adds twenty seconds without resetting ammo or balloon hits', async () => {
    const f = fixture(), g = f.controller(); g.round.fire(0); g.round.tick(60); g.showResult();
    assert.equal(g.reviveButtonLabel.string, '+20秒复活');
    const p = g.requestReward('revive'); f.resolveAd(true); await p;
    assert.equal(g.round.status, 'playing'); assert.equal(g.round.remainingTime, 20);
    assert.equal(g.round.remainingAmmo, 7); assert.equal(g.round.hits, 1);
  });
  test('character revive restores visuals in place without refunding the missed shot', async () => {
    const f = fixture(), g = f.controller(); g.round.fire('character'); g.showResult();
    g.character.getComponent(Sprite).color = new Color(255, 150, 150); g.muzzle.active = true;
    const p = g.requestReward('revive'); f.resolveAd(true); await p;
    assert.equal(g.round.status, 'playing'); assert.equal(g.round.failure, null); assert.equal(g.round.remainingAmmo, 7);
    assert.equal(g.character.getComponent(Sprite).color, g.originalCharacterColor); assert(!g.muzzle.active);
  });
  test('canceled revive keeps the failure panel and does not add resources', async () => {
    const f = fixture(), g = f.controller(); g.round.tick(60); g.showResult();
    const p = g.requestReward('revive'); f.resolveAd(false); await p;
    assert.equal(g.round.status, 'failed'); assert.equal(g.round.remainingTime, 0); assert.equal(g.round.remainingAmmo, 8);
    assert(g.resultOverlay.active); assert(g.reviveButton.interactable); assert(g.failureRetryButton.interactable);
  });
  test('destroying the scene during revive ignores the late ad reward', async () => {
    const f = fixture(), g = f.controller(); g.round.tick(60); g.showResult();
    const p = g.requestReward('revive'); g.onDestroy(); g.node.isValid = false; f.resolveAd(true); await p;
    assert.equal(g.round.status, 'failed'); assert.equal(g.round.remainingTime, 0);
  });
  test('revive handles exhausted ammo and time together and never revives a successful round', () => {
    const r = round(); r.reset(6, 1, 1); r.fire('character'); r.remainingTime = 0;
    assert(r.revive()); assert.equal(r.remainingAmmo, 5); assert.equal(r.remainingTime, 20); assert(!r.revive());
    r.reset(); for (let i = 0; i < 6; i++) { r.fire(i); r.tick(0.2); }
    assert.equal(r.status, 'success'); assert(!r.revive());
  });
  test('serialized UI has no invalid references and overlays fit every screen', () => {
    const ids = scene.filter(x => x._id).map(x => x._id); assert.equal(ids.length, new Set(ids).size);
    function check(value) {
      if (!value || typeof value !== 'object') return;
      if (value.__id__ !== undefined) assert(scene[value.__id__], 'dangling reference');
      for (const child of Object.values(value)) check(child);
    }
    check(scene);
    const components = node => node._components.map(ref => scene[ref.__id__]);
    for (const name of ['ResultOverlay', 'DimBackground']) {
      const n = scene.find(x => x.__type__ === 'cc.Node' && x._name === name);
      const w = components(n).find(x => x.__type__ === 'cc.Widget'); assert.equal(w._alignFlags, 45); assert.equal(w._alignMode, 2);
      for (const edge of ['_top', '_bottom', '_left', '_right']) assert.equal(w[edge], 0);
    }
    assert(!scene.some(x => x.__type__ === 'cc.Graphics'));
    for (const name of ['SuccessTitle', 'FailureTitle', 'AddTimeButton', 'AmmoSupplyButton']) {
      assert(scene.some(x => x.__type__ === 'cc.Node' && x._name === name));
    }
    assert(!scene.some(x => x._name === 'SkipButton' || x._string === '跳关'));
    const data = scene.find(x => x.characterHitMask);
    assert.equal(data.initialAmmo, 8); assert.equal(scene[data.ammoLabel.__id__]._string, '×8');
    assert.equal(scene[scene[data.timeButton.__id__].node.__id__]._lpos.x, -150);
    assert.equal(scene[scene[data.ammoButton.__id__].node.__id__]._lpos.x, 150);
    assert.equal(scene[data.failureTitle.__id__]._parent.__id__, data.resultPanel.__id__, 'failure title must be in the live panel');
    const revive = scene[scene[data.reviveButton.__id__].node.__id__];
    assert(revive._children.some(r => scene[r.__id__]._name === 'AdBadge'), 'revive must have an editor-authored ad badge');
    const home = scene[scene[data.resultHomeButton.__id__].node.__id__];
    const retry = scene[scene[data.failureRetryButton.__id__].node.__id__];
    assert.equal(home._parent.__id__, retry._parent.__id__); assert(home._lpos.x < retry._lpos.x);
    const script = fs.readFileSync('assets/scripts/balloonWheelFeedGameScene.ts', 'utf8');
    assert(!/new Node\(|addComponent\(|cancelFeedEntryInterstitial\(/.test(script));
  });
  for (const [name, run] of tests) { await run(); console.log('PASS ' + name); }
  console.log(`\n${tests.length} balloon feed checks passed.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
