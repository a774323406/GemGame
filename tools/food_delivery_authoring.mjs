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
  const captionDonorId = objects.findIndex(item =>
    item?.__type__ === 'cc.Node' && item._name === 'Caption' &&
    Number.isInteger(componentId(objects, objects.indexOf(item), 'cc.Label')));

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
    frame: frameUuid('courier.png'), x: -42, y: -30, width: 112, height: 75,
  });
  objects[artworkMaskId]._children.push(ref(courier.rootId));

  const order = cloneNodeSubtree(objects, sourceArtworkId, 'foodDeliveryOrder');
  configureSprite(objects, order.rootId, {
    name: 'OrderPreview', parentId: artworkMaskId,
    frame: frameUuid('order.png'), x: 63, y: 34, width: 58, height: 51,
  });
  objects[artworkMaskId]._children.push(ref(order.rootId));

  const titlePlaqueId = directChildId(objects, cardId, 'TitlePlaque');
  setSpriteFrame(objects, titlePlaqueId, 'e625bd7b-cbf1-4b43-9552-b13edb0bc4f4@f9941');
  const gameName = cloneNodeSubtree(objects, captionDonorId, 'foodDeliveryTitle');
  const gameNameNode = objects[gameName.rootId];
  gameNameNode._name = 'GameName';
  gameNameNode._parent = ref(titlePlaqueId);
  gameNameNode._children = [];
  gameNameNode._lpos = vec(0, 0, 0);
  const titleTransform = objects[componentId(objects, gameName.rootId, 'cc.UITransform')];
  titleTransform._contentSize.width = 204;
  titleTransform._contentSize.height = 42;
  const titleLabel = objects[componentId(objects, gameName.rootId, 'cc.Label')];
  titleLabel._string = '外卖精准投送';
  titleLabel._fontSize = 27;
  titleLabel._lineHeight = 42;
  titleLabel._horizontalAlign = 1;
  titleLabel._verticalAlign = 1;
  titleLabel._color = rgba(255, 251, 241);
  titleLabel._enableOutline = true;
  titleLabel._outlineColor = rgba(105, 55, 28);
  titleLabel._outlineWidth = 4;
  const titleOutlineId = componentId(objects, gameName.rootId, 'cc.LabelOutline');
  if (Number.isInteger(titleOutlineId)) {
    objects[titleOutlineId]._color = rgba(105, 55, 28);
    objects[titleOutlineId]._width = 4;
  }
  objects[titlePlaqueId]._children.push(ref(gameName.rootId));

  const contentTransform = objects[componentId(objects, contentId, 'cc.UITransform')];
  const rowCount = Math.ceil((index + 1) / 2);
  contentTransform._contentSize.height = 18 + rowCount * 268 + (rowCount - 1) * 26 + 14;
  controller.foodDeliveryButton = ref(buttonId);
  return buttonId;
}
