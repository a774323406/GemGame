const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const sharp = require('/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

async function main() {
  const {
    assetUuid,
    frameUuid,
    buildFoodDeliveryScene,
    appendFoodDeliveryCard,
    SCRIPT_TYPE,
    SCRIPT_UUID,
    SCENE_UUID,
  } = await import('./food_delivery_authoring.mjs');

  assert.equal(typeof assetUuid, 'function');
  assert.equal(typeof frameUuid, 'function');
  assert.equal(typeof buildFoodDeliveryScene, 'function');
  assert.equal(typeof appendFoodDeliveryCard, 'function');
  assert.equal(assetUuid('background.jpg'), assetUuid('background.jpg'), 'asset UUIDs must be stable');
  assert.notEqual(assetUuid('background.jpg'), assetUuid('courier.png'));
  assert.match(frameUuid('courier.png'), /^[0-9a-f-]{36}@f9941$/);

  const scene = buildFoodDeliveryScene();
  const byName = (name) => scene.find((object) => object.__type__ === 'cc.Node' && object._name === name);
  const nodeId = (name) => scene.findIndex((object) => object.__type__ === 'cc.Node' && object._name === name);
  const component = (node, type) => node._components
    .map((entry) => scene[entry.__id__])
    .find((entry) => entry.__type__ === type);

  for (const name of [
    'Background', 'SafeArea', 'GameplayRoot', 'Title', 'Courier', 'ArmPivot', 'Muzzle',
    'Guard', 'GuardHitArea', 'WallHitArea', 'GroundMarker', 'Building', 'ResultOverlay',
    'SuccessContent', 'FailureContent', 'SuccessTitle', 'FailureTitle', 'FailureMessage',
    'BackButton', 'HomeButton', 'RetryButton', 'NextButton',
  ]) assert(byName(name), `${name} must be authored in the scene`);

  for (let index = 0; index < 5; index += 1) {
    for (const prefix of ['Order', 'TargetHitArea', 'Check', 'StarOff', 'StarOn', 'PendingFood', 'FlyingFood']) {
      assert(byName(`${prefix}${index}`), `${prefix}${index} must exist`);
    }
  }
  for (let index = 0; index < 12; index += 1) assert(byName(`AimDot${index}`));

  assert.equal(byName('ResultOverlay')._active, false);
  assert.equal(byName('SuccessContent')._active, true);
  assert.equal(byName('FailureContent')._active, false);
  assert.equal(component(byName('ResultOverlay'), 'cc.BlockInputEvents') !== undefined, true);
  for (const name of ['BackButton', 'HomeButton', 'RetryButton', 'NextButton']) {
    assert(component(byName(name), 'cc.Button'), `${name} needs a serialized Button`);
  }
  for (const name of ['GuardHitArea', 'WallHitArea', 'GroundMarker', ...Array.from({ length: 5 }, (_, i) => `TargetHitArea${i}`)]) {
    assert.equal(component(byName(name), 'cc.Sprite'), undefined, `${name} must stay invisible`);
  }

  const backgroundSprite = component(byName('Background'), 'cc.Sprite');
  assert.equal(backgroundSprite._spriteFrame.__uuid__, frameUuid('background.jpg'));
  assert.equal(component(byName('Background'), 'cc.Widget'), undefined,
    'background must keep its authored aspect ratio instead of stretching to Canvas');

  for (let index = 0; index < 5; index += 1) {
    assert.equal(scene[byName(`TargetHitArea${index}`)._parent.__id__]._name, `Order${index}`,
      'moving an order in the editor must move its hit area');
    assert.equal(scene[byName(`Check${index}`)._parent.__id__]._name, `Order${index}`,
      'moving an order in the editor must move its delivered check');
  }
  assert.equal(scene[byName('GuardHitArea')._parent.__id__]._name, 'Guard',
    'moving the guard in the editor must move its hit area');
  assert.equal(scene[byName('WallHitArea')._parent.__id__]._name, 'Building',
    'moving the building in the editor must move its wall hit area');
  assert.equal(byName('PendingFood0')._parent.__id__, nodeId('ArmPivot'));
  assert.equal(byName('PendingFood0')._lpos.x, byName('Muzzle')._lpos.x,
    'held food and projectile origin must share the same hand position');
  assert.equal(byName('PendingFood0')._lpos.y, byName('Muzzle')._lpos.y);

  const controller = scene.find((object) => object.__type__ === SCRIPT_TYPE);
  assert(controller, 'serialized controller component must exist');
  assert.equal(controller.rotationSpeed, 480);
  assert.equal(controller.speed, 1750);
  assert.equal(controller.gravity, 1600);
  assert.equal(controller.radius, 8);
  assert.equal(controller.maxFlightSeconds, 4);
  assert.equal(controller.targets.length, 5);
  assert.equal(controller.orderSprites.length, 5);
  assert.equal(controller.checks.length, 5);
  assert.equal(controller.stars.length, 5);
  assert.equal(controller.pendingFoods.length, 5);
  assert.equal(controller.flyingFoods.length, 5);
  assert.equal(controller.aimDots.length, 12);

  for (const object of scene) {
    visitReferences(object, scene.length);
  }
  assert.equal(scene[nodeId('GameplayRoot')]._parent.__id__, nodeId('Canvas'));

  const requiredAssets = [
    'background.jpg', 'courier.png', 'arm.png', 'guard.png', 'building.png',
    'food-lime.png', 'food-icecream.png', 'food-cake.png', 'food-burger.png', 'food-cola.png',
    'order.png', 'star-off.png', 'star-on.png', 'check.png', 'back.png', 'orange-button.png',
    'dot.png', 'white.png',
  ];
  for (const name of requiredAssets) {
    const file = path.join('assets/res/foodDeliveryFeed', name);
    const metaFile = `${file}.meta`;
    assert(fs.existsSync(file), `${file} is missing`);
    assert(fs.existsSync(metaFile), `${metaFile} is missing`);
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    assert.equal(meta.uuid, assetUuid(name), `${name} asset UUID mismatch`);
    assert(meta.subMetas && meta.subMetas['6c48a'], `${name} SpriteFrame metadata is missing`);
    assert.equal(meta.subMetas.f9941.uuid, `${assetUuid(name)}@f9941`);
  }

  const reportPath = 'assets/res/foodDeliveryFeed/asset-report.json';
  assert(fs.existsSync(reportPath), 'asset-report.json is missing');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.assets['background.jpg'].width, 750);
  assert.equal(report.assets['background.jpg'].height, 1624);
  assert.equal(report.assets['background.jpg'].format, 'jpeg');
  assert.equal(report.assets['background.jpg'].rgbaBytes, 750 * 1624 * 4);
  assert(report.totalBytes < 1024 * 1024, `published artwork should stay below 1 MiB, got ${report.totalBytes}`);
  const backgroundMetadata = await sharp('assets/res/foodDeliveryFeed/background.jpg').metadata();
  assert.equal(backgroundMetadata.format, 'jpeg');
  assert.equal(backgroundMetadata.width, 750);
  assert.equal(backgroundMetadata.height, 1624);

  for (const [assetName, nodeName] of [
    ['courier.png', 'Courier'],
    ['arm.png', 'ThrowingArm'],
    ['guard.png', 'Guard'],
    ['building.png', 'Building'],
  ]) {
    const transform = component(byName(nodeName), 'cc.UITransform')._contentSize;
    assert.equal(report.assets[assetName].width, transform.width,
      `${nodeName} must not be stretched horizontally at runtime`);
    assert.equal(report.assets[assetName].height, transform.height,
      `${nodeName} must not be stretched vertically at runtime`);
  }

  const sizeLimits = {
    'courier.png': [230, 154], 'arm.png': [100, 66], 'guard.png': [132, 184],
    'building.png': [148, 900], 'food-lime.png': [80, 88], 'food-icecream.png': [80, 88],
    'food-cake.png': [80, 88], 'food-burger.png': [80, 88], 'food-cola.png': [80, 88],
    'order.png': [112, 112], 'star-off.png': [64, 64], 'star-on.png': [64, 64],
    'check.png': [64, 64], 'back.png': [88, 88], 'orange-button.png': [280, 92],
    'dot.png': [8, 8], 'white.png': [2, 2],
  };
  for (const [name, [maxWidth, maxHeight]] of Object.entries(sizeLimits)) {
    const info = await sharp(path.join('assets/res/foodDeliveryFeed', name)).metadata();
    assert(info.width <= maxWidth, `${name} exceeds max width`);
    assert(info.height <= maxHeight, `${name} exceeds max height`);
  }

  assertTargetsReachable(scene, controller);

  const scenePath = 'assets/gamescene/FoodDeliveryFeedGameScene.scene';
  assert(fs.existsSync(scenePath), `${scenePath} is missing`);
  assert.deepEqual(JSON.parse(fs.readFileSync(scenePath, 'utf8')), scene, 'disk scene must match the authoring result');
  const sceneMeta = JSON.parse(fs.readFileSync(`${scenePath}.meta`, 'utf8'));
  assert.equal(sceneMeta.uuid, SCENE_UUID);
  const scriptMeta = JSON.parse(fs.readFileSync('assets/scripts/foodDeliveryFeedGameScene.ts.meta', 'utf8'));
  assert.equal(scriptMeta.uuid, SCRIPT_UUID);
  const controllerSource = fs.readFileSync('assets/scripts/foodDeliveryFeedGameScene.ts', 'utf8');
  assert(!/new\s+Node\s*\(/.test(controllerSource), 'controller must not construct fixed UI nodes');
  assert(!/spriteFrame\s*=/.test(controllerSource), 'controller must not overwrite editor SpriteFrames');
  assert(!/\.string\s*=/.test(controllerSource), 'controller must not overwrite editor label text');

  console.log(`Food delivery scene authoring tests passed (${scene.length} serialized objects)`);
}

function loadRules() {
  const code = ts.transpileModule(fs.readFileSync('assets/scripts/foodDeliveryRules.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const output = {};
  vm.runInNewContext(code, { exports: output, module: { exports: output }, Math, Set, Error });
  return output;
}

function assertTargetsReachable(scene, controller) {
  const { FoodDeliveryRound } = loadRules();
  const kinds = ['lime', 'icecream', 'cake', 'burger', 'cola'];
  const nodeId = (name) => scene.findIndex((object) => object.__type__ === 'cc.Node' && object._name === name);
  const node = (name) => scene[nodeId(name)];
  const size = (value) => value._components
    .map((entry) => scene[entry.__id__])
    .find((entry) => entry.__type__ === 'cc.UITransform')._contentSize;
  const gameplayId = nodeId('GameplayRoot');
  const positionInGameplay = (value) => {
    let x = value._lpos.x;
    let y = value._lpos.y;
    let parentId = value._parent?.__id__;
    while (Number.isInteger(parentId) && parentId !== gameplayId) {
      const parent = scene[parentId];
      if (parent.__type__ !== 'cc.Node') break;
      x += parent._lpos.x;
      y += parent._lpos.y;
      parentId = parent._parent?.__id__;
    }
    return { x, y };
  };
  const rect = (name) => {
    const value = node(name);
    const dimensions = size(value);
    const position = name === 'GameplayRoot' ? value._lpos : positionInGameplay(value);
    return {
      x: position.x - dimensions.width / 2,
      y: position.y - dimensions.height / 2,
      width: dimensions.width,
      height: dimensions.height,
    };
  };
  const gameplay = rect('GameplayRoot');
  const world = {
    targets: kinds.map((food, index) => ({ food, ...rect(`TargetHitArea${index}`) })),
    guard: rect('GuardHitArea'),
    wall: rect('WallHitArea'),
    bounds: gameplay,
    groundY: node('GroundMarker')._lpos.y,
  };
  const tuning = {
    speed: controller.speed,
    gravity: controller.gravity,
    radius: controller.radius,
    maxFlightSeconds: controller.maxFlightSeconds,
  };
  const origin = positionInGameplay(node('Muzzle'));
  for (const food of kinds) {
    let reachable = false;
    for (let angle = 0; angle <= 180 && !reachable; angle += 0.25) {
      const order = [food, ...kinds.filter((entry) => entry !== food)];
      const round = new FoodDeliveryRound(world, tuning, order);
      round.shoot(angle, origin);
      for (let frame = 0; frame < 300 && round.phase === 'flying'; frame += 1) round.tick(1 / 60);
      reachable = round.score === 1;
    }
    assert(reachable, `${food} target must be reachable from serialized Muzzle`);
  }
}

function visitReferences(value, length) {
  if (Array.isArray(value)) {
    for (const child of value) visitReferences(child, length);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Object.prototype.hasOwnProperty.call(value, '__id__')) {
    assert(Number.isInteger(value.__id__), 'serialized reference must be an integer');
    assert(value.__id__ >= 0 && value.__id__ < length, `dangling serialized reference ${value.__id__}`);
    return;
  }
  for (const child of Object.values(value)) visitReferences(child, length);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
