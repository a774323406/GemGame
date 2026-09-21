// Node-side controller simulations and serialized scene checks, not a device preview.
// Run from the project root: node tools/test_feed_integration.cjs
const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const ts = require(process.env.NAIL_TEST_TYPESCRIPT_PATH ||
  '/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const scripts = 'assets/scripts/';

class Emitter {
  listeners = [];
  on(type, fn, owner) { this.listeners.push({ type, fn, owner }); }
  off(type, fn, owner) { this.listeners = this.listeners.filter(x => x.type !== type || x.fn !== fn || x.owner !== owner); }
  emit(type, ...args) { for (const x of [...this.listeners]) if (x.type === type) x.fn.apply(x.owner, args); }
}
class Vec3 {
  constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
  clone() { return new Vec3(this.x, this.y, this.z); }
  static ONE = new Vec3(1, 1, 1);
}
class Component { unscheduleAllCallbacks() {} }
class Sprite {}
class UITransform {}
class UIOpacity {}

function fixture() {
  let now = 1_700_000_000_000, nextTimer = 0, timers = [], busy = false, shown = 0, scheduled = 0;
  let state = { active: true, mode: 'acquisition', entered: false, exited: false, contentId: '' };
  let feedListener, firstTouches = 0;
  const animations = [];
  const game = new Emitter(), director = new Emitter();
  let currentScene = { name: 'NailHammerFeedGameScene', isValid: true };
  director.getScene = () => currentScene;
  const audio = new Proxy({}, { get: () => () => {} });
  const cc = {
    _decorator: { ccclass: () => type => type, property: () => () => {} },
    Component, Sprite, UITransform, UIOpacity, Vec3, Color: class {},
    Node: class { static EventType = { TOUCH_START: 'touch-start' }; },
    Button: class { static EventType = { CLICK: 'click' }; },
    input: new Emitter(), Input: { EventType: { TOUCH_START: 'touch-start' } },
    game, director, Game: { EVENT_HIDE: 'hide', EVENT_SHOW: 'show' },
    Director: { EVENT_AFTER_SCENE_LAUNCH: 'scene-launched' },
    tween(target) {
      const chain = { to(duration, values) { animations.push({ target, duration, values }); return chain; }, start() { return chain; } };
      return chain;
    },
    Tween: { stopAllByTarget() {} },
  };
  const sdk = {
    EVENT_AD_PAUSE_CHANGED: 'ad-pause',
    EVENT_INTERSTITIAL_ENDED: 'interstitial-ended',
    isFullscreenAdBusy: () => busy,
    isRewardedVideoBusy: () => busy,
    showInterstitialAd(close, fail, onShown) { shown++; onShown(); close(); return true; },
  };
  const feed = {
    getState: () => state, isActive: () => state.active, getContentId: () => state.contentId,
    removeListener() { feedListener = null; },
    completeSession() { state = { ...state, active: false, entered: false }; },
    activateFromFirstTouch() {
      firstTouches++; state = { ...state, entered: true, exited: false }; feedListener?.(state);
    },
  };
  const cache = {};
  function load(file) {
    if (cache[file]) return cache[file];
    const exports = {}; cache[file] = exports;
    const code = ts.transpileModule(fs.readFileSync(scripts + file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true,
    } }).outputText;
    vm.runInNewContext(code, {
      exports, console: { log() {}, warn() {}, error() {} },
      Date: class extends Date { static now() { return now; } },
      setTimeout(fn, delay) { const id = ++nextTimer; timers.push({ id, at: now + delay, fn }); return id; },
      clearTimeout(id) { timers = timers.filter(t => t.id !== id); },
      require(name) {
        if (name === 'cc') return cc;
        if (name.endsWith('FeedRevisitConfig')) return load('framework/Platform/FeedRevisitConfig.ts');
        if (name.endsWith('GameSceneBundle')) return load('framework/GameSceneBundle.ts');
        if (name.endsWith('ADController')) return load('framework/Platform/ADController.ts');
        if (name.endsWith('SdkUtils')) return { SdkUtils: sdk };
        if (name.endsWith('GameConfig')) return { GameConfig: { showAd: true } };
        if (name.endsWith('FeedAcquisitionService')) return { FeedAcquisitionService: feed };
        if (name.endsWith('AudioManager')) return { default: audio };
        if (name.endsWith('gamePrefabMgr')) return { default: {}, soundName: {}, uiName: {} };
        if (name.endsWith('PlayData')) return { default: { Instance: { ispause: false } } };
        if (name.endsWith('penguinStackRules')) return load('penguinStackRules.ts');
        return {};
      },
    });
    return exports;
  }
  const adc = load('framework/Platform/ADController.ts').adc;
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
  function nail() {
    const g = new (load('nailHammerFeedGameScene.ts').nailHammerFeedGameScene)();
    g.node = { isValid: true }; g.feedMode = true; g.refreshButtons = () => {};
    g.sceneResultOverlay = { active: false };
    for (const key of ['sceneBackButton', 'sceneAddHammersButton', 'sceneReplayButton', 'sceneNextButton']) g[key] = { node: null };
    g.isTouchInsideNode = () => false;
    g.performStrike = () => {};
    feedListener = g.onFeedStateChanged;
    return g;
  }
  function penguin() {
    currentScene = { name: 'PenguinStackFeedGameScene', isValid: true };
    const g = new (load('penguinStackFeedGameScene.ts').penguinStackFeedGameScene)();
    g.node = { isValid: true };
    g.feedMode = true;
    g.feedFinished = false;
    g.disposed = false;
    g.leaving = false;
    g.appHidden = false;
    g.refreshButtons = () => {};
    g.showFeedPreview = () => {};
    feedListener = g.onFeedStateChanged;
    return g;
  }
  return {
    load, nail, penguin, advance, adc, game, director, animations, cc,
    shown: () => shown, scheduled: () => scheduled, firstTouches: () => firstTouches,
    destroyScene() { currentScene = null; },
    setState(value) { state = { ...state, ...value }; },
    enter() { state = { ...state, entered: true, exited: false }; feedListener?.(state); },
    exit() { state = { ...state, entered: false, exited: true }; feedListener?.(state); },
    busy(value) { busy = value; },
  };
}

async function main() {
  const tests = [];
  const test = (name, fn) => tests.push([name, fn]);
  test('all eight result overlays/dims stretch to Canvas and block input', async () => {
    const { fitFeedResultOverlay, appendSceneGlobals } = await import('./feed_result_layout.mjs');
    const names = ['ArcheryGameScene', 'BalloonWheelFeedGameScene', 'JuggleBallGameScene',
      'FoodDeliveryFeedGameScene', 'NailHammerFeedGameScene', 'PenguinStackFeedGameScene',
      'ShootingGlassBottlesGame', 'WhiteGooseFeedGameScene'];
    for (const name of names) {
      const data = JSON.parse(fs.readFileSync(`assets/gamescene/${name}.scene`, 'utf8'));
      const component = (node, type) => node._components.map(ref => data[ref.__id__]).find(x => x.__type__ === type);
      const overlay = data.find(x => x.__type__ === 'cc.Node' && x._name === 'ResultOverlay');
      assert.equal(data[overlay._parent.__id__]._name, 'Canvas');
      assert(component(overlay, 'cc.BlockInputEvents'));
      const layers = [overlay, ...overlay._children.map(ref => data[ref.__id__]).filter(x => /^(ResultDim|ResultDimBackground|DimBackground)$/.test(x._name))];
      for (const node of layers) {
        const widget = component(node, 'cc.Widget');
        assert(widget?._enabled, name + '/' + node._name);
        assert.equal(widget._alignFlags, 45); assert.equal(widget._alignMode, 2); assert.equal(widget._target, null);
        for (const side of ['_left', '_right', '_top', '_bottom']) assert.equal(widget[side], 0);
        assert.equal(node._lscale.x, 1); assert.equal(node._lscale.y, 1);
        for (const [width, height] of [[750, 1334], [750, 1624], [750, 1800], [1024, 1366]]) {
          assert.equal(width - widget._left - widget._right, width);
          assert.equal(height - widget._top - widget._bottom, height);
        }
      }
      const before = JSON.stringify(data); fitFeedResultOverlay(data, name); assert.equal(JSON.stringify(data), before, 'layout migration must be idempotent');
      const globals = []; appendSceneGlobals(data, globals);
      assert(!globals.some(x => /Widget|Sprite|BlockInput/.test(x.__type__)), 'scene generation must not copy trailing UI as globals');
      const ids = data.filter(x => x._id).map(x => x._id); assert.equal(new Set(ids).size, ids.length);
      function refs(value) {
        if (!value || typeof value !== 'object') return;
        if ('__id__' in value) assert(data[value.__id__], `${name}: invalid reference`);
        for (const child of Object.values(value)) refs(child);
      }
      refs(data);
      if (name === 'JuggleBallGameScene') assert(component(overlay, 'cc.Sprite'), 'juggle dim must be an editor-visible sprite');
    }
  });
  test('new Content IDs route to the requested games; juggle selects the correct level', () => {
    const f = fixture();
    const config = f.load('framework/Platform/FeedRevisitConfig.ts');
    assert.equal(config.FEED_BALLOON_WHEEL_CONTENT_ID, 'CONTENT14816266754');
    assert.equal(config.FEED_WHITE_GOOSE_CONTENT_ID, 'xxx');
    const loader = new (f.load('loadScene.ts').loadScene)();
    const juggle = new (f.load('juggleBallGameScene.ts').juggleBallGameScene)(); juggle.feedMode = true;
    const cases = [
      ['CONTENT14893670402', 'JuggleBallGameScene', 1],
      ['CONTENT14759731202', 'JuggleBallGameScene', 2],
      ['CONTENT14868790274', 'NailHammerFeedGameScene'],
      ['CONTENT14389077506', 'ArcheryGameScene'],
      ['CONTENT14389313538', 'ShootingGlassBottlesGame'],
      ['CONTENT14816266754', 'BalloonWheelFeedGameScene'],
      ['CONTENT14860954626', 'PenguinStackFeedGameScene'],
      ['xxx', 'WhiteGooseFeedGameScene'],
    ];
    for (const [contentId, scene, level] of cases) {
      f.setState({ contentId }); assert.equal(loader.resolveFeedEntry().sceneName, scene);
      if (level) assert.equal(juggle.resolveEntryLevel(), level);
    }
    f.setState({ contentId: 'unknown' }); assert.equal(loader.resolveFeedEntry().sceneName, 'ShootingGlassBottlesGame');
    f.setState({ mode: 'revisit', contentId: 'CONTENT14868790274' }); assert.equal(loader.resolveFeedEntry().sceneName, 'ShootingGlassBottlesGame');
  });
  test('bottle popup scales only the panel, never the full-screen dim', () => {
    const f = fixture(), g = new (f.load('shootingGlassBottlesGame.ts').shootingGlassBottlesGame)();
    const panel = { isValid: true, setScale(...values) { this.scale = values; } };
    const opacity = { isValid: true, opacity: 255 };
    const overlay = { isValid: true, active: false, getChildByName: () => panel, setScale(value) { this.scale = value; } };
    g.overlay = overlay; g.resultOverlayOpacity = opacity; g.showOverlay();
    assert.equal(overlay.scale, Vec3.ONE);
    assert(!f.animations.some(x => x.target === overlay));
    assert(f.animations.some(x => x.target === panel && x.values.scale === Vec3.ONE));
    g.hideOverlay(); assert(!overlay.active);
  });
  test('juggle sprite dim is not painted over with a fixed-size Graphics rectangle', () => {
    const f = fixture(), g = new (f.load('juggleBallGameScene.ts').juggleBallGameScene)();
    const overlay = { getComponent: type => type === Sprite ? {} : null }; g.sceneResultOverlay = overlay;
    g.getGraphics = node => { assert.notEqual(node, overlay); return null; };
    g.drawSceneArtwork();
  });
  test('nail preview does not request an interstitial; real enter waits two seconds', () => {
    const f = fixture(); f.nail(); f.advance(40); assert.equal(f.shown(), 0); assert.equal(f.scheduled(), 0);
    f.enter(); f.enter(); assert.equal(f.scheduled(), 1);
    f.advance(1.99); assert.equal(f.shown(), 0); f.advance(0.02); assert.equal(f.shown(), 1);
  });
  test('nail first interstitial waits for process age 31 seconds', () => {
    const f = fixture(); f.nail(); f.enter(); f.advance(30.99); assert.equal(f.shown(), 0);
    f.advance(0.02); assert.equal(f.shown(), 1);
  });
  test('nail exit cancels queued interstitial and re-entry schedules a fresh request', () => {
    const f = fixture(); f.nail(); f.enter(); f.advance(10); f.exit(); f.advance(40); assert.equal(f.shown(), 0);
    f.enter(); f.advance(2.01); assert.equal(f.shown(), 1);
  });
  test('nail fullscreen ad conflicts observe the same 60-second cooldown', () => {
    const f = fixture(); f.nail(); f.enter(); f.busy(true); f.advance(35); assert.equal(f.shown(), 0);
    f.busy(false); f.director.emit('ad-pause', false);
    f.advance(59.99); assert.equal(f.shown(), 0); f.advance(0.02); assert.equal(f.shown(), 1);
  });
  test('backgrounding suspends the queued interstitial until foreground', () => {
    const f = fixture(); f.nail(); f.enter(); f.game.emit('hide'); f.advance(40); assert.equal(f.shown(), 0);
    f.game.emit('show'); f.advance(0.3); assert.equal(f.shown(), 1);
  });
  test('nail real canvas press recovers a missing feedEnter once', () => {
    const f = fixture(), g = f.nail();
    g.onGlobalTouchStart({}); g.onGlobalTouchStart({});
    assert.equal(f.firstTouches(), 1); assert.equal(f.scheduled(), 1); assert(g.feedEntered);
  });
  test('ending a feed session continues global ads; destroyed/leaving scenes cannot show', () => {
    const f = fixture(), g = f.nail(); f.enter(); g.finishFeedExperience(); f.advance(100); assert.equal(f.shown(), 2);
    const next = fixture(), other = next.nail(); next.enter(); other.onDestroy(); next.destroyScene(); next.advance(100); assert.equal(next.shown(), 0);
    const leaving = fixture(), third = leaving.nail(); leaving.enter(); third.roundState = 'leaving'; leaving.advance(100); assert.equal(leaving.shown(), 0);
  });
  test('penguin feed entry schedules one interstitial after the platform delay', () => {
    const f = fixture(); f.penguin(); f.advance(40);
    assert.equal(f.shown(), 0); assert.equal(f.scheduled(), 0);
    f.enter(); f.enter(); assert.equal(f.scheduled(), 1);
    f.advance(1.99); assert.equal(f.shown(), 0);
    f.advance(0.02); assert.equal(f.shown(), 1);
  });
  test('penguin feed exit cancels and re-entry schedules a fresh interstitial', () => {
    const f = fixture(); f.penguin(); f.enter(); f.advance(10); f.exit(); f.advance(40);
    assert.equal(f.shown(), 0);
    f.enter(); assert.equal(f.scheduled(), 2); f.advance(2.01); assert.equal(f.shown(), 1);
  });
  test('penguin session completion keeps repeated ads on the result page', () => {
    const f = fixture(), g = f.penguin(); f.enter(); g.finishFeed(); f.advance(100);
    assert.equal(f.shown(), 2);
  });
  test('penguin move-only input immediately recovers a missing touch start', () => {
    const f = fixture(), g = f.penguin();
    g.dragging = false; g.targetWhaleX = 0;
    g.continueDrag(0.8);
    assert.equal(g.dragging, true);
    assert(Math.abs(g.targetWhaleX - 225) < 0.001);
    g.continueDrag(0.9);
    assert.equal(g.targetWhaleX, 305, 'continued dragging must respect the playfield edge');
  });
  for (const [name, run] of tests) { await run(); console.log('PASS ' + name); }
  console.log(`\n${tests.length} feed integration checks passed.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
