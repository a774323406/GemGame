// Editor-authored homepage bindings/layout and click routing (no engine or native ads).
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const data = JSON.parse(fs.readFileSync('assets/gamescene/MainScene.scene', 'utf8'));
const source = fs.readFileSync('assets/scripts/mainScene.ts', 'utf8');
const find = name => data.findIndex(x => x.__type__ === 'cc.Node' && x._name === name);
const component = (id, type) => data[id]._components.map(ref => data[ref.__id__]).find(x => x.__type__ === type);
function validateRefs(value) {
  if (!value || typeof value !== 'object') return;
  if ('__id__' in value) assert(data[value.__id__], 'Dangling serialized reference: ' + value.__id__);
  Object.values(value).forEach(validateRefs);
}
validateRefs(data);
assert.equal(find('juggleBallGameBtn'), -1);
assert(!source.includes('juggleBallGameBtn') && !source.includes('gotoJuggleBallGame'));
assert(!data.some(x => x._string === '乒乓球'));
const pen = find('penRefillGameBtn');
assert(pen >= 0);
assert.equal(data.filter(x => x._name === 'penRefillGameBtn').length, 1);
const main = data.find(x => x.penRefillGameBtn);
assert.equal(data[main.penRefillGameBtn.__id__].node.__id__, pen);
assert(!('juggleBallGameBtn' in main));
assert.equal(data[pen]._lpos.x, 306);
assert.equal(data[pen]._lpos.y, 216.545);
assert(source.includes('GameSceneName.PenRefillFeedGame'));

const milk = find('milkTeaGameBtn');
const reminder = find('FeedChallengeSubscribeButton');
assert(milk >= 0 && reminder >= 0);
assert.equal(data.filter(x => x._name === 'milkTeaGameBtn').length, 1);
assert.equal(data[main.milkTeaGameBtn.__id__].node.__id__, milk);
assert.equal(data[main.feedSubscribeBtn.__id__].node.__id__, reminder);
assert.equal(data[reminder]._active, false, 'Disabled revisit entry stays hidden in the scene');
assert.equal(data[milk]._lpos.x, data[pen]._lpos.x);
assert.equal(data[milk]._lpos.y, 6);
const milkArt = component(find('MilkTeaArt'), 'cc.Sprite');
const milkMeta = JSON.parse(fs.readFileSync('assets/res/milkTeaFeed/bubble-milk-tea.png.meta', 'utf8'));
assert.equal(milkArt._spriteFrame.__uuid__, milkMeta.subMetas.f9941.uuid);
assert.equal(milkArt._sizeMode, 0, 'Milk-tea sprite uses editor-owned custom dimensions');
const milkLabelNode = data[milk]._children.map(r => r.__id__).find(id => data[id]._name === 'Label');
assert.equal(component(milkLabelNode, 'cc.Label')._string, '奶茶');
const buttonFields = [...source.matchAll(/@property\(Button\)\s+(\w+): Button/g)].map(m => m[1]);
for (const field of buttonFields) {
  const button = data[main[field]?.__id__];
  assert.equal(button?.__type__, 'cc.Button', field + ' must be bound in MainScene.scene');
  const node = data[button.node.__id__];
  assert.equal(data[node._parent.__id__]._name, 'Canvas', field + ' must exist under Canvas');
  assert(component(button.node.__id__, 'cc.UITransform'), field + ' needs an editor-sized hit area');
  if (button._target) assert.equal(button._target.__id__, button.node.__id__);
  assert.deepEqual(button.clickEvents, [], field + ' must not double-bind script callbacks');
}
assert.equal(data.filter(x => x.__type__ === 'cc.Button').length, buttonFields.length);
assert(!/new\s+Node\s*\(|\.addComponent\s*\(|\binstantiate\s*\(|createMilkTeaTestButton|createFeedSubscribeButton/.test(source),
  'Homepage must not dynamically construct buttons or fallbacks');
assert(!/\.setPosition\s*\(|\.setScale\s*\(|\.setContentSize\s*\(|\.(?:spriteFrame|string|fontSize|zoomScale)\s*=/.test(source),
  'Homepage must not override editor-authored layout, art or text');
const ids = data.map(x => x._id).filter(Boolean);
assert.equal(new Set(ids).size, ids.length, 'Serialized object IDs must be unique');

function bounds(id, y = 0, scale = 1) {
  const n = data[id], nextY = y + n._lpos.y * scale, nextScale = scale * n._lscale.y;
  const t = component(id, 'cc.UITransform');
  let bottom = t ? nextY - t._contentSize.height * t._anchorPoint.y * nextScale : Infinity;
  let top = t ? nextY + t._contentSize.height * (1 - t._anchorPoint.y) * nextScale : -Infinity;
  for (const child of n._children) {
    const b = bounds(child.__id__, nextY, nextScale);
    bottom = Math.min(bottom, b.bottom); top = Math.max(top, b.top);
  }
  return { bottom, top };
}
const rightEntries = [pen, milk, find('nailHammerGameBtn'), find('penguinStackGameBtn')];
for (let i = 1; i < rightEntries.length; i++) {
  const minimumGap = rightEntries[i] === milk || rightEntries[i - 1] === milk ? 20 : 0;
  assert(bounds(rightEntries[i - 1]).bottom - bounds(rightEntries[i]).top > minimumGap,
    data[rightEntries[i]]._name + ' must not overlap; the new milk-tea entry needs 20px spacing');
}
console.log('PASS all homepage buttons, art and labels are scene-authored with valid bindings and spacing');

class Button { static EventType = { CLICK: 'click' }; }
class Node {
  static EventType = { TOUCH_END: 'touch-end' };
  constructor() { assert.fail('Runtime homepage node creation is forbidden'); }
}
const exportsObject = {};
const routedScenes = [];
const destinations = {
  startBtn: ['startGame', 'Game', 'GameScene'],
  shootingGameBtn: ['gotoShootingGlassBottles', 'ShootingGlassBottles', 'ShootingGlassBottlesGame'],
  archeryGameBtn: ['gotoArcheryGame', 'ArcheryGame', 'ArcheryGameScene'],
  penRefillGameBtn: ['gotoPenRefillGame', 'PenRefillFeedGame', 'PenRefillFeedGameScene'],
  milkTeaGameBtn: ['gotoMilkTeaGame', 'MilkTeaFeedGame', 'MilkTeaFeedGameScene'],
  nailHammerGameBtn: ['gotoNailHammerGame', 'NailHammerFeedGame', 'NailHammerFeedGameScene'],
  balloonWheelGameBtn: ['gotoBalloonWheelGame', 'BalloonWheelFeedGame', 'BalloonWheelFeedGameScene'],
  penguinStackGameBtn: ['gotoPenguinStackGame', 'PenguinStackFeedGame', 'PenguinStackFeedGameScene'],
};
const noop = () => {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true,
} }).outputText, {
  exports: exportsObject,
  require(name) {
    if (name.endsWith('GameSceneBundle')) return {
      GameSceneName: Object.fromEntries(Object.values(destinations).map(([, key, scene]) => [key, scene])),
      GameSceneBundle: { loadScene: async name => { routedScenes.push(name); } },
    };
    if (name.endsWith('SidebarRewardService')) return { SidebarRewardService: {
      addListener: noop, init: noop, checkAvailability: noop, removeListener: noop,
    } };
    if (name.endsWith('ShareRewardService')) return { ShareRewardService: { refreshDailyState: noop } };
    if (name.endsWith('FeedRevisitService')) return { FeedRevisitService: {
      isEnabled: () => false, initialize: () => assert.fail('Disabled revisit must not initialize'),
    } };
    if (name !== 'cc') return {};
    return { _decorator: { ccclass: () => value => value, property: () => () => {} },
      Component: class {}, Node, Button, Label: class {},
      game: { on: noop, off: noop }, Game: { EVENT_SHOW: 'show' } };
  },
});
const home = new exportsObject.mainScene();
for (const field of buttonFields) {
  const events = new Map();
  home[field] = { interactable: true, node: { isValid: true, active: true,
    on(type, callback, target) { assert(!events.has(type), 'Duplicate event binding: ' + field); events.set(type, { callback, target }); },
    off(type) { events.delete(type); }, events,
  } };
}
const editorMilk = home.milkTeaGameBtn, editorSubscribe = home.feedSubscribeBtn;
home.onLoad();
assert.equal(home.milkTeaGameBtn, editorMilk);
assert.equal(home.feedSubscribeBtn, editorSubscribe);
assert.equal(editorSubscribe.node.active, false);
assert.equal(editorSubscribe.node.events.size, 0);
assert(fs.existsSync('assets/gamescene/JuggleBallGameScene.scene'), 'Only the homepage entrance is removed');
console.log('PASS onLoad uses authored buttons; removed juggle entry stays absent and revisit stays disabled');
(async () => {
  for (const [field, [method, , scene]] of Object.entries(destinations)) {
    const handler = home[field].node.events.get('click');
    assert.equal(handler.callback, home[method]);
    assert.equal(handler.target, home);
    await handler.callback.call(handler.target);
    assert.equal(routedScenes.at(-1), scene);
  }
  assert.equal(routedScenes.length, Object.keys(destinations).length);
  home.onDestroy();
  assert.equal(editorMilk.node.events.size, 0);
  assert.equal(editorSubscribe.node.events.size, 0);
  home.milkTeaGameBtn = { node: null }; home.feedSubscribeBtn = { node: null };
  assert.doesNotThrow(() => home.onDestroy(), 'Scene destruction must tolerate already-destroyed entry nodes');
  const unboundHome = new exportsObject.mainScene();
  assert.doesNotThrow(() => { unboundHome.onLoad(); unboundHome.onDestroy(); });
  assert.equal(unboundHome.milkTeaGameBtn, null, 'Missing editor references must not generate fallback buttons');
  console.log('PASS all authored game entry click handlers route correctly and milk-tea event cleanup is safe');
})().catch(error => { console.error(error); process.exitCode = 1; });
