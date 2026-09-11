// Run from the project root: node tools/test_nail_scene.cjs
// Exercises the real controller and serialized scene with mocked Cocos timing/ads.
// This does not replace a Creator preview or a real-device rewarded-video test.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const ts = require(process.env.NAIL_TEST_TYPESCRIPT_PATH ||
  '/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');

const source = fs.readFileSync('assets/scripts/nailHammerFeedGameScene.ts', 'utf8');
const scene = JSON.parse(fs.readFileSync('assets/gamescene/NailHammerFeedGameScene.scene', 'utf8'));
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.CommonJS,
  experimentalDecorators: true,
} }).outputText;

function fixture() {
  let now = 0, taskId = 0, queue = [], adCalls = 0, pendingAd, fullscreenBusy = false;
  const messages = [];
  const schedule = (owner, kind, delay, fn) => queue.push({ owner, kind, time: now + delay, id: ++taskId, fn });
  const cancel = (owner, kind) => { queue = queue.filter(item => item.owner !== owner || item.kind !== kind); };
  function advance(seconds = 2) {
    const end = now + seconds;
    while (true) {
      queue.sort((a, b) => a.time - b.time || a.id - b.id);
      if (!queue.length || queue[0].time > end) break;
      const task = queue.shift();
      now = task.time;
      task.fn();
    }
    now = end;
  }
  class Vec3 {
    constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
    static ONE = new Vec3(1, 1, 1);
  }
  const vector = args => typeof args[0] === 'object'
    ? new Vec3(args[0].x, args[0].y, args[0].z)
    : new Vec3(...args);
  class Emitter {
    listeners = [];
    on(type, fn, owner) { this.listeners.push({ type, fn, owner }); }
    off(type, fn, owner) { this.listeners = this.listeners.filter(x => x.type !== type || x.fn !== fn || x.owner !== owner); }
    emit(type, event) { for (const item of [...this.listeners]) if (item.type === type) item.fn.call(item.owner, event); }
  }
  class Node extends Emitter {
    isValid = true; active = true; parent = null; children = []; components = [];
    position = new Vec3(); scale = new Vec3(1, 1, 1);
    setPosition(...args) { this.position = vector(args); }
    setScale(...args) { this.scale = vector(args); }
    getComponent(type) {
      assert(this.isValid, 'getComponent must not be called on a destroyed node');
      return this.components.find(component => component instanceof type) || null;
    }
    getChildByName(name) { return this.children.find(child => child.name === name); }
    get activeInHierarchy() { return this.isValid && this.active && (!this.parent || this.parent.activeInHierarchy); }
  }
  class Component {
    isValid = true;
    scheduleOnce(fn, delay) { schedule(this, 'callback', delay, fn); }
    unscheduleAllCallbacks() { cancel(this, 'callback'); }
  }
  class Button extends Component { static EventType = { CLICK: 'click' }; interactable = true; }
  class Label extends Component { string = ''; }
  class Sprite extends Component {}
  class UIOpacity extends Component {}
  function worldPosition(node) {
    let x = 0, y = 0;
    for (; node; node = node.parent) { x += node.position.x; y += node.position.y; }
    return { x, y };
  }
  class UITransform extends Component {
    hitTest(point) {
      const center = worldPosition(this.node);
      return Math.abs(point.x - center.x) <= this.contentSize.width / 2 &&
        Math.abs(point.y - center.y) <= this.contentSize.height / 2;
    }
  }
  function tween(target) {
    let elapsed = 0;
    const steps = [];
    const assign = (values, relative) => {
      for (const [key, value] of Object.entries(values)) {
        if (value && typeof value === 'object') {
          const base = relative ? target[key] : new Vec3();
          target[key] = new Vec3(base.x + value.x, base.y + value.y, base.z + value.z);
        } else target[key] = (relative ? target[key] : 0) + value;
      }
    };
    const chain = {
      to(delay, values) { elapsed += delay; steps.push([elapsed, () => assign(values, false)]); return chain; },
      by(delay, values) { elapsed += delay; steps.push([elapsed, () => assign(values, true)]); return chain; },
      delay(delay) { elapsed += delay; return chain; },
      call(fn) { steps.push([elapsed, fn]); return chain; },
      start() { for (const [delay, fn] of steps) schedule(target, 'tween', delay, fn); return chain; },
    };
    return chain;
  }
  const input = new Emitter(), game = new Emitter();
  const cc = {
    _decorator: { ccclass: () => type => type, property: () => () => {} },
    Component, Node, Label, Sprite, Button, UITransform, UIOpacity, Vec3, input, game,
    Input: { EventType: { TOUCH_START: 'touch-start' } },
    Game: { EVENT_HIDE: 'hide', EVENT_SHOW: 'show' },
    director: new Emitter(), view: { setDesignResolutionSize() {} }, ResolutionPolicy: {},
    tween, Tween: { stopAllByTarget: target => cancel(target, 'tween') },
  };
  const sdk = {
    isFullscreenAdBusy: () => fullscreenBusy,
    showRewardedVideo() {
      adCalls++;
      return new Promise((resolve, reject) => { pendingAd = { resolve, reject }; });
    },
  };
  const feed = {
    init() {}, getState: () => ({}), isActive: () => false, removeListener() {}, completeSession() {},
  };
  const audio = new Proxy({}, { get: () => () => {} });
  const modules = {
    cc,
    './framework/AudioManager': { default: audio },
    './framework/GameSceneBundle': { GameSceneBundle: { loadScene: () => Promise.resolve() }, GameSceneName: {} },
    './framework/Platform/FeedAcquisitionService': { FeedAcquisitionService: feed },
    './framework/Platform/ADController': { adc: { cancelFeedEntryInterstitial() {} } },
    './framework/Platform/sdk/SdkUtils': { SdkUtils: sdk },
    './gamePrefabMgr': { soundName: {} },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) { assert(name in modules, name); return modules[name]; },
    console: { log: value => messages.push(value), warn: value => messages.push(value), error: value => messages.push(value) },
  });
  const instances = scene.map(item => {
    if (item.__type__ === 'cc.Node') {
      const node = new Node();
      Object.assign(node, { name: item._name, active: item._active });
      node.setPosition(item._lpos); node.setScale(item._lscale);
      return node;
    }
    const type = cc[item.__type__?.replace('cc.', '')];
    if ([Button, Label, Sprite, UITransform, UIOpacity].includes(type)) return new type();
    return null;
  });
  scene.forEach((item, id) => {
    const instance = instances[id];
    if (instance instanceof Node) {
      instance.parent = instances[item._parent?.__id__];
      instance.children = item._children.map(ref => instances[ref.__id__]);
      instance.components = item._components.map(ref => instances[ref.__id__]).filter(Boolean);
    } else if (instance) {
      instance.node = instances[item.node.__id__];
      if (instance instanceof UITransform) instance.contentSize = item._contentSize;
      if (instance instanceof Label) instance.string = item._string;
    }
  });
  const bindings = scene.find(item => item.sceneHammerCountLabel);
  const controller = new exports.nailHammerFeedGameScene();
  controller.node = instances[bindings.node.__id__];
  for (const [key, value] of Object.entries(bindings)) if (key.startsWith('scene')) controller[key] = instances[value.__id__];
  controller.onLoad();
  const press = (result = 'hit', settle = true) => {
    controller.targetScale = { hit: 0.65, bent: 0.52, blank: 0.9 }[result];
    input.emit('touch-start', { getUILocation: () => worldPosition(controller.node) });
    if (settle) advance();
  };
  const strikeMany = (count, result = 'hit') => { for (let i = 0; i < count; i++) press(result); };
  return {
    g: controller, press, strikeMany, advance, messages,
    adCalls: () => adCalls,
    busy: value => { fullscreenBusy = value; },
    touchButton: button => input.emit('touch-start', { getUILocation: () => worldPosition(button.node) }),
    click: button => button.node.emit('click'),
    async finishAd(rewarded = true, reject = false) {
      assert(pendingAd, 'an ad should be pending');
      const pending = pendingAd; pendingAd = null;
      if (reject) pending.reject(new Error('simulated ad error')); else pending.resolve(rewarded);
      await Promise.resolve(); await Promise.resolve();
    },
    destroy() {
      // Simulate Creator destroying children before the scene controller.
      for (const instance of instances) if (instance && instance !== controller.node) instance.isValid = false;
      controller.onDestroy(); controller.node.isValid = false;
      advance();
    },
  };
}

async function main() {
  const tests = [];
  const test = (name, fn) => tests.push([name, fn]);
  test('scene bindings/references, removed score/rules and editable ad buttons', () => {
    function validate(value) {
      if (!value || typeof value !== 'object') return;
      if ('__id__' in value) assert(scene[value.__id__], `missing reference ${value.__id__}`);
      for (const child of Object.values(value)) validate(child);
    }
    validate(scene);
    assert(!/ScorePanel|Score20Popup|Score60Popup|GoalInstruction|积分|本局得分/.test(JSON.stringify(scene)));
    const bindings = scene.find(item => item.sceneHammerCountLabel);
    for (const name of ['sceneAddHammersButton', 'sceneReviveButton']) {
      assert.equal(scene[bindings[name].__id__].__type__, 'cc.Button');
    }
    for (const match of source.matchAll(/public (scene\w+):/g)) assert(bindings[match[1]], match[1]);
    const byName = name => scene.find(item => item.__type__ === 'cc.Node' && item._name === name);
    const canvas = byName('Canvas');
    const order = canvas._children.map(ref => scene[ref.__id__]._name);
    assert(order.indexOf('NailRoot') < order.indexOf('WoodFront'));
    assert(order.indexOf('WoodFront') < order.indexOf('SightPerspective'));
    assert(order.indexOf('SightPerspective') < order.indexOf('NailFrontRoot'));
    const rect = node => {
      const size = scene[node._components.find(ref => scene[ref.__id__].__type__ === 'cc.UITransform').__id__]._contentSize;
      let x = node._lpos.x, y = node._lpos.y, parent = scene[node._parent.__id__];
      while (parent && parent !== canvas && parent.__type__ === 'cc.Node') {
        x += parent._lpos.x; y += parent._lpos.y; parent = scene[parent._parent.__id__];
      }
      return { left: x - size.width / 2, right: x + size.width / 2, bottom: y - size.height / 2, top: y + size.height / 2 };
    };
    const bottom = rect(byName('AddHammersButton'));
    assert(bottom.bottom >= -667 && bottom.top < rect(byName('TapInstruction')).bottom);
    const panel = rect(byName('ResultPanel'));
    for (const name of ['SuccessTitle', 'FailureTitle', 'ResultProgress', 'ResultDetail', 'ReviveButton', 'RestartButton', 'ResultHomeButton']) {
      const box = rect(byName(name));
      assert(box.left >= panel.left && box.right <= panel.right && box.bottom >= panel.bottom && box.top <= panel.top, name);
    }
    assert(rect(byName('ReviveButton')).top < rect(byName('ResultDetail')).bottom);
    assert(rect(byName('RestartButton')).top < rect(byName('ReviveButton')).bottom);
  });
  test('15 perfect hits wins immediately; no timer', () => {
    const { g, strikeMany, advance } = fixture();
    advance(300); g.update(300); assert.equal(g.roundState, 'playing');
    strikeMany(15); assert.equal(g.completedNails, 5); assert(g.resultSucceeded);
    assert.equal(g.hammerCount, 15); assert.equal(g.sceneHammerCountLabel.string, '剩余5锤');
  });
  test('hammer add action uses a compact 128px picture button with a separate caption', () => {
    const meta = JSON.parse(fs.readFileSync('assets/res/nailHammerFeed/add-hammers-button.png.meta', 'utf8'));
    const png = fs.readFileSync('assets/res/nailHammerFeed/add-hammers-button.png');
    assert.equal(png.readUInt32BE(16), 128); assert.equal(png.readUInt32BE(20), 128);
    assert(png.length < 50 * 1024, 'small UI asset should stay below 50 KiB');
    assert(meta.userData.hasAlpha);
    const button = scene.find(item => item.__type__ === 'cc.Node' && item._name === 'AddHammersButton');
    const children = button._children.map(ref => scene[ref.__id__]);
    const picture = children.find(item => item._name === 'ButtonBackground');
    const sprite = picture._components.map(ref => scene[ref.__id__]).find(item => item.__type__ === 'cc.Sprite');
    const transform = picture._components.map(ref => scene[ref.__id__]).find(item => item.__type__ === 'cc.UITransform');
    assert.equal(sprite._spriteFrame.__uuid__, meta.subMetas.f9941.uuid);
    assert.equal(transform._contentSize.width, 128); assert.equal(transform._contentSize.height, 128);
    const caption = children.find(item => item._name === 'AddHammersButtonLabel');
    assert(caption._lpos.y < picture._lpos.y, 'caption belongs on the bottom golden band');
  });
  test('reward buttons use shared ad artwork; the protruding corner badge is tappable without swinging', async () => {
    const bindings = scene.find(item => item.sceneHammerCountLabel);
    const componentOf = (node, type) => scene[node._components.find(ref => scene[ref.__id__].__type__ === type).__id__];
    for (const key of ['sceneAddHammersButton', 'sceneReviveButton']) {
      const button = scene[scene[bindings[key].__id__].node.__id__];
      const children = button._children.map(ref => scene[ref.__id__]);
      const badge = children.find(child => child._name === 'AdBadge');
      assert(badge, `${key} needs an editor-visible ad badge`);
      assert.equal(componentOf(badge, 'cc.Sprite')._spriteFrame.__uuid__, 'cf633ac8-e94b-4433-a837-05cc338157cd@f9941');
      const size = componentOf(button, 'cc.UITransform')._contentSize;
      const badgeSize = componentOf(badge, 'cc.UITransform')._contentSize;
      assert(Math.abs(badge._lpos.x) + badgeSize.width / 2 <= size.width / 2);
      assert(Math.abs(badge._lpos.y) + badgeSize.height / 2 <= size.height / 2);
      const label = componentOf(children.find(child => child._name.endsWith('Label')), 'cc.Label');
      assert(!/看广告|看视频/.test(label._string), 'use the badge instead of an ad caption');
      if (key === 'sceneReviveButton') {
        assert.equal(componentOf(button, 'cc.Sprite')._spriteFrame.__uuid__, 'cb706d47-db4b-5f33-8cde-a6299daad9f5@f9941');
        assert.equal(label._string, '+10 锤复活');
      } else assert.equal(label._string, '锤子 +5');
    }
    const f = fixture();
    const badge = f.g.sceneAddHammersButton.node.getChildByName('AdBadge');
    f.touchButton({ node: badge });
    assert.equal(f.g.hammerCount, 0);
    f.click(f.g.sceneAddHammersButton);
    assert.equal(f.adCalls(), 1);
    await f.finishAd(false);
  });
  test('20th hammer completing fifth nail wins instead of failing', () => {
    const { g, strikeMany } = fixture();
    strikeMany(5, 'blank'); strikeMany(15); assert(g.resultSucceeded); assert.equal(g.hammerCount, 20);
  });
  test('cannot use a 21st hammer during last-strike animation', () => {
    const { g, strikeMany, press, advance } = fixture();
    strikeMany(19, 'blank'); press('hit', false); press('hit', false);
    assert.equal(g.hammerCount, 20); advance(); assert.equal(g.roundState, 'complete'); assert(!g.resultSucceeded);
  });
  test('ad button touch does not swing; +5 only after full video; duplicate blocked; paused during ad', async () => {
    const f = fixture(), { g } = f;
    f.touchButton(g.sceneAddHammersButton); assert.equal(g.hammerCount, 0);
    f.click(g.sceneAddHammersButton); f.click(g.sceneAddHammersButton);
    assert.equal(f.adCalls(), 1); assert.equal(g.hammerLimit, 20);
    const phase = g.targetPhase; g.update(1); f.press();
    assert.equal(g.targetPhase, phase); assert.equal(g.hammerCount, 0);
    assert(!g.sceneBackButton.interactable); assert(!g.sceneAddHammersButton.interactable);
    g.resetRound(); g.returnToMain(); assert.equal(g.roundState, 'playing');
    await f.finishAd(); assert.equal(g.hammerLimit, 25); assert.equal(g.sceneHammerCountLabel.string, '剩余25锤');
    assert(g.sceneBackButton.interactable && g.sceneAddHammersButton.interactable);
  });
  test('canceled video gives no +5 and reenables gameplay', async () => {
    const f = fixture(); f.click(f.g.sceneAddHammersButton); await f.finishAd(false);
    assert.equal(f.g.hammerLimit, 20); assert(!f.g.adInFlight); f.press(); assert.equal(f.g.hammerCount, 1);
  });
  test('rejected video gives no reward and reenables button', async () => {
    const f = fixture(); f.click(f.g.sceneAddHammersButton); await f.finishAd(false, true);
    assert.equal(f.g.hammerLimit, 20); assert(f.g.sceneAddHammersButton.interactable);
  });
  test('another fullscreen ad or an unresolved strike blocks the request', () => {
    const f = fixture(); f.busy(true); f.click(f.g.sceneAddHammersButton); assert.equal(f.adCalls(), 0);
    f.busy(false); f.press('hit', false); f.click(f.g.sceneAddHammersButton); assert.equal(f.adCalls(), 0);
  });
  test('added supply works past 20 and expires at 25', async () => {
    const f = fixture(); f.click(f.g.sceneAddHammersButton); await f.finishAd();
    f.strikeMany(20, 'blank'); assert.equal(f.g.roundState, 'playing');
    f.strikeMany(5, 'blank'); assert.equal(f.g.roundState, 'complete'); assert.equal(f.g.hammerCount, 25);
  });
  test('revive keeps completed nails and current partial height/hits', async () => {
    const f = fixture(), { g } = f;
    f.strikeMany(6, 'blank'); f.strikeMany(14);
    assert.equal(g.completedNails, 4); assert.equal(g.nailHitCount, 2); const y = g.sceneNailRoot.position.y;
    f.click(g.sceneReviveButton); f.click(g.sceneReviveButton); assert.equal(f.adCalls(), 1);
    await f.finishAd(); assert.equal(g.roundState, 'playing'); assert(!g.sceneResultOverlay.active);
    assert.equal(g.sceneHammerCountLabel.string, '剩余10锤'); assert.equal(g.completedNails, 4);
    assert.equal(g.nailHitCount, 2); assert.equal(g.sceneNailRoot.position.y, y);
    f.press(); assert(g.resultSucceeded); assert.equal(g.hammerCount, 21);
  });
  test('canceled revive keeps failure visible and progress unchanged', async () => {
    const f = fixture(); f.strikeMany(20, 'blank'); f.click(f.g.sceneReviveButton); await f.finishAd(false);
    assert.equal(f.g.roundState, 'complete'); assert(f.g.sceneResultOverlay.active);
    assert.equal(f.g.hammerLimit, 20); assert(f.g.sceneReviveButton.interactable);
  });
  test('bent final nail is replaced before accepting input after revive', async () => {
    const f = fixture(), { g } = f;
    f.strikeMany(12); f.strikeMany(7, 'blank'); f.press('bent');
    assert(g.sceneBentNail.active); assert(g.nailNeedsReplacement);
    f.click(g.sceneReviveButton); await f.finishAd(); assert(g.inputLocked);
    f.press('hit', false); assert.equal(g.hammerCount, 20); f.advance();
    assert(!g.sceneBentNail.active); assert(g.sceneStraightNail.active);
    assert.equal(g.sceneNailRoot.position.y, 16); assert(!g.nailNeedsReplacement);
    f.strikeMany(3); assert(g.resultSucceeded);
  });
  test('fully driven final nail below target count is replaced on revive', async () => {
    const f = fixture(), { g } = f;
    f.strikeMany(8, 'blank'); f.strikeMany(12);
    assert.equal(g.completedNails, 4); assert(g.nailNeedsReplacement); assert.equal(g.nailHitCount, 0);
    f.click(g.sceneReviveButton); await f.finishAd(); f.advance();
    assert.equal(g.sceneNailRoot.position.y, 16); assert.equal(g.completedNails, 4);
    f.strikeMany(3); assert(g.resultSucceeded);
  });
  test('revive allowance expires after 10 more; supports another revive', async () => {
    const f = fixture(); f.strikeMany(20, 'blank'); f.click(f.g.sceneReviveButton); await f.finishAd();
    f.strikeMany(10, 'blank'); assert.equal(f.g.roundState, 'complete'); assert.equal(f.g.hammerCount, 30);
    f.click(f.g.sceneReviveButton); await f.finishAd(); assert.equal(f.g.hammerLimit, 40);
  });
  test('restart resets bought supply to 20 and clears all progress', async () => {
    const f = fixture(), { g } = f; f.click(g.sceneAddHammersButton); await f.finishAd(); f.strikeMany(4);
    g.resetRound(); assert.equal(g.hammerLimit, 20); assert.equal(g.hammerCount, 0);
    assert.equal(g.completedNails, 0); assert.equal(g.nailHitCount, 0); assert(!g.nailNeedsReplacement);
    assert.equal(g.sceneNailRoot.position.y, 16);
  });
  test('blank preserves partial progress; bend discards it', () => {
    const f = fixture(); f.press(); f.press('blank'); assert.equal(f.g.nailHitCount, 1);
    f.press('bent'); assert.equal(f.g.nailHitCount, 0); assert.equal(f.g.completedNails, 0);
  });
  test('destroy during pending ad ignores late reward without touching dead nodes', async () => {
    const f = fixture(); f.click(f.g.sceneAddHammersButton); f.destroy(); await f.finishAd();
    assert.equal(f.g.hammerLimit, 20); assert.equal(f.g.roundState, 'leaving');
  });
  test('destroy/restart during nail landing cancels old outcome callbacks', () => {
    const f = fixture(); f.strikeMany(2); f.press('hit', false); f.destroy(); assert.equal(f.g.completedNails, 0);
    const another = fixture(); another.strikeMany(2); another.press('hit', false); another.g.resetRound(); another.advance();
    assert.equal(another.g.completedNails, 0); assert.equal(another.g.hammerCount, 0);
  });
  test('winning screen cannot request revival and entering feed preview cannot request ads', () => {
    const f = fixture(); f.strikeMany(15); f.click(f.g.sceneReviveButton); assert.equal(f.adCalls(), 0);
    const preview = fixture(); preview.g.feedMode = true; preview.g.feedEntered = false;
    preview.click(preview.g.sceneAddHammersButton); assert.equal(preview.adCalls(), 0);
  });
  for (const [name, run] of tests) { await run(); console.log(`PASS ${name}`); }
  console.log(`\n${tests.length} nail scene checks passed.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
