const assert = require('node:assert/strict');
const fs = require('node:fs');

const scene = JSON.parse(fs.readFileSync('assets/gamescene/WhiteGooseFeedGameScene.scene', 'utf8'));
const SCRIPT_TYPE = '9568dxNq8lUaqJgmVBd2YOX';
const SCENE_UUID = 'ba4c8390-ece1-56f3-ae54-585950e78599';

const object = ref => scene[ref.__id__];
const nodes = scene
  .map((entry, id) => ({ entry, id }))
  .filter(({ entry }) => entry?.__type__ === 'cc.Node');
const nodeByName = name => nodes.find(({ entry }) => entry._name === name);
const component = (nodeId, type) => scene[nodeId]._components
  .map(object)
  .find(entry => entry.__type__ === type);

assert.equal(scene[0].__type__, 'cc.SceneAsset');
assert.equal(scene[0]._name, 'WhiteGooseFeedGameScene');
assert.equal(scene[1].__type__, 'cc.Scene');
assert.equal(scene[1]._name, 'WhiteGooseFeedGameScene');
assert.equal(scene[1]._id, SCENE_UUID);

for (const [index, entry] of scene.entries()) {
  const walk = value => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== 'object') return;
    if (Number.isInteger(value.__id__)) {
      assert(value.__id__ >= 0 && value.__id__ < scene.length,
        `invalid __id__ ${value.__id__} from object ${index}`);
      return;
    }
    Object.values(value).forEach(walk);
  };
  walk(entry);
}

const canvas = nodeByName('Canvas');
assert(canvas, 'Canvas is missing');
const canvasSize = component(canvas.id, 'cc.UITransform')._contentSize;
assert(Math.abs(canvasSize.width - 750) < 1e-9);
assert(Math.abs(canvasSize.height - 1624) < 1e-9);
const controller = component(canvas.id, SCRIPT_TYPE);
assert(controller, 'whiteGooseFeedGameScene controller is missing');

const background = nodeByName('Background');
assert(background, 'Background is missing');
const backgroundSize = component(background.id, 'cc.UITransform')._contentSize;
assert(Math.abs((backgroundSize.width / backgroundSize.height) - (720 / 1680)) < 1e-9,
  'background must keep the source aspect ratio');
assert(backgroundSize.width >= 750 && backgroundSize.height >= 1800,
  'background must cover 750x1800 tall screens without stretching');

const gooseSlots = nodeByName('GooseSlots');
assert(gooseSlots, 'GooseSlots is missing');
assert.equal(gooseSlots.entry._children.length, 10);
for (let index = 0; index < 10; index += 1) {
  const slot = nodeByName(`GooseSlot${index}`);
  assert(slot, `GooseSlot${index} is missing`);
  const children = slot.entry._children.map(object);
  const shadow = children.find(node => node._name === 'Shadow');
  assert(shadow, `GooseSlot${index} shadow is missing`);
  const goose = children.find(node => node._name === 'GooseSkeleton');
  assert(goose, `GooseSlot${index} skeleton is missing`);
  assert.equal(goose._lpos.y, shadow._lpos.y,
    `GooseSlot${index} feet and shadow must share the same local baseline`);
  assert(component(scene.indexOf(goose), 'sp.Skeleton'));
  assert(children.some(node => node._name === 'HitArea'));
}

assert(nodeByName('ThrowingHand'));
assert(component(nodeByName('ThrowingHand').id, 'sp.Skeleton'));
assert(nodeByName('ThrownRingLayer'));
assert(nodeByName('Foreground'));
assert(nodeByName('FieldTouchArea'));

const overlay = nodeByName('ResultOverlay');
assert(overlay, 'ResultOverlay is missing');
assert(component(overlay.id, 'cc.BlockInputEvents'));
assert.equal(overlay.entry._active, true,
  'the result UI should remain visible and editable in Creator; resetRound hides it at runtime');
const resultDim = nodeByName('Mask');
assert(resultDim, 'the delivery-style full-screen result mask is missing');
assert.equal(component(resultDim.id, 'cc.Widget')._alignFlags, 45);
for (const side of ['_left', '_right', '_top', '_bottom']) {
  assert.equal(component(resultDim.id, 'cc.Widget')[side], 0);
}
assert.deepEqual(component(resultDim.id, 'cc.Sprite')._color,
  { __type__: 'cc.Color', r: 0, g: 0, b: 0, a: 255 });
assert.equal(component(resultDim.id, 'cc.UIOpacity')._opacity, 200);

const resultPanel = nodeByName('ResultPanel');
const resultPanelSize = component(resultPanel.id, 'cc.UITransform')._contentSize;
assert(Math.abs(resultPanelSize.width - 750) < 1e-9);
assert(Math.abs(resultPanelSize.height - 1624) < 1e-9);
assert(component(resultPanel.id, 'cc.Widget'), 'ResultPanel must stretch with tall phone screens');
assert.equal(component(resultPanel.id, 'cc.Sprite'), undefined,
  'the delivery-style result page is full-screen layout content, not a rectangular popup');

for (const name of ['ResultGameTitle', 'ResultDivider']) {
  assert(nodeByName(name), `missing delivery-style result node ${name}`);
}
assert.equal(component(nodeByName('ResultGameTitle').id, 'cc.Label')._string, '套大鹅');
assert.equal(component(nodeByName('SuccessTitle').id, 'cc.Label')._string, '挑战成功');
assert.equal(component(nodeByName('FailureTitle').id, 'cc.Label')._string, '挑战失败');

assert.equal(nodeByName('NextButton'), undefined,
  'the success result must not offer navigation into the puzzle game');
const sharedActionButtonFrame = 'dd5b91d5-aed1-5e36-aefd-d6dc5056eaa3@f9941';
for (const name of ['ReplayButton', 'RestartButton', 'ReviveButton', 'HomeButton']) {
  const node = nodeByName(name);
  const size = component(node.id, 'cc.UITransform')._contentSize;
  assert.deepEqual([size.width, size.height], [360, 112],
    `${name} must use the same proportions as the food-delivery result buttons`);
  assert.equal(component(node.id, 'cc.Sprite')._spriteFrame.__uuid__, sharedActionButtonFrame,
    `${name} must use the food-delivery result button artwork`);
  assert.equal(node.entry._lpos.x, 0, `${name} must be centered`);
}

for (const name of [
  'BackButton', 'AddRingsButton', 'ReplayButton', 'RestartButton',
  'ReviveButton', 'HomeButton',
]) {
  const node = nodeByName(name);
  assert(node, `missing editor-authored node ${name}`);
  assert(component(node.id, 'cc.Button'), `missing editor-authored button ${name}`);
}

const visibleStrings = scene
  .filter(entry => typeof entry?._string === 'string')
  .map(entry => entry._string);
for (const text of ['套大鹅', '已套中 0/7', '套圈 10/10', '再玩一次', '重新开始', '+5套圈']) {
  assert(visibleStrings.includes(text), `missing editor-authored label: ${text}`);
}
assert(!visibleStrings.includes('进入拼豆'), 'the removed puzzle entry must not remain visible');

for (const key of [
  'sceneBackground', 'sceneBackButton', 'sceneAddRingsButton', 'sceneCaughtLabel',
  'sceneRingLabel', 'sceneFieldTouchArea', 'sceneGooseSlots', 'sceneThrowingHand',
  'sceneThrownRingLayer', 'sceneRingTemplates', 'sceneResultOverlay', 'sceneResultPanel',
  'sceneSuccessActions', 'sceneFailureActions', 'sceneReplayButton',
  'sceneRestartButton', 'sceneHomeButton', 'sceneReviveButton',
]) {
  assert(controller[key] !== undefined && controller[key] !== null, `controller binding missing: ${key}`);
}
assert.equal(controller.sceneNextButton, undefined,
  'the serialized controller must not retain a stale puzzle-entry binding');
assert.equal(controller.sceneRingTemplates.length, 3);

console.log('White goose scene tests passed');
