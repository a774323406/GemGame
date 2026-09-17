// Exercise the actual controller onLoad/start and FeedAcquisitionService together.
// Scene nodes come from the editor file; only Cocos rendering and the host API are simulated.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require(process.env.PENGUIN_TEST_TYPESCRIPT_PATH ||
  '/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');

class Emitter {
  listeners = [];
  on(type, fn, owner) { this.listeners.push({ type, fn, owner }); }
  off(type, fn, owner) { this.listeners = this.listeners.filter(x => x.type !== type || x.fn !== fn || x.owner !== owner); }
  once(type, fn) { const once = (...args) => { this.off(type, once); fn(...args); }; this.on(type, once); }
  emit(type, ...args) { for (const x of [...this.listeners]) if (x.type === type) x.fn.apply(x.owner, args); }
}
class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, typeof x === 'object' ? x : { x, y, z }); }
}
class Component { isValid = true; unscheduleAllCallbacks() {} }
class Node extends Emitter {
  static EventType = { TOUCH_START: 'start', TOUCH_MOVE: 'move', TOUCH_END: 'end', TOUCH_CANCEL: 'cancel' };
  isValid = true;
  active = true;
  components = [];
  position = new Vec3();
  scale = new Vec3(1, 1, 1);
  get activeInHierarchy() { return this.active && (!this.parent || this.parent.activeInHierarchy); }
  getComponent(type) { return this.components.find(c => c instanceof type) || null; }
  setPosition(...args) { this.position.set(...args); }
  setScale(...args) { this.scale.set(...args); }
}
class Button extends Component { static EventType = { CLICK: 'click' }; }
class Sprite extends Component { enabled = true; spriteFrame = { isValid: true }; }
class Label extends Component {}
class UITransform extends Component { hitTest() { return false; } }
class UIOpacity extends Component {}

function fixture(feedMode = true) {
  const input = new Emitter(), game = new Emitter(), director = new Emitter(), native = new Emitter();
  const reports = [], warnings = [], errors = [];
  let now = 0, serial = 0, timers = [];
  const api = {
    getLaunchOptionsSync: () => ({ scene: feedMode ? '103041' : '1001', query: {
      feed_game_scene: 0, feed_game_channel: 2, feed_game_content_id: 'CONTENT14860954626',
    } }),
    onFeedStatusChange: fn => native.on('feed', fn),
    offFeedStatusChange: fn => native.off('feed', fn),
    getSystemInfoSync: () => ({ windowWidth: 375 }),
    reportScene(options) { reports.push(options.sceneId); options.success?.(); },
  };
  for (const [name, type] of Object.entries(Node.EventType)) {
    const suffix = { TOUCH_START: 'Start', TOUCH_MOVE: 'Move', TOUCH_END: 'End', TOUCH_CANCEL: 'Cancel' }[name];
    api['onTouch' + suffix] = fn => native.on(type, fn);
    api['offTouch' + suffix] = fn => native.off(type, fn);
  }
  const cc = { Node, Component, Button, Sprite, Label, UITransform, UIOpacity, Vec3, Color: class {},
    input, game, director, Input: { EventType: Node.EventType },
    Game: { EVENT_HIDE: 'hide', EVENT_SHOW: 'show' }, Director: { EVENT_END_FRAME: 'frame' },
    view: { setDesignResolutionSize() {}, getVisibleSize: () => ({ width: 750, height: 1624 }) },
    ResolutionPolicy: { FIXED_WIDTH: 1 },
    _decorator: { ccclass: () => type => type, property: () => () => {} },
  };
  const cache = {};
  function load(file) {
    if (cache[file]) return cache[file];
    const exports = {}; cache[file] = exports;
    const code = ts.transpileModule(fs.readFileSync('assets/scripts/' + file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true },
    }).outputText;
    vm.runInNewContext(code, { exports, tt: api,
      console: { log() {}, warn: (...args) => warnings.push(args.join(' ')), error: (...args) => errors.push(args.join(' ')) },
      setTimeout(fn, delay) { const id = ++serial; timers.push({ id, at: now + delay, fn }); return id; },
      clearTimeout(id) { timers = timers.filter(t => t.id !== id); },
      require(name) {
        if (name === 'cc') return cc;
        if (name.endsWith('FeedAcquisitionService')) return load('framework/Platform/FeedAcquisitionService.ts');
        if (name.endsWith('penguinStackRules')) return load('penguinStackRules.ts');
        if (name.endsWith('EnvTool')) return { EnvTool: { isByteDanceMiniGame: () => true, getMiniGameApi: () => api } };
        if (name.endsWith('AudioManager')) return { default: new Proxy({}, { get: () => () => {} }) };
        if (name.endsWith('ADController')) return { adc: { cancelFeedEntryInterstitial() {}, scheduleFeedEntryInterstitial() {} } };
        if (name.endsWith('SdkUtils')) return { SdkUtils: { isRewardedVideoBusy: () => false } };
        if (name.endsWith('gamePrefabMgr')) return { soundName: {} };
        if (name.endsWith('GameSceneBundle')) return { GameSceneName: {} };
        throw new Error('Unexpected dependency: ' + name);
      },
    }, { filename: file });
    return exports;
  }
  const data = JSON.parse(fs.readFileSync('assets/gamescene/PenguinStackFeedGameScene.scene', 'utf8'));
  const classes = { 'cc.Node': Node, 'cc.Scene': Node, 'cc.Button': Button, 'cc.Sprite': Sprite,
    'cc.Label': Label, 'cc.UITransform': UITransform, 'cc.UIOpacity': UIOpacity };
  const objects = data.map(o => classes[o.__type__] ? new classes[o.__type__]() : {});
  data.forEach((o, i) => {
    const item = objects[i];
    if (item instanceof Node) {
      item.name = o._name; item.active = o._active; item.parent = objects[o._parent?.__id__];
      item.components = (o._components || []).map(ref => objects[ref.__id__]);
      item.setPosition(o._lpos); item.setScale(o._lscale);
    } else if (item instanceof Component) {
      item.node = objects[o.node?.__id__] || null;
      if (item instanceof UITransform) Object.assign(item, o._contentSize);
    }
  });
  const serialized = data.find(o => o.finalTarget === 200 && o.stageOneTarget === 10);
  const g = new (load('penguinStackFeedGameScene.ts').penguinStackFeedGameScene)();
  for (const [key, value] of Object.entries(serialized)) {
    if (key.startsWith('_')) continue;
    g[key] = value && Number.isInteger(value.__id__) ? objects[value.__id__] :
      Array.isArray(value) ? value.map(ref => objects[ref.__id__]) : value;
  }
  const feed = load('framework/Platform/FeedAcquisitionService.ts').FeedAcquisitionService;
  async function frame(update = false) {
    if (update) g.update(1 / 60);
    director.emit('frame');
    await Promise.resolve();
    now += 100;
    const due = timers.filter(t => t.at <= now); timers = timers.filter(t => t.at > now);
    due.forEach(t => t.fn());
    await Promise.resolve();
  }
  return { g, feed, input, native, reports, warnings, errors, frame,
    async settle() { for (let i = 0; i < 8; i++) await frame(); },
    boot() { g.onLoad(); g.start(); },
  };
}

(async () => {
  const tests = [
    ['cold feed startup reports 7001 without waiting for user entry', async () => {
      const f = fixture(); f.boot(); await f.settle();
      assert.deepEqual(f.reports, [7001], 'feed startup is stuck: ' + f.warnings.join('; '));
      assert.equal(f.g.fallingPenguins.filter(n => n.active).length, 1, 'card shows just one penguin');
      assert(f.g.stackPenguins.every(n => !n.active), 'card must not show a prebuilt stack');
      assert.equal(f.g.gameStarted, false);
      assert.deepEqual(f.errors, []);
    }],
    ['card remains static and entering resets the round only once', async () => {
      const f = fixture(); f.boot();
      const preview = () => JSON.stringify({ penguin: f.g.fallingPenguins[0].position,
        whale: f.g.whale.position, tower: f.g.towerRoot.position, time: f.g.previewTime });
      const before = preview();
      for (let i = 0; i < 600; i++) f.g.update(1 / 60);
      assert.equal(preview(), before, 'waiting on the card must not move the penguin or whale');
      f.native.emit('feed', { type: 'feedEnter' });
      assert(f.g.fallingPenguins.every(n => !n.active));
      assert.equal(f.g.round.caught, 0); assert.equal(f.g.round.stage, 1);
      assert.equal(f.g.round.lives, 3); assert.equal(f.g.catcherSink, 0);
      assert.equal(f.g.targetWhaleX, 0); assert(f.g.guideNode.active);
      f.native.emit('start', { touches: [{ clientX: 100 }] });
      f.g.round.catchPenguin();
      f.native.emit('feed', { type: 'feedEnter' });
      assert.equal(f.g.round.caught, 1, 'duplicate feedEnter must not restart a playing round');
      f.native.emit('feed', { type: 'feedExit' });
      assert.equal(f.g.fallingPenguins.filter(n => n.active).length, 1);
      f.native.emit('feed', { type: 'feedEnter' });
      assert.equal(f.g.round.caught, 0); assert.equal(f.g.gameStarted, false);
    }],
    ['early feed entry can hide the falling pool without blocking readiness', async () => {
      const f = fixture(); f.boot(); await f.frame();
      f.native.emit('feed', { type: 'feedEnter' });
      f.native.emit('start', { touches: [{ clientX: 100 }] });
      assert(f.g.gameStarted);
      assert(f.g.fallingPenguins.every(n => !n.active));
      await f.settle(); assert.deepEqual(f.reports, [7001]);
    }],
    ['exit or destruction during stable rendering cancels readiness', async () => {
      for (const action of [f => f.native.emit('feed', { type: 'feedExit' }), f => f.g.onDestroy()]) {
        const f = fixture(); f.boot(); await f.frame(); action(f); await f.settle();
        assert.deepEqual(f.reports, []);
      }
    }],
    ['missing core sprite must not be reported as ready', async () => {
      const f = fixture(); f.g.whale.getComponent(Sprite).spriteFrame = null;
      f.boot(); await f.settle(); assert.deepEqual(f.reports, []);
    }],
    ['main entry initializes with a missing optional share node and native drag works', async () => {
      const f = fixture(false); f.g.shareButton = { node: null };
      f.boot(); await f.settle(); assert.deepEqual(f.reports, []);
      f.native.emit('start', { touches: [{ clientX: 100 }] });
      f.native.emit('move', { touches: [{ clientX: 200 }] });
      assert(f.g.targetWhaleX > 200); f.g.update(1 / 60); assert(f.g.whale.position.x > 0);
      f.g.onDestroy(); assert.equal(f.native.listeners.length, 0); assert.equal(f.input.listeners.length, 0);
    }],
  ];
  let failed = 0;
  for (const [name, run] of tests) {
    try { await run(); console.log('PASS ' + name); }
    catch (error) { failed++; console.error('FAIL ' + name, error); }
  }
  if (failed) process.exitCode = 1;
  else console.log(`\n${tests.length} penguin startup checks passed.`);
})();
