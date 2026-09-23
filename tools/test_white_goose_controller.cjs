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
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  set(x, y, z = this.z) { this.x = x; this.y = y; this.z = z; return this; }
  static get ONE() { return new Vec3(1, 1, 1); }
  static distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
}

class UITransform {
  hitTest() { return true; }
  convertToNodeSpaceAR(value, out = new Vec3()) { return out.set(value.x, value.y, value.z || 0); }
  convertToWorldSpaceAR(value, out = new Vec3()) { return out.set(value.x, value.y, value.z || 0); }
}

class Skeleton {
  constructor() { this.complete = null; this.animation = ''; this.skin = 'default'; this.isValid = true; }
  setAnimation(_track, name) { this.animation = name; return { animation: { name } }; }
  setSkin(name) { this.skin = name; }
  setCompleteListener(listener) { this.complete = listener; }
}

class Node {
  static EventType = { TOUCH_START: 'touch-start' };
  constructor(name = '') {
    this.name = name;
    this.active = true;
    this.isValid = true;
    this.children = [];
    this.position = new Vec3();
    this.worldPosition = new Vec3();
    this.scale = new Vec3(1, 1, 1);
    this.components = new Map();
    this.events = new Map();
  }
  on(type, fn, target) { this.events.set(type, { fn, target }); }
  off(type) {
    if (!this.isValid) throw new TypeError("Cannot read properties of null (reading 'off')");
    this.events.delete(type);
  }
  getComponent(type) { return this.components.get(type) || null; }
  setComponent(type, value) { this.components.set(type, value); return this; }
  setPosition(value, y, z) {
    this.position = value instanceof Vec3 ? value.clone() : new Vec3(value, y, z);
  }
  setWorldPosition(value) { this.worldPosition = value.clone(); }
  getWorldPosition(out = new Vec3()) { return out.set(this.worldPosition.x, this.worldPosition.y, this.worldPosition.z); }
  setScale(value, y, z) { this.scale = value instanceof Vec3 ? value.clone() : new Vec3(value, y, z); }
  addChild(child) { child.parent = this; this.children.push(child); }
  removeFromParent() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
  destroy() { this.isValid = false; }
}

class Component {
  constructor() { this.node = new Node('Controller'); this.scheduled = []; }
  scheduleOnce(fn, delay = 0) { this.scheduled.push({ fn, delay }); }
  unscheduleAllCallbacks() { this.scheduled = []; }
}

function maxAnimationTime(value) {
  if (Array.isArray(value)) return value.reduce((max, item) => Math.max(max, maxAnimationTime(item)), 0);
  if (!value || typeof value !== 'object') return 0;
  const ownTime = typeof value.time === 'number' ? value.time : 0;
  return Object.values(value).reduce(
    (max, item) => Math.max(max, maxAnimationTime(item)),
    ownTime,
  );
}

function createFixture() {
  const rules = loadRules();
  const audio = [];
  const completed = [];
  const tweenTargets = [];
  const cc = {
    _decorator: {
      ccclass: () => value => value,
      property: () => () => {},
    },
    Button: class Button { static EventType = { CLICK: 'click' }; constructor(node = new Node()) { this.node = node; this.interactable = true; } },
    Component,
    EventTouch: class EventTouch {},
    game: { on() {}, off() {} },
    Game: { EVENT_HIDE: 'hide', EVENT_SHOW: 'show' },
    input: { on() {}, off() {} },
    Input: { EventType: { TOUCH_START: 'touch-start' } },
    instantiate(source) {
      const clone = new Node(`${source.name}-clone`);
      clone.children = source.children.map(child => {
        const childClone = new Node(child.name);
        childClone.setComponent('cc.Sprite', child.getComponent('cc.Sprite'));
        return childClone;
      });
      return clone;
    },
    Label: class Label { constructor(node = new Node()) { this.node = node; this.string = ''; } },
    Node,
    ResolutionPolicy: { FIXED_WIDTH: 1 },
    sp: { Skeleton },
    Sprite: class Sprite {},
    tween(target) {
      const calls = [];
      return {
        to(_duration, values) { Object.assign(target, values); return this; },
        by(_duration, values) { Object.assign(target, values); return this; },
        call(fn) { calls.push(fn); return this; },
        start() { calls.forEach(fn => fn()); return this; },
      };
    },
    Tween: { stopAllByTarget(target) { tweenTargets.push(target); } },
    UIOpacity: class UIOpacity { constructor() { this.opacity = 255; this.isValid = true; } },
    UITransform,
    Vec3,
    view: { setDesignResolutionSize() {} },
  };
  const output = {};
  const sandbox = {
    exports: output,
    module: { exports: output },
    require(id) {
      if (id === 'cc') return cc;
      if (id === './whiteGooseRoundRules') return rules;
      if (id === './framework/AudioManager') {
        return { __esModule: true, default: {
          setSoundEvent() { audio.push(['setSoundEvent']); },
          playMusic(name) { audio.push(['playMusic', name]); },
          restartMusic(name) { audio.push(['restartMusic', name]); },
          playEffect(name) { audio.push(['playEffect', name]); },
          playDefaultBgm() { audio.push(['playDefaultBgm']); },
          pauseBgmForVideo() { audio.push(['pause']); },
        } };
      }
      if (id === './framework/GameSceneBundle') {
        return { GameSceneBundle: { loadScene: async () => {} }, GameSceneName: { Main: 'NewMainScene', Game: 'GameScene' } };
      }
      if (id === './framework/Platform/FeedAcquisitionService') {
        return { FeedAcquisitionService: {
          init() {}, isActive: () => false,
          getState: () => ({ active: false, entered: false, exited: false }),
          addListener() {}, removeListener() {}, completeSession() { completed.push(true); },
          reportSceneReadyAfterStableRender: async () => {},
          activateFromFirstTouch() {},
        } };
      }
      if (id === './framework/Platform/ADController') {
        return { adc: { cancelFeedEntryInterstitial() {}, scheduleFeedEntryInterstitial() {} } };
      }
      if (id === './framework/Platform/sdk/SdkUtils') {
        return { SdkUtils: {
          isFullscreenAdBusy: () => false,
          isRewardedVideoBusy: () => false,
          showRewardedVideo: async () => true,
        } };
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
  };
  vm.runInNewContext(transpile('assets/scripts/whiteGooseFeedGameScene.ts'), sandbox);
  return { Controller: output.whiteGooseFeedGameScene, Node, Skeleton, UITransform, Vec3, audio, completed, tweenTargets };
}

function makePlayableController(fixture) {
  const controller = new fixture.Controller();
  controller.phase = 'playing';
  controller.feedMode = false;
  controller.sceneThrowingHand = new fixture.Node('ThrowingHand');
  controller.handSkeleton = new fixture.Skeleton();
  controller.sceneThrowingHand.setComponent(fixture.Skeleton, controller.handSkeleton);
  controller.sceneThrownRingLayer = new fixture.Node('ThrownRingLayer');
  controller.sceneThrownRingLayer.setComponent(fixture.UITransform, new fixture.UITransform());
  controller.sceneFieldTouchArea = new fixture.Node('FieldTouchArea');
  controller.sceneFieldTouchArea.setComponent(fixture.UITransform, new fixture.UITransform());
  const slot = new fixture.Node('GooseSlot0');
  slot.worldPosition = new fixture.Vec3(45, 120, 0);
  const hitArea = new fixture.Node('HitArea');
  const skeleton = new fixture.Skeleton();
  controller.gooseStates = [{
    slot,
    skeleton,
    hitArea,
    active: true,
    walking: false,
    pose: 's2',
    direction: 1,
    walkRemaining: 1,
  }];
  controller.sceneRingTemplates = [0, 1, 2].map(index => {
    const node = new fixture.Node(`RingTemplate${index}`);
    node.addChild(new fixture.Node('Bottom'));
    node.addChild(new fixture.Node('Top'));
    return node;
  });
  return controller;
}

{
  const fixture = createFixture();
  const controller = makePlayableController(fixture);
  const event = { propagationStopped: false, getUILocation: () => ({ x: 20, y: 30 }) };
  controller.onGooseTouch(event, 0);
  assert.equal(event.propagationStopped, true);
  assert.equal(controller.round.snapshot.ringsRemaining, 9);
  assert.equal(controller.phase, 'throwing');
  controller.onFieldTouch(event);
  assert.equal(controller.round.snapshot.ringsRemaining, 9, 'one gesture may consume only one ring');

  const lateHandCompletion = controller.handSkeleton.complete;
  controller.resetRound(true);
  assert.equal(controller.round.snapshot.ringsRemaining, 10);
  lateHandCompletion({ animation: { name: 'reng' } });
  assert.equal(controller.round.snapshot.ringsRemaining, 10, 'an old animation callback cannot mutate a reset round');
  assert.equal(controller.phase, 'playing');
}

{
  const fixture = createFixture();
  const controller = makePlayableController(fixture);
  const goose = controller.gooseStates[0];
  goose.walking = true;
  goose.pose = 's1';
  goose.walkRemaining = 1;
  goose.slot.setPosition(0, 0, 0);
  controller.phase = 'throwing';

  controller.update(0.25);

  assert.equal(goose.walkRemaining, 0.96,
    'throwing a ring must not pause the selected goose walk timer');
  assert(goose.slot.position.x > 0,
    'throwing a ring must not freeze goose movement before catch resolution');
}

{
  const fixture = createFixture();
  const controller = makePlayableController(fixture);
  const goose = controller.gooseStates[0];
  const originalRandom = Math.random;
  const values = [0.3, 0.1];
  Math.random = () => values.shift() ?? 0.1;
  try {
    controller.enterRandomPose(goose);
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(goose.pose, 's2');
  assert.equal(goose.skeleton.animation, 's2',
    'normal idle selection must not play the dodge-only s2_duo animation');
}

{
  const fixture = createFixture();
  const controller = makePlayableController(fixture);
  const goose = controller.gooseStates[0];
  goose.walkRemaining = 0.01;
  controller.phase = 'throwing';

  controller.playCaughtAnimation(goose, 0, controller.roundSerial);
  controller.update(0.04);

  assert.equal(goose.skeleton.animation, 's2_tao',
    'goose motion updates must not overwrite an in-flight catch animation');
}

{
  const fixture = createFixture();
  const controller = makePlayableController(fixture);
  const goose = controller.gooseStates[0];
  goose.walkRemaining = 0.01;
  controller.phase = 'throwing';

  controller.playDodgeAnimation(goose, controller.roundSerial);
  controller.update(0.04);

  assert.equal(goose.skeleton.animation, 's2_duo',
    'goose motion updates must not overwrite an in-flight dodge animation');
}

{
  const fixture = createFixture();
  const controller = new fixture.Controller();
  controller.feedMode = false;
  controller.start();
  assert(fixture.audio.some(event => event[0] === 'playMusic' && event[1] === 'whiteGooseBgm'));
  assert.equal(controller.phase, 'playing');
}

{
  const fixture = createFixture();
  const controller = makePlayableController(fixture);
  const gooseSkeleton = controller.gooseStates[0].skeleton;
  controller.handSkeleton.setCompleteListener(() => {});
  gooseSkeleton.setCompleteListener(() => {});
  controller.onDestroy();
  assert.equal(controller.handSkeleton.complete, null);
  assert.equal(gooseSkeleton.complete, null);
  assert(fixture.tweenTargets.includes(controller.sceneThrowingHand));
}

{
  const fixture = createFixture();
  const controller = makePlayableController(fixture);
  controller.sceneFieldTouchArea.isValid = false;
  for (const key of [
    'sceneBackButton', 'sceneAddRingsButton', 'sceneReplayButton',
    'sceneRestartButton', 'sceneHomeButton', 'sceneReviveButton',
  ]) {
    const node = new fixture.Node(key);
    node.isValid = false;
    controller[key] = { node };
  }

  assert.doesNotThrow(() => controller.onDestroy(),
    'scene teardown must skip event removal for child nodes that are already destroyed');
}

{
  const fixture = createFixture();
  const controller = makePlayableController(fixture);
  const goose = controller.gooseStates[0];
  const skeletonData = JSON.parse(fs.readFileSync('assets/res/whiteGooseFeed/taodae.json', 'utf8'));
  const catchAnimationDuration = maxAnimationTime(skeletonData.animations.s2_tao);
  controller.playCaughtAnimation(goose, 0, controller.roundSerial);
  const fallback = controller.scheduled.at(-1);
  assert(
    fallback.delay >= catchAnimationDuration,
    `catch fallback ${fallback.delay}s must not hide the goose before its ${catchAnimationDuration}s animation ends`,
  );
}

console.log('White goose controller tests passed');
