const fs = require('node:fs');
const assert = require('node:assert/strict');

const scenePath = 'assets/gamescene/AirdropRescueFeedGameScene.scene';
const authoringPath = './airdrop_rescue_authoring.mjs';
assert(fs.existsSync(scenePath), 'airdrop scene must exist');
assert(fs.existsSync(scenePath + '.meta'), 'airdrop scene meta must exist');
assert(fs.existsSync('assets/scripts/airdropRescueFeedGameScene.ts.meta'), 'airdrop controller meta must exist');

(async () => {
  const { buildAirdropRescueScene, SCENE_UUID, uuid } = await import(authoringPath);
  const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
  assert.deepEqual(scene, buildAirdropRescueScene(), 'serialized scene matches authoring');
  assert.equal(JSON.parse(fs.readFileSync(scenePath + '.meta', 'utf8')).uuid, SCENE_UUID);

  const node = name => scene.findIndex(item => item.__type__ === 'cc.Node' && item._name === name);
  const component = (id, type) => scene[id]._components.map(ref => scene[ref.__id__]).find(item => item.__type__ === type);
  const refs = value => {
    if (!value || typeof value !== 'object') return;
    if (Number.isInteger(value.__id__)) assert(scene[value.__id__], 'scene contains a dangling reference');
    else Object.values(value).forEach(refs);
  };
  refs(scene);

  assert.equal(node('Canvas') >= 0, true);
  assert.equal(node('Bottle') >= 0, true);
  assert.equal(node('Pig') >= 0, true);
  assert.equal(scene.filter(item => item.__type__ === 'cc.Node' && /^Target\d+$/.test(item._name)).length, 12);
  assert.equal(component(node('ResultOverlay'), 'cc.BlockInputEvents').__type__, 'cc.BlockInputEvents');
  assert.equal(component(node('ResultDim'), 'cc.Sprite')._color.a, 145);
  for (const name of ['BackButton', 'SlowdownButton', 'ReviveButton', 'ReplayButton', 'HomeButton']) {
    assert.equal(component(node(name), 'cc.Button').__type__, 'cc.Button', name + ' is clickable');
  }
  for (const height of [1334, 1624]) {
    for (const name of ['ReviveButton', 'ReplayButton', 'HomeButton']) {
      const widget = component(node(name), 'cc.Widget');
      const size = component(node(name), 'cc.UITransform')._contentSize;
      assert(widget._verticalCenter * height - size.height / 2 >= -height / 2 + 80, name + ' safe bottom at ' + height);
    }
  }
  assert(fs.readFileSync('assets/scripts/airdropRescueFeedGameScene.ts.meta', 'utf8').includes(uuid('airdropRescueFeedGameScene.ts')));
  console.log('PASS airdrop scene authoring, node pool, result overlay, controls and portrait layout');
})().catch(error => { console.error(error); process.exitCode = 1; });
