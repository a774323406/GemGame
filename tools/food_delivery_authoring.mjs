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
const SHARED_ACTION_BUTTON_FRAME = 'dd5b91d5-aed1-5e36-aefd-d6dc5056eaa3@f9941';
const FOOD_DELIVERY_TITLE_FRAME = 'a21b33ea-e748-44dd-a2af-092a25be28fa@f9941';

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
  const node = author.sprite(name, parent, SHARED_ACTION_BUTTON_FRAME, {
    x, y, w: width, h: 112,
  });
  author.label('Caption', node, caption, {
    w: width - 24,
    h: 62,
    size: 34,
    color: rgba(255, 255, 255),
    outlineColor: rgba(117, 57, 20),
    outlineWidth: 3,
  });
  return author.button(node);
}

export function buildFoodDeliveryScene() {
  const source = JSON.parse(fs.readFileSync('assets/gamescene/ArcheryGameScene.scene', 'utf8'));
  const juggleSource = JSON.parse(fs.readFileSync('assets/gamescene/JuggleBallGameScene.scene', 'utf8'));
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

  // Safe-area anchored editor nodes. The runtime may inset SafeArea as one unit,
  // but never rewrites the authored child spacing or style.
  const safeArea = author.node('SafeArea', canvas, { y: 742, w: 750, h: 210, ay: 1 });
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
  const starsRoot = author.node('StarsRoot', gameplay, { w: 0, h: 0 });
  const starX = [-134.746, -74.746, -14.746, 45.254, 105.254];
  const starOff = starX.map((x, index) => author.sprite(`StarOff${index}`, starsRoot, frameUuid('star-off.png'), {
    x, y: 574, w: 54, h: 54,
  }));
  const starOn = starOff.map((parent, index) => author.sprite(`StarOn${index}`, parent, frameUuid('star-on.png'), {
    w: 54, h: 54, active: false,
  }));

  const building = author.sprite('Building', gameplay, frameUuid('building.png'), {
    x: 270, y: 31.5, w: 210, h: 763,
  });
  const wallHitArea = author.node('WallHitArea', building, {
    x: 50, y: 68.5, w: 110, h: 900,
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
    const target = author.node(`TargetHitArea${index}`, order, {
      w: 72, h: 68,
    });
    const check = author.sprite(`Check${index}`, order, frameUuid('check.png'), {
      x: 49, w: 62, h: 62, active: false,
    });
    orderSprites.push(order);
    targets.push(target);
    checks.push(check);
  }

  const guard = author.sprite('Guard', gameplay, frameUuid('guard.png'), {
    x: 142, y: -263, w: 165, h: 184,
  });
  const guardHitArea = author.node('GuardHitArea', guard, {
    x: -1, y: 1, w: 104, h: 156,
  });
  const groundMarker = author.node('GroundMarker', gameplay, {
    x: 0, y: -350, w: 750, h: 1,
  });

  const courier = author.sprite('Courier', gameplay, frameUuid('courier.png'), {
    x: -247, y: -229.5, w: 230, h: 241,
  });
  const armPivot = author.node('ArmPivot', gameplay, {
    x: -265, y: -222, w: 1, h: 1,
  });
  author.sprite('ThrowingArm', armPivot, frameUuid('arm.png'), {
    x: 0, y: 0, w: 100, h: 44, ax: 0.08, ay: 0.77,
  });
  const muzzle = author.node('Muzzle', armPivot, { x: 86, y: 0, w: 1, h: 1 });

  const aimDots = Array.from({ length: 12 }, (_, index) => author.sprite(`AimDot${index}`, armPivot, frameUuid('dot.png'), {
    x: 118 + index * 24, w: 8, h: 8,
  }));
  const pendingFoods = foods.map((food, index) => author.sprite(`PendingFood${index}`, armPivot, frameUuid(`food-${food}.png`), {
    x: 86, w: 58, h: 62, active: index === 0,
  }));
  const flyingFoods = foods.map((food, index) => author.sprite(`FlyingFood${index}`, gameplay, frameUuid(`food-${food}.png`), {
    x: -190, y: -245, w: 58, h: 62, active: false,
  }));

  const hint = author.label('TapHint', gameplay, '点击屏幕，精准投送！', {
    x: -65, y: -430, w: 520, h: 62, size: 32,
    color: rgba(255, 255, 255), outlineColor: rgba(42, 41, 38), outlineWidth: 4,
  });
  author.opacity(hint.node);

  const sourceSlowdownId = juggleSource.findIndex(item =>
    item?.__type__ === 'cc.Node' && item._name === 'SlowdownButton');
  if (sourceSlowdownId < 0) throw new Error('JuggleBallGameScene SlowdownButton is missing');
  const slowdown = cloneExternalNodeSubtree(juggleSource, objects, sourceSlowdownId, 'foodDeliverySlowdown');
  const slowdownNode = objects[slowdown.rootId];
  slowdownNode._parent = ref(gameplay);
  slowdownNode._lpos = vec(-280, -570, 0);
  objects[gameplay]._children.push(ref(slowdown.rootId));
  const slowdownButton = componentId(objects, slowdown.rootId, 'cc.Button');
  const slowdownBadge = directChildId(objects, slowdown.rootId, 'AdBadge');
  objects[slowdownBadge]._name = 'SlowdownAdBadge';

  const chanceLabel = author.label('ChanceLabel', gameplay, '机会 ×3', {
    x: 185, y: 574, w: 220, h: 58, size: 34,
    color: rgba(255, 255, 255), outlineColor: rgba(42, 41, 38), outlineWidth: 4,
  });

  // Keep the result hierarchy visible while authoring. resetRound() hides it
  // during onLoad, so this does not flash on the first rendered frame.
  const resultOverlay = author.node('ResultOverlay', canvas, { w: 750, h: 1624, active: true });
  author.component(resultOverlay, 'cc.BlockInputEvents');
  const mask = author.sprite('Mask', resultOverlay, frameUuid('white.png'), {
    w: 750, h: 1624, color: rgba(0, 0, 0),
  });
  author.widget(mask, 45);
  const maskOpacity = author.opacity(mask);
  objects[maskOpacity]._opacity = 200;
  const panel = author.node('ResultPanel', resultOverlay, { y: 0, w: 750, h: 1624 });
  author.widget(panel, 45);
  author.label('ResultGameTitle', panel, '外卖精准投送', {
    y: 318, w: 540, h: 68, size: 45,
    color: rgba(255, 232, 190), outlineColor: rgba(38, 28, 20), outlineWidth: 4,
  });
  author.sprite('ResultDivider', panel, frameUuid('white.png'), {
    y: 180, w: 360, h: 4, color: rgba(255, 226, 113, 210),
  });
  const successTitle = author.label('SuccessTitle', panel, '挑战成功', {
    y: 238, w: 500, h: 84, size: 56,
    color: rgba(255, 255, 255), outlineColor: rgba(38, 28, 20), outlineWidth: 4,
  });
  const failureTitle = author.label('FailureTitle', panel, '挑战失败', {
    y: 238, w: 500, h: 84, size: 56, active: false,
    color: rgba(255, 255, 255), outlineColor: rgba(38, 28, 20), outlineWidth: 4,
  });
  const successContent = author.node('SuccessContent', panel, { y: 60, w: 560, h: 180 });
  author.label('SuccessMessage', successContent,
    '五份外卖全部送达！\n本次送达：5份', {
      w: 540, h: 130, size: 32, lineHeight: 44, wrap: true,
      color: rgba(255, 255, 255), outlineColor: rgba(38, 28, 20), outlineWidth: 3,
    });
  const failureContent = author.node('FailureContent', panel, { y: 60, w: 560, h: 180, active: false });
  author.label('FailureMessage', failureContent,
    '外卖掉落了，再试一次吧\n本次送达：0份', {
      w: 540, h: 130, size: 32, lineHeight: 44, wrap: true,
      color: rgba(255, 255, 255), outlineColor: rgba(38, 28, 20), outlineWidth: 3,
    });
  const homeButton = actionButton(author, panel, 'HomeButton', '返回主页', 0, -205, 360);
  const retryButton = actionButton(author, panel, 'RetryButton', '重新开始', 0, -325, 360);
  const nextButton = actionButton(author, panel, 'NextButton', '下一轮', 0, -325, 360);

  author.component(canvas, SCRIPT_TYPE, {
    rotationSpeed: 480,
    slowdownRatio: 0.72,
    initialChances: 3,
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
    successContent: ref(successContent),
    failureContent: ref(failureContent),
    successTitle: ref(successTitle.node),
    failureTitle: ref(failureTitle.node),
    chanceLabel: ref(chanceLabel.component),
    targets: targets.map(ref),
    orderSprites: orderSprites.map(ref),
    checks: checks.map(ref),
    stars: starOn.map(ref),
    pendingFoods: pendingFoods.map(ref),
    flyingFoods: flyingFoods.map(ref),
    aimDots: aimDots.map(ref),
    backButton: ref(backButton),
    slowdownButton: ref(slowdownButton),
    homeButton: ref(homeButton),
    retryButton: ref(retryButton),
    nextButton: ref(nextButton),
  });

  objects[1]._globals = ref(appendSceneGlobals(source, objects));
  fitFeedResultOverlay(objects, 'FoodDeliveryFeedGameScene');
  return objects;
}

function componentId(objects, nodeId, type) {
  return objects[nodeId]._components
    .map(item => item.__id__)
    .find(id => objects[id]?.__type__ === type);
}

function directChildId(objects, parentId, name) {
  return objects[parentId]._children
    .map(item => item.__id__)
    .find(id => objects[id]?._name === name);
}

function collectNodeSubtree(objects, rootId, result = []) {
  result.push(rootId);
  for (const component of objects[rootId]._components || []) result.push(component.__id__);
  for (const child of objects[rootId]._children || []) {
    collectNodeSubtree(objects, child.__id__, result);
  }
  return result;
}

function remapReferences(value, idMap) {
  if (Array.isArray(value)) {
    for (const item of value) remapReferences(item, idMap);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Number.isInteger(value.__id__) && idMap.has(value.__id__)) {
    value.__id__ = idMap.get(value.__id__);
  }
  for (const item of Object.values(value)) remapReferences(item, idMap);
}

function cloneNodeSubtree(objects, rootId, idPrefix = 'foodDelivery') {
  const sourceIds = collectNodeSubtree(objects, rootId);
  const idMap = new Map(sourceIds.map((id, offset) => [id, objects.length + offset]));
  for (const sourceId of sourceIds) {
    const clone = structuredClone(objects[sourceId]);
    remapReferences(clone, idMap);
    if (typeof clone._id === 'string') {
      clone._id = `${idPrefix}_${idMap.get(sourceId)}`;
    }
    objects.push(clone);
  }
  return { rootId: idMap.get(rootId), idMap };
}

function cloneExternalNodeSubtree(sourceObjects, targetObjects, rootId, idPrefix) {
  const sourceIds = collectNodeSubtree(sourceObjects, rootId);
  const idMap = new Map(sourceIds.map((id, offset) => [id, targetObjects.length + offset]));
  for (const sourceId of sourceIds) {
    const clone = structuredClone(sourceObjects[sourceId]);
    remapReferences(clone, idMap);
    if (typeof clone._id === 'string') clone._id = `${idPrefix}_${idMap.get(sourceId)}`;
    targetObjects.push(clone);
  }
  return { rootId: idMap.get(rootId), idMap };
}

function setSpriteFrame(objects, nodeId, uuid) {
  const sprite = objects[componentId(objects, nodeId, 'cc.Sprite')];
  sprite._spriteFrame = {
    __uuid__: uuid,
    __expectedType__: 'cc.SpriteFrame',
  };
}

function configureSprite(objects, nodeId, { name, parentId, frame, x, y, width, height }) {
  const node = objects[nodeId];
  node._name = name;
  node._parent = ref(parentId);
  node._lpos = vec(x, y, 0);
  node._children = [];
  const transform = objects[componentId(objects, nodeId, 'cc.UITransform')];
  transform._contentSize.width = width;
  transform._contentSize.height = height;
  setSpriteFrame(objects, nodeId, frame);
}

/**
 * Precisely appends the serialized homepage entry without rebuilding or
 * reordering any user-authored lobby objects.
 */
export function appendFoodDeliveryCard(objects) {
  const canvasId = objects.findIndex(item => item?.__type__ === 'cc.Node' && item._name === 'Canvas');
  const gameListId = directChildId(objects, canvasId, 'GameList');
  const viewId = directChildId(objects, gameListId, 'View');
  const contentId = directChildId(objects, viewId, 'Content');
  if ([canvasId, gameListId, viewId, contentId].some(id => !Number.isInteger(id) || id < 0)) {
    throw new Error('NewMainScene Canvas/GameList/View/Content hierarchy is incomplete');
  }

  const controller = objects.find(item =>
    item?.node?.__id__ === canvasId && item?.puzzleButton && item?.balloonWheelButton && item?.gameList);
  if (!controller) throw new Error('NewMainScene controller is missing');

  const content = objects[contentId];
  const existingCardId = content._children
    .map(item => item.__id__)
    .find(id => objects[id]?._name === 'FoodDeliveryCard');
  if (Number.isInteger(existingCardId)) {
    const titlePlaqueId = directChildId(objects, existingCardId, 'TitlePlaque');
    setSpriteFrame(objects, titlePlaqueId, FOOD_DELIVERY_TITLE_FRAME);
    objects[titlePlaqueId]._children = [];
    const existingButtonId = componentId(objects, existingCardId, 'cc.Button');
    controller.foodDeliveryButton = ref(existingButtonId);
    return existingButtonId;
  }

  const sourceCardId = content._children
    .map(item => item.__id__)
    .find(id => objects[id]?._name === 'PuzzleGameCard');
  if (!Number.isInteger(sourceCardId)) throw new Error('NewMainScene source card is missing');

  const sourceArtworkMaskId = directChildId(objects, sourceCardId, 'ArtworkMask');
  const sourceArtworkId = directChildId(objects, sourceArtworkMaskId, 'Artwork');

  const index = content._children.length;
  const { rootId: cardId } = cloneNodeSubtree(objects, sourceCardId, 'foodDeliveryCard');
  const card = objects[cardId];
  card._name = 'FoodDeliveryCard';
  card._parent = ref(contentId);
  card._lpos = vec(index % 2 === 0 ? -139 : 139, -152 - Math.floor(index / 2) * 294, 0);
  content._children.push(ref(cardId));

  const buttonId = componentId(objects, cardId, 'cc.Button');
  const button = objects[buttonId];
  button.clickEvents = [];
  button._clickEvents = [];

  const artworkMaskId = directChildId(objects, cardId, 'ArtworkMask');
  const artworkId = directChildId(objects, artworkMaskId, 'Artwork');
  configureSprite(objects, artworkId, {
    name: 'Artwork', parentId: artworkMaskId,
    frame: frameUuid('background.jpg'), x: 0, y: 0, width: 202, height: 164,
  });

  const courier = cloneNodeSubtree(objects, sourceArtworkId, 'foodDeliveryCourier');
  configureSprite(objects, courier.rootId, {
    name: 'CourierPreview', parentId: artworkMaskId,
    frame: frameUuid('courier.png'), x: -46, y: -16, width: 96, height: 101,
  });
  objects[artworkMaskId]._children.push(ref(courier.rootId));

  const order = cloneNodeSubtree(objects, sourceArtworkId, 'foodDeliveryOrder');
  configureSprite(objects, order.rootId, {
    name: 'OrderPreview', parentId: artworkMaskId,
    frame: frameUuid('order.png'), x: 63, y: 34, width: 58, height: 51,
  });
  objects[artworkMaskId]._children.push(ref(order.rootId));

  const titlePlaqueId = directChildId(objects, cardId, 'TitlePlaque');
  setSpriteFrame(objects, titlePlaqueId, FOOD_DELIVERY_TITLE_FRAME);
  objects[titlePlaqueId]._children = [];

  const contentTransform = objects[componentId(objects, contentId, 'cc.UITransform')];
  const rowCount = Math.ceil((index + 1) / 2);
  contentTransform._contentSize.height = 18 + rowCount * 268 + (rowCount - 1) * 26 + 14;
  controller.foodDeliveryButton = ref(buttonId);
  return buttonId;
}
