// Offline serialized-scene authoring only. Runtime never constructs fixed UI.
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  SceneAuthor,
  compressUuid,
  ref,
  rgba,
  vec,
} from './penguin_scene_authoring.mjs';
import { appendSceneGlobals, fitFeedResultOverlay } from './feed_result_layout.mjs';

export function assetUuid(name) {
  const hash = crypto.createHash('sha256').update(`GemGame/foodDeliveryFeed/${name}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function frameUuid(name) {
  return `${assetUuid(name)}@f9941`;
}

export const SCENE_UUID = assetUuid('FoodDeliveryFeedGameScene');
export const SCRIPT_UUID = assetUuid('foodDeliveryFeedGameScene.ts');
export const SCRIPT_TYPE = compressUuid(SCRIPT_UUID);

function makeSceneRoot(author) {
  author.add({
    __type__: 'cc.SceneAsset',
    _name: 'FoodDeliveryFeedGameScene',
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    scene: ref(1),
  });
  author.add({
    __type__: 'cc.Scene',
    _name: 'FoodDeliveryFeedGameScene',
    _objFlags: 0,
    __editorExtras__: {},
    _parent: null,
    _children: [],
    _active: true,
    _components: [],
    _prefab: null,
    _lpos: vec(),
    _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
    _lscale: vec(1, 1, 1),
    _mobility: 0,
    _layer: 1073741824,
    _euler: vec(),
    autoReleaseAssets: false,
    _globals: null,
    _id: SCENE_UUID,
  });
}

function actionButton(author, parent, name, caption, x, y, width = 250) {
  const node = author.sprite(name, parent, frameUuid('orange-button.png'), {
    x, y, w: width, h: 82,
  });
  author.label('Caption', node, caption, {
    w: width - 24,
    h: 58,
    size: 31,
    color: rgba(255, 255, 255),
    outlineColor: rgba(117, 57, 20),
    outlineWidth: 3,
  });
  return author.button(node);
}

export function buildFoodDeliveryScene() {
  const source = JSON.parse(fs.readFileSync('assets/gamescene/ArcheryGameScene.scene', 'utf8'));
  const author = new SceneAuthor([], 'foodDelivery');
  const objects = author.objects;
  makeSceneRoot(author);

  const canvas = author.node('Canvas', 1, { x: 375, y: 812, w: 750, h: 1624 });
  const camera = author.node('Camera', canvas, { z: 1000, w: 1, h: 1 });
  objects[camera]._layer = 1073741824;
  const cameraTemplate = structuredClone(source.find((item) => item.__type__ === 'cc.Camera'));
  delete cameraTemplate.node;
  delete cameraTemplate._id;
  const cameraComponent = author.component(camera, 'cc.Camera', { ...cameraTemplate, _orthoHeight: 812 });
  author.component(canvas, 'cc.Canvas', {
    _cameraComponent: ref(cameraComponent),
    _alignCanvasWithScreen: true,
  });
  author.widget(canvas, 45);

  const background = author.sprite('Background', canvas, frameUuid('background.jpg'), {
    w: 750, h: 1624,
  });
  author.widget(background, 45);

  // Safe-area anchored editor nodes. The runtime may inset SafeArea as one unit,
  // but never rewrites the authored child spacing or style.
  const safeArea = author.node('SafeArea', canvas, { y: 812, w: 750, h: 210, ay: 1 });
  author.widget(safeArea, 17, { _top: 70 });
  const backNode = author.sprite('BackButton', safeArea, frameUuid('back.png'), {
    x: -319, y: -48, w: 76, h: 76,
  });
  const backButton = author.button(backNode);
  author.label('Title', safeArea, '外卖精准投送', {
    x: -112, y: -52, w: 390, h: 72, size: 44, align: 0,
    color: rgba(255, 255, 255), outlineColor: rgba(31, 30, 28), outlineWidth: 5,
  });

  const gameplay = author.node('GameplayRoot', canvas, { w: 750, h: 1624 });
  const starX = [-256, -196, -136, -76, -16];
  const starOff = starX.map((x, index) => author.sprite(`StarOff${index}`, gameplay, frameUuid('star-off.png'), {
    x, y: 574, w: 54, h: 54,
  }));
  const starOn = starX.map((x, index) => author.sprite(`StarOn${index}`, gameplay, frameUuid('star-on.png'), {
    x, y: 574, w: 54, h: 54, active: false,
  }));

  const building = author.sprite('Building', gameplay, frameUuid('building.png'), {
    x: 309, y: 100, w: 148, h: 900,
  });
  const wallHitArea = author.node('WallHitArea', gameplay, {
    x: 317.5, y: 225, w: 115, h: 1150,
  });
  const orderSprites = [];
  const targets = [];
  const checks = [];
  const foods = ['lime', 'icecream', 'cake', 'burger', 'cola'];
  for (let index = 0; index < foods.length; index += 1) {
    const y = 400 - index * 120;
    const order = author.sprite(`Order${index}`, gameplay, frameUuid('order.png'), {
      x: 189, y, w: 104, h: 92,
    });
    author.sprite(`OrderFood${index}`, order, frameUuid(`food-${foods[index]}.png`), {
      x: -3, w: 62, h: 66,
    });
    const target = author.node(`TargetHitArea${index}`, gameplay, {
      x: 189, y, w: 72, h: 68,
    });
    const check = author.sprite(`Check${index}`, gameplay, frameUuid('check.png'), {
      x: 238, y, w: 62, h: 62, active: false,
    });
    orderSprites.push(order);
    targets.push(target);
    checks.push(check);
  }

  const guard = author.sprite('Guard', gameplay, frameUuid('guard.png'), {
    x: 142, y: -263, w: 132, h: 184,
  });
  const guardHitArea = author.node('GuardHitArea', gameplay, {
    x: 141, y: -262, w: 82, h: 156,
  });
  const groundMarker = author.node('GroundMarker', gameplay, {
    x: 0, y: -350, w: 750, h: 1,
  });

  const courier = author.sprite('Courier', gameplay, frameUuid('courier.png'), {
    x: -247, y: -268, w: 230, h: 154,
  });
  const armPivot = author.node('ArmPivot', gameplay, {
    x: -230, y: -245, w: 1, h: 1,
  });
  author.sprite('ThrowingArm', armPivot, frameUuid('arm.png'), {
    x: 43, w: 100, h: 66, ax: 0.1,
  });
  const muzzle = author.node('Muzzle', armPivot, { x: 40, y: 0, w: 1, h: 1 });

  const aimDots = Array.from({ length: 12 }, (_, index) => author.sprite(`AimDot${index}`, armPivot, frameUuid('dot.png'), {
    x: 72 + index * 24, w: 8, h: 8,
  }));
  const pendingFoods = foods.map((food, index) => author.sprite(`PendingFood${index}`, armPivot, frameUuid(`food-${food}.png`), {
    x: 82, w: 58, h: 62, active: index === 0,
  }));
  const flyingFoods = foods.map((food, index) => author.sprite(`FlyingFood${index}`, gameplay, frameUuid(`food-${food}.png`), {
    x: -190, y: -245, w: 58, h: 62, active: false,
  }));

  const hint = author.label('TapHint', gameplay, '点击屏幕，精准投送！', {
    x: -65, y: -430, w: 520, h: 62, size: 32,
    color: rgba(255, 255, 255), outlineColor: rgba(42, 41, 38), outlineWidth: 4,
  });
  author.opacity(hint.node);

  const resultOverlay = author.node('ResultOverlay', canvas, { w: 750, h: 1624, active: false });
  author.component(resultOverlay, 'cc.BlockInputEvents');
  const dim = author.sprite('ResultDim', resultOverlay, frameUuid('white.png'), {
    w: 750, h: 1624, color: rgba(19, 31, 43, 190),
  });
  author.widget(dim, 45);
  const panel = author.sprite('ResultPanel', resultOverlay, frameUuid('white.png'), {
    y: 20, w: 600, h: 590, color: rgba(255, 250, 226, 255),
  });
  const successTitle = author.label('SuccessTitle', panel, '投送成功', {
    y: 204, w: 500, h: 84, size: 56,
    color: rgba(55, 175, 76), outlineColor: rgba(54, 77, 38), outlineWidth: 4,
  });
  const failureTitle = author.label('FailureTitle', panel, '差点就成功了，重新试试吧', {
    y: 204, w: 530, h: 92, size: 39, active: false,
    color: rgba(231, 78, 71), outlineColor: rgba(99, 49, 31), outlineWidth: 3,
  });
  author.label('ResultMessage', panel, '五份外卖全部送达！', {
    y: 105, w: 520, h: 64, size: 30,
    color: rgba(96, 66, 39), outline: false,
  });
  author.sprite('ResultStar', panel, frameUuid('star-on.png'), {
    y: 28, w: 92, h: 92,
  });
  const retryButton = actionButton(author, panel, 'RetryButton', '再试一次', 0, -86, 330);
  const homeButton = actionButton(author, panel, 'HomeButton', '返回首页', -145, -196, 270);
  const nextButton = actionButton(author, panel, 'NextButton', '下一关', 145, -196, 270);

  author.component(canvas, SCRIPT_TYPE, {
    rotationSpeed: 480,
    speed: 1750,
    gravity: 1600,
    radius: 8,
    maxFlightSeconds: 4,
    background: ref(background),
    gameplayRoot: ref(gameplay),
    courier: ref(courier),
    armPivot: ref(armPivot),
    muzzle: ref(muzzle),
    guard: ref(guard),
    guardHitArea: ref(guardHitArea),
    wallHitArea: ref(wallHitArea),
    groundMarker: ref(groundMarker),
    resultOverlay: ref(resultOverlay),
    successTitle: ref(successTitle.node),
    failureTitle: ref(failureTitle.node),
    targets: targets.map(ref),
    orderSprites: orderSprites.map(ref),
    checks: checks.map(ref),
    stars: starOn.map(ref),
    pendingFoods: pendingFoods.map(ref),
    flyingFoods: flyingFoods.map(ref),
    aimDots: aimDots.map(ref),
    backButton: ref(backButton),
    homeButton: ref(homeButton),
    retryButton: ref(retryButton),
    nextButton: ref(nextButton),
  });

  objects[1]._globals = ref(appendSceneGlobals(source, objects));
  fitFeedResultOverlay(objects, 'FoodDeliveryFeedGameScene');
  return objects;
}

// Task 4 owns the real homepage append. Leaving this explicit no-op prevents a
// scene-generation command from overwriting the user's current NewMainScene.
export function appendFoodDeliveryCard(_objects) {
  return -1;
}
