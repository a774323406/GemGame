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
assert.deepEqual(
  [component(canvas.id, 'cc.UITransform')._contentSize.width,
   component(canvas.id, 'cc.UITransform')._contentSize.height],
  [750, 1624],
);
const controller = component(canvas.id, SCRIPT_TYPE);
assert(controller, 'whiteGooseFeedGameScene controller is missing');

const background = nodeByName('Background');
assert(background, 'Background is missing');
const backgroundSize = component(background.id, 'cc.UITransform')._contentSize;
assert.equal(backgroundSize.width / backgroundSize.height, 720 / 1680,
  'background must keep the source aspect ratio');
assert(backgroundSize.width >= 750 || backgroundSize.height >= 1624,
  'background must cover the design canvas');

const gooseSlots = nodeByName('GooseSlots');
assert(gooseSlots, 'GooseSlots is missing');
assert.equal(gooseSlots.entry._children.length, 10);
for (let index = 0; index < 10; index += 1) {
  const slot = nodeByName(`GooseSlot${index}`);
  assert(slot, `GooseSlot${index} is missing`);
  const children = slot.entry._children.map(object);
  assert(children.some(node => node._name === 'Shadow'));
  const goose = children.find(node => node._name === 'GooseSkeleton');
  assert(goose, `GooseSlot${index} skeleton is missing`);
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
const resultDim = nodeByName('ResultDim');
assert.equal(component(resultDim.id, 'cc.Widget')._alignFlags, 45);
for (const side of ['_left', '_right', '_top', '_bottom']) {
  assert.equal(component(resultDim.id, 'cc.Widget')[side], 0);
}

for (const name of [
  'BackButton', 'AddRingsButton', 'ReplayButton', 'RestartButton',
  'ReviveButton', 'HomeButton', 'NextButton',
]) {
  const node = nodeByName(name);
  assert(node, `missing editor-authored node ${name}`);
  assert(component(node.id, 'cc.Button'), `missing editor-authored button ${name}`);
}

const visibleStrings = scene
  .filter(entry => typeof entry?._string === 'string')
  .map(entry => entry._string);
for (const text of ['套大鹅', '已套中 0/7', '套圈 10/10', '再玩一次', '重新开始', '加套圈']) {
  assert(visibleStrings.includes(text), `missing editor-authored label: ${text}`);
}

for (const key of [
  'sceneBackground', 'sceneBackButton', 'sceneAddRingsButton', 'sceneCaughtLabel',
  'sceneRingLabel', 'sceneFieldTouchArea', 'sceneGooseSlots', 'sceneThrowingHand',
  'sceneThrownRingLayer', 'sceneRingTemplates', 'sceneResultOverlay', 'sceneResultPanel',
  'sceneSuccessActions', 'sceneFailureActions', 'sceneReplayButton', 'sceneNextButton',
  'sceneRestartButton', 'sceneHomeButton', 'sceneReviveButton',
]) {
  assert(controller[key] !== undefined && controller[key] !== null, `controller binding missing: ${key}`);
}
assert.equal(controller.sceneRingTemplates.length, 3);

console.log('White goose scene tests passed');
