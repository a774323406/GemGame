const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const scripts = 'assets/scripts/';

class Emitter {
  constructor() { this.listeners = []; }
  on(type, callback, owner) { this.listeners.push({ type, callback, owner }); }
  off(type, callback, owner) {
    this.listeners = this.listeners.filter((entry) => entry.type !== type || entry.callback !== callback || entry.owner !== owner);
  }
  emit(type, ...args) {
    for (const entry of [...this.listeners]) if (entry.type === type) entry.callback.apply(entry.owner, args);
  }
}

class Vec2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
}

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x = 0, y = 0, z = 0) {
    if (typeof x === 'object') return this.set(x.x, x.y, x.z);
    this.x = x; this.y = y; this.z = z; return this;
  }
  clone() { return new Vec3(this.x, this.y, this.z); }
}

class UITransform {
  constructor(node, width = 100, height = 100, anchorX = 0.5, anchorY = 0.5) {
    Object.assign(this, { node, width, height, anchorX, anchorY });
  }
  convertToWorldSpaceAR(point) {
    return this.node.localToWorld(point);
  }
  convertToNodeSpaceAR(point) {
    return this.node.worldToLocal(point);
  }
  hitTest(point) {
    const local = this.convertToNodeSpaceAR(new Vec3(point.x, point.y, 0));
    return local.x >= -this.width * this.anchorX && local.x <= this.width * (1 - this.anchorX)
      && local.y >= -this.height * this.anchorY && local.y <= this.height * (1 - this.anchorY);
  }
}

class Sprite {
  constructor() {
    Object.defineProperty(this, 'spriteFrame', { value: Object.freeze({ isValid: true }), writable: false });
    this.enabled = true;
  }
}

class Node extends Emitter {
  static EventType = { TOUCH_START: 'touch-start' };
  constructor(name, parent = null, x = 0, y = 0, width = 100, height = 100) {
    super();
    this.name = name;
    this.parent = parent;
    this.children = [];
    if (parent) parent.children.push(this);
    this.position = new Vec3(x, y, 0);
    this.scale = new Vec3(1, 1, 1);
    this.angle = 0;
    this.active = true;
    this.isValid = true;
    this.components = new Map();
    this.components.set(UITransform, new UITransform(this, width, height));
  }
  get activeInHierarchy() { return this.active && (!this.parent || this.parent.activeInHierarchy); }
  get worldPosition() { return this.localToWorld(new Vec3()); }
  getComponent(type) { return this.components.get(type) || null; }
  addComponent(type, value) { this.components.set(type, value); return value; }
  setPosition(x, y, z = 0) { this.position.set(x, y, z); }
  setScale(x, y, z = 1) { this.scale.set(x, y, z); }
  localToWorld(point) {
    const radians = this.angle * Math.PI / 180;
    const scaledX = point.x * this.scale.x;
    const scaledY = point.y * this.scale.y;
    const rotated = new Vec3(
      scaledX * Math.cos(radians) - scaledY * Math.sin(radians) + this.position.x,
      scaledX * Math.sin(radians) + scaledY * Math.cos(radians) + this.position.y,
      point.z + this.position.z,
    );
    return this.parent ? this.parent.localToWorld(rotated) : rotated;
  }
  worldToLocal(point) {
    const parentPoint = this.parent ? this.parent.worldToLocal(point) : point;
    const x = parentPoint.x - this.position.x;
    const y = parentPoint.y - this.position.y;
    const radians = -this.angle * Math.PI / 180;
    return new Vec3(
      (x * Math.cos(radians) - y * Math.sin(radians)) / this.scale.x,
      (x * Math.sin(radians) + y * Math.cos(radians)) / this.scale.y,
      parentPoint.z - this.position.z,
    );
  }
}

class Button {
  static EventType = { CLICK: 'click' };
  constructor(node) { this.node = node; this.interactable = true; }
}

class Component {
  unscheduleAllCallbacks() {}
}

function fixture({ state: stateOverride = {}, loadSceneError = null } = {}) {
  let now = 1000;
  let state = {
    active: true, mode: 'acquisition', entered: false, exited: false,
    statusApiSupported: true, sceneReadyReported: false, feedScene: 0, contentId: '', extra: '',
    ...stateOverride,
  };
  let feedListener = null;
  const audio = [];
  const ads = [];
  const loads = [];
  const readyReports = [];
  const input = new Emitter();
  const gameEvents = new Emitter();
  const viewEvents = new Emitter();
  let visibleSize = { width: 750, height: 1624 };
  let systemInfo = { windowWidth: 750, windowHeight: 1624, pixelRatio: 1 };
  const nativeHandlers = {};
  Object.assign(viewEvents, {
    setDesignResolutionSize(width, height, policy) { this.design = { width, height, policy }; },
    getVisibleSize() { return { ...visibleSize }; },
  });
  const cc = {
    _decorator: { ccclass: () => (type) => type, property: () => () => {} },
    Button, Component, EventTouch: class {}, Game: { EVENT_HIDE: 'hide', EVENT_SHOW: 'show' },
    Node, ResolutionPolicy: { FIXED_WIDTH: 1 }, UITransform, Vec2, Vec3,
    input, Input: { EventType: { TOUCH_START: 'touch-start' } }, game: gameEvents,
    view: viewEvents,
  };
  const feed = {
    init() {}, getState: () => ({ ...state }), isActive: () => state.active,
    addListener(listener) { feedListener = listener; listener({ ...state }); },
    removeListener(listener) { if (feedListener === listener) feedListener = null; },
    activateFromFirstTouch() {
      if (!state.active || state.entered) return;
      state = { ...state, entered: true, exited: false };
      feedListener?.({ ...state });
    },
    completeSession() { state = { ...state, active: false, entered: false, exited: false }; this.completed += 1; },
    completed: 0,
    reportSceneReadyAfterStableRender(options) { readyReports.push(options); return Promise.resolve(true); },
  };
  const adc = {
    scheduleFeedEntryInterstitial(eligible) { ads.push({ type: 'schedule', eligible }); },
    cancelFeedEntryInterstitial() { ads.push({ type: 'cancel' }); },
  };
  const audioManager = {
    setSoundEvent() { audio.push('setSoundEvent'); },
    playDefaultBgm() { audio.push('defaultBgm'); },
    playMusic(name) { audio.push(`music:${name}`); },
    restartMusic(name) { audio.push(`restart:${name}`); },
    pauseBgmForVideo() { audio.push('pause'); },
    playEffect(name) { audio.push(`effect:${name}`); },
  };
  const sdk = { isRewardedVideoBusy: () => false };
  const soundName = {
    getUserBgm: 'getUserBgm', archeryShoot: 'archeryShoot', up: 'up', fail: 'fail', buttonClick: 'buttonClick',
  };
  const sceneBundle = {
    loadScene: async (name) => {
      loads.push(name);
      if (loadSceneError) throw loadSceneError;
    },
  };
  const tt = {
    onTouchStart(callback) { nativeHandlers.start = callback; },
    offTouchStart(callback) { if (nativeHandlers.start === callback) delete nativeHandlers.start; },
    getSystemInfoSync() { return { ...systemInfo }; },
  };
  const cache = {};
  function load(file) {
    if (cache[file]) return cache[file];
    const exports = {};
    cache[file] = exports;
    const code = ts.transpileModule(fs.readFileSync(scripts + file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        experimentalDecorators: true,
      },
    }).outputText;
    vm.runInNewContext(code, {
      exports,
      Math,
      Set,
      Error,
      Promise,
      console: { log() {}, warn() {}, error() {} },
      Date: class extends Date { static now() { return now; } },
      tt,
      require(name) {
        if (name === 'cc') return cc;
        if (name.endsWith('foodDeliveryRules')) return load('foodDeliveryRules.ts');
        if (name.endsWith('FeedAcquisitionService')) return { FeedAcquisitionService: feed };
        if (name.endsWith('ADController')) return { adc };
        if (name.endsWith('SdkUtils')) return { SdkUtils: sdk };
        if (name.endsWith('EnvTool')) return { EnvTool: { isByteDance: () => true } };
        if (name.endsWith('AudioManager')) return { default: audioManager };
        if (name.endsWith('GameSceneBundle')) {
          return { GameSceneBundle: sceneBundle, GameSceneName: { Main: 'NewMainScene' } };
        }
        if (name.endsWith('gamePrefabMgr')) return { soundName };
        return {};
      },
    });
    return exports;
  }

  const canvas = new Node('Canvas', null, 375, 812, 750, 1624);
  const gameplay = new Node('GameplayRoot', canvas, 0, 0, 750, 1624);
  const background = spriteNode('Background', canvas, 0, 0, 750, 1624);
  const courier = spriteNode('Courier', gameplay, -247, -268, 230, 154);
  const armPivot = new Node('ArmPivot', gameplay, -230, -245, 1, 1);
  const muzzle = new Node('Muzzle', armPivot, 40, 0, 1, 1);
  const guard = spriteNode('Guard', gameplay, 142, -263, 132, 184);
  const guardHitArea = new Node('GuardHitArea', gameplay, 141, -262, 82, 156);
  const wallHitArea = new Node('WallHitArea', gameplay, 317.5, 225, 115, 1150);
  const groundMarker = new Node('GroundMarker', gameplay, 0, -350, 750, 1);
  const foods = ['lime', 'icecream', 'cake', 'burger', 'cola'];
  const targets = foods.map((_, index) => new Node(`TargetHitArea${index}`, gameplay, 189, 400 - index * 120, 72, 68));
  const orderSprites = foods.map((_, index) => spriteNode(`Order${index}`, gameplay, 189, 400 - index * 120, 104, 92));
  const checks = foods.map((_, index) => spriteNode(`Check${index}`, gameplay, 238, 400 - index * 120, 62, 62));
  const stars = foods.map((_, index) => spriteNode(`StarOn${index}`, gameplay, -256 + index * 60, 574, 54, 54));
  const pendingFoods = foods.map((_, index) => spriteNode(`PendingFood${index}`, armPivot, 82, 0, 58, 62));
  const flyingFoods = foods.map((_, index) => spriteNode(`FlyingFood${index}`, gameplay, -190, -245, 58, 62));
  const aimDots = Array.from({ length: 12 }, (_, index) => spriteNode(`AimDot${index}`, armPivot, 72 + index * 24, 0, 8, 8));
  const resultOverlay = new Node('ResultOverlay', canvas, 0, 0, 750, 1624);
  resultOverlay.active = false;
  const successContent = new Node('SuccessContent', resultOverlay, 0, 0, 520, 180);
  const failureContent = new Node('FailureContent', resultOverlay, 0, 0, 520, 180);
  successContent.active = false;
  failureContent.active = false;
  const successTitle = new Node('SuccessTitle', resultOverlay, 0, 0, 500, 84);
  const failureTitle = new Node('FailureTitle', resultOverlay, 0, 0, 530, 92);
  function button(name, x, y, width = 250, height = 82, parent = canvas) {
    const node = new Node(name, parent, x, y, width, height);
    return new Button(node);
  }
  const backButton = button('BackButton', -319, 764, 76, 76);
  const homeButton = button('HomeButton', -145, -176, 270, 82, resultOverlay);
  const retryButton = button('RetryButton', 0, -66, 330, 82, resultOverlay);
  const nextButton = button('NextButton', 145, -176, 270, 82, resultOverlay);

  const GameClass = load('foodDeliveryFeedGameScene.ts').foodDeliveryFeedGameScene;
  const controller = new GameClass();
  Object.assign(controller, {
    node: canvas, background, gameplayRoot: gameplay, courier, armPivot, muzzle, guard,
    guardHitArea, wallHitArea, groundMarker, resultOverlay, successContent, failureContent,
    successTitle, failureTitle,
    targets, orderSprites, checks, stars, pendingFoods, flyingFoods, aimDots,
    backButton, homeButton, retryButton, nextButton,
    rotationSpeed: 480, speed: 1750, gravity: 1600, radius: 8, maxFlightSeconds: 4,
  });
  return {
    game: controller,
    feed,
    audio,
    ads,
    loads,
    readyReports,
    input,
    gameEvents,
    nativeHandlers,
    cc,
    resize(width, height) {
      visibleSize = { width, height };
      viewEvents.emit('canvas-resize');
    },
    setSystemInfo(value) { systemInfo = { ...systemInfo, ...value }; },
    clock: { now: () => now, set: (value) => { now = value; }, advance: (value) => { now += value; } },
    emitFeed(value) { state = { ...state, ...value }; feedListener?.({ ...state }); },
  };

  function spriteNode(name, parent, x, y, width, height) {
    const node = new Node(name, parent, x, y, width, height);
    node.addComponent(Sprite, new Sprite());
    return node;
  }
}

function touch(x = 600, y = 800) {
  return {
    getLocation: () => new Vec2(x, y),
    getUILocation: () => new Vec2(x, y),
    windowId: 0,
  };
}

function findHitAngle(food) {
  const { FoodDeliveryRound } = loadRules();
  const kinds = ['lime', 'icecream', 'cake', 'burger', 'cola'];
  const world = {
    targets: kinds.map((entry, index) => ({ food: entry, x: 153, y: 366 - index * 120, width: 72, height: 68 })),
    guard: { x: 100, y: -340, width: 82, height: 156 },
    wall: { x: 260, y: -350, width: 115, height: 1150 },
    bounds: { x: -375, y: -812, width: 750, height: 1624 },
    groundY: -350,
  };
  const tuning = { speed: 1750, gravity: 1600, radius: 8, maxFlightSeconds: 4 };
  for (let angle = 0; angle <= 180; angle += 0.25) {
    const round = new FoodDeliveryRound(world, tuning, [food, ...kinds.filter((entry) => entry !== food)]);
    round.shoot(angle, { x: -190, y: -245 });
    for (let frame = 0; frame < 300 && round.phase === 'flying'; frame += 1) round.tick(1 / 60);
    if (round.score === 1) return angle;
  }
  throw new Error(`${food} is unreachable`);
}

function loadRules() {
  const output = {};
  const code = ts.transpileModule(fs.readFileSync(`${scripts}foodDeliveryRules.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports: output, module: { exports: output }, Math, Set, Error });
  return output;
}

{
  const f = fixture({ state: { active: false, entered: true } });
  f.game.onLoad(); f.game.start();
  f.setSystemInfo({ windowWidth: 375, windowHeight: 812, pixelRatio: 2 });
  f.nativeHandlers.start({ touches: [{ clientX: 28, clientY: 24 }] });
  f.game.onTouchStart(touch(56, 1576));
  assert.equal(f.game.round.phase, 'aiming',
    'DPR-scaled native and Cocos touches on BackButton must never pass through to a throw');
  f.game.onDestroy();
}

{
  const f = fixture({ state: { active: false, entered: true } });
  f.game.onLoad(); f.game.start();
  f.resize(750, 1334);
  assert(Math.abs(f.game.gameplayRoot.scale.x - 1334 / 1624) < 1e-9,
    'short-screen resize must scale gameplay below the safe-area title');
  assert.equal(f.game.gameplayRoot.scale.y, f.game.gameplayRoot.scale.x);
  assert.equal(f.game.background.scale.x, 1,
    'short screens should crop the background without distorting it');
  assert.equal(f.game.background.scale.y, 1);
  f.resize(750, 1800);
  assert(Math.abs(f.game.background.scale.x - 1800 / 1624) < 1e-9,
    'tall screens should uniformly cover the viewport');
  assert.equal(f.game.background.scale.y, f.game.background.scale.x);
  f.game.onDestroy();
  assert.equal(f.cc.view.listeners.filter((entry) => entry.type === 'canvas-resize').length, 0,
    'destroy must remove the canvas resize listener');
}

{
  const f = fixture();
  f.game.onLoad();
  f.game.start();
  const order = [...f.game.round.order];
  const startAngle = f.game.armPivot.angle;
  for (let frame = 0; frame < 300; frame += 1) f.game.update(1 / 60);
  assert.equal(f.game.round.score, 0);
  assert.equal(f.game.round.phase, 'aiming');
  assert.deepEqual([...f.game.round.order], order);
  assert.notEqual(f.game.armPivot.angle, startAngle, 'preview should visibly rotate the arm');
  assert.equal(f.ads.filter((entry) => entry.type === 'schedule').length, 0);
  assert.equal(f.audio.length, 0, 'feed preview must stay silent');
  assert.equal(f.readyReports.length, 1);
  const requiredVisible = Array.from(f.readyReports[0].requiredVisibleNodes);
  const expectedVisible = [f.game.background, f.game.courier, f.game.guard, ...f.game.orderSprites];
  assert.equal(requiredVisible.length, expectedVisible.length);
  expectedVisible.forEach((node, index) => assert.equal(requiredVisible[index], node));
  assert.equal(f.game.tryThrow(false, 1000), true, 'first real touch should recover missing feedEnter');
  assert.equal(f.game.tryThrow(false, 1001), false, 'duplicate touch must not throw again');
  assert.equal(f.game.round.phase, 'flying');
  assert.equal(f.audio.filter((entry) => entry === 'effect:archeryShoot').length, 1);
  assert.equal(f.ads.filter((entry) => entry.type === 'schedule').length, 1);
}

{
  const f = fixture({ state: { active: false, entered: true } });
  f.game.onLoad(); f.game.start();
  assert.equal(f.game.tryThrow(true, 1000), false);
  assert.equal(f.game.round.phase, 'aiming');
  f.game.onTouchStart(touch(56, 1576));
  assert.equal(f.game.round.phase, 'aiming', 'button hit must not pass through to gameplay');
}

{
  const f = fixture({ state: { active: true, entered: true } });
  f.game.onLoad(); f.game.start();
  f.clock.set(2500);
  f.nativeHandlers.start({ touches: [{ identifier: 7, clientX: 600, clientY: 800 }] });
  f.game.onTouchStart(touch(600, 824));
  assert.equal(f.game.round.phase, 'flying');
  assert.equal(f.audio.filter((entry) => entry === 'effect:archeryShoot').length, 1, 'native and Cocos events must fire once');
  const before = f.game.round.projectile;
  f.game.onHide();
  f.game.update(1);
  assert.deepEqual({ ...f.game.round.projectile }, { ...before }, 'background must not advance physics');
  f.game.onShow();
  assert(f.audio.includes('restart:getUserBgm'));
}

{
  const f = fixture({ state: { active: true, entered: true } });
  f.game.onLoad(); f.game.start();
  const scheduledBeforeExit = f.ads.filter((entry) => entry.type === 'schedule').length;
  assert.equal(scheduledBeforeExit, 1);
  f.emitFeed({ entered: false, exited: true });
  assert.equal(f.game.tryThrow(false, 3000), false);
  assert(f.ads.some((entry) => entry.type === 'cancel'));
  f.emitFeed({ entered: true, exited: false });
  assert.equal(f.ads.filter((entry) => entry.type === 'schedule').length, 2, 're-entry must get a fresh eligible schedule');
}

{
  const f = fixture({ state: { active: false, entered: true } });
  f.game.onLoad(); f.game.start();
  const initialOrder = [...f.game.round.order];
  for (let delivery = 0; delivery < 5; delivery += 1) {
    const food = f.game.round.currentFood;
    f.game.armPivot.angle = findHitAngle(food);
    f.clock.advance(100);
    assert.equal(f.game.tryThrow(false, f.clock.now()), true);
    for (let frame = 0; frame < 300 && f.game.round.phase === 'flying'; frame += 1) f.game.update(1 / 60);
    if (delivery < 4) {
      assert.equal(f.game.round.phase, 'delivered');
      assert.equal(f.game.checks[['lime', 'icecream', 'cake', 'burger', 'cola'].indexOf(food)].active, true);
      assert.equal(f.game.stars[delivery].active, true);
      f.game.update(0.1); f.game.update(0.1); f.game.update(0.03);
      assert.equal(f.game.round.phase, 'aiming');
    }
  }
  assert.equal(f.game.round.phase, 'won');
  f.game.update(0.1); f.game.update(0.1); f.game.update(0.1);
  assert.equal(f.game.resultOverlay.active, true);
  assert.equal(f.game.successTitle.active, true);
  assert.equal(f.game.failureTitle.active, false);
  assert.equal(f.game.successContent.active, true);
  assert.equal(f.game.failureContent.active, false);
  f.game.resetRound(true);
  assert.deepEqual([...f.game.round.order], initialOrder);
  assert.equal(f.game.resultOverlay.active, false);
  assert(f.game.checks.every((node) => !node.active));
  assert(f.game.stars.every((node) => !node.active));
}

{
  const f = fixture({ state: { active: false, entered: true } });
  f.game.onLoad(); f.game.start();
  f.game.round.shoot(-90, { x: -190, y: -245 });
  for (let frame = 0; frame < 300 && f.game.round.phase === 'flying'; frame += 1) f.game.update(1 / 60);
  f.game.update(0.1); f.game.update(0.1); f.game.update(0.1);
  assert.equal(f.game.round.phase, 'failed');
  assert.equal(f.game.resultOverlay.active, true);
  assert.equal(f.game.successContent.active, false, 'failure must hide success message and bright star');
  assert.equal(f.game.failureContent.active, true, 'failure must show only failure-specific content');
}

{
  const f = fixture({ state: { active: true, entered: true } });
  f.game.onLoad(); f.game.start();
  for (const button of [f.game.backButton, f.game.homeButton, f.game.retryButton, f.game.nextButton]) button.node.isValid = false;
  f.game.node.isValid = false;
  assert.doesNotThrow(() => f.game.onDestroy());
  assert.equal(f.nativeHandlers.start, undefined);
  assert.equal(f.feed.completed, 1);
}

{
  const f = fixture({ state: { active: true, entered: true } });
  f.game.onLoad(); f.game.start();
  const lateNativeTouch = f.nativeHandlers.start;
  f.game.onDestroy();
  // Creator clears serialized fields after onDestroy; an already queued native
  // or engine callback must stop before attempting button hit testing.
  f.game.bindings = null;
  assert.doesNotThrow(() => lateNativeTouch({ touches: [{ clientX: 375, clientY: 900 }] }));
  assert.doesNotThrow(() => f.game.onTouchStart(touch(375, 724)));
}

(async () => {
  const f = fixture({
    state: { active: true, entered: true },
    loadSceneError: new Error('scene load failed'),
  });
  f.game.onLoad(); f.game.start();
  await f.game.returnHome();
  assert.equal(f.game.leaving, false);
  assert.equal(f.game.feedFinished, false, 'failed navigation must not complete the live feed session');
  assert.equal(f.feed.getState().active, true);
  f.emitFeed({ entered: false, exited: true });
  assert.equal(f.game.feedExited, true, 'failed navigation must retain the feed lifecycle listener');
  f.game.onDestroy();
  console.log('Food delivery controller tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
