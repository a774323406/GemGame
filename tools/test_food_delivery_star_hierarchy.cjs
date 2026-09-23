const assert = require('node:assert/strict');
const fs = require('node:fs');

const EXPECTED_STAR_X = [-134.746, -74.746, -14.746, 45.254, 105.254];

function assertStarHierarchy(scene, source) {
  const byName = (name) => scene.find((object) => object?.__type__ === 'cc.Node' && object._name === name);
  const component = (node, type) => (node?._components || [])
    .map((entry) => scene[entry.__id__])
    .find((entry) => entry?.__type__ === type);
  const parentName = (node) => scene[node?._parent?.__id__]?._name;
  const starsRoot = byName('StarsRoot');

  assert(starsRoot, `${source}: StarsRoot must group every score star in the editor`);
  assert.equal(parentName(starsRoot), 'GameplayRoot');
  assert.deepEqual([starsRoot._lpos.x, starsRoot._lpos.y], [0, 0]);

  for (let index = 0; index < 5; index += 1) {
    const emptyStar = byName(`StarOff${index}`);
    const filledStar = byName(`StarOn${index}`);
    assert(emptyStar, `${source}: StarOff${index} must exist`);
    assert(filledStar, `${source}: StarOn${index} must exist`);
    assert.equal(parentName(emptyStar), 'StarsRoot',
      `${source}: all empty stars must live under one editor group`);
    assert.equal(parentName(filledStar), `StarOff${index}`,
      `${source}: moving an empty star must move its filled state`);
    assert.deepEqual([emptyStar._lpos.x, emptyStar._lpos.y], [EXPECTED_STAR_X[index], 574],
      `${source}: the user-authored empty-star layout must be preserved`);
    assert.deepEqual([filledStar._lpos.x, filledStar._lpos.y], [0, 0],
      `${source}: a filled star must align exactly with its empty-star parent`);
    assert.deepEqual(
      component(filledStar, 'cc.UITransform')._contentSize,
      component(emptyStar, 'cc.UITransform')._contentSize,
      `${source}: empty and filled star sizes must match`,
    );
  }

  const controller = scene.find((object) => Array.isArray(object?.stars) && object.stars.length === 5
    && Array.isArray(object?.pendingFoods) && object.pendingFoods.length === 5);
  assert(controller, `${source}: food delivery controller must exist`);
  assert.deepEqual(
    controller.stars.map((entry) => scene[entry.__id__]?._name),
    ['StarOn0', 'StarOn1', 'StarOn2', 'StarOn3', 'StarOn4'],
    `${source}: score progression must continue toggling the filled-star children`,
  );
}

(async () => {
  const { buildFoodDeliveryScene } = await import('./food_delivery_authoring.mjs');
  assertStarHierarchy(buildFoodDeliveryScene(), 'generated scene');
  const diskScene = JSON.parse(fs.readFileSync('assets/gamescene/FoodDeliveryFeedGameScene.scene', 'utf8'));
  assertStarHierarchy(diskScene, 'editor scene');
  console.log('Food delivery star hierarchy tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
