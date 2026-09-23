// Offline serialized-scene authoring only. Runtime never constructs fixed UI.
import fs from 'node:fs';
import {
  SceneAuthor,
  compressUuid,
  ref,
  rgba,
  vec,
} from './penguin_scene_authoring.mjs';
import { appendSceneGlobals, fitFeedResultOverlay } from './feed_result_layout.mjs';
import { assetUuid } from './white_goose_asset_meta.mjs';

export const SCENE_UUID = 'ba4c8390-ece1-56f3-ae54-585950e78599';
export const SCRIPT_UUID = '9568dc4d-abc9-546a-a260-99505dd98397';
export const SCRIPT_TYPE = compressUuid(SCRIPT_UUID);

const BUTTON_SOUND_TYPE = '7a1a5iVpkNPsYcjs1PU1SS/';
const frameUuid = name => `${assetUuid(name)}@f9941`;
const existingFrame = file => {
  const meta = JSON.parse(fs.readFileSync(`${file}.meta`, 'utf8'));
  return `${meta.uuid}@f9941`;
};
const SHARED_ACTION_BUTTON_FRAME = existingFrame('assets/res/penguinStackFeed/action-orange.png');

function makeSceneRoot(author) {
  author.add({
    __type__: 'cc.SceneAsset',
    _name: 'WhiteGooseFeedGameScene',
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    scene: ref(1),
  });
  author.add({
    __type__: 'cc.Scene',
    _name: 'WhiteGooseFeedGameScene',
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

function addButtonSound(author, node) {
  author.component(node, BUTTON_SOUND_TYPE, {
    enableClickSound: true,
    onlyPlayWhenInteractable: true,
  });
}

function button(author, node) {
  const component = author.button(node);
  addButtonSound(author, node);
  return component;
}

function skeleton(author, node, skeletonDataUuid, animation, loop = true) {
  return author.component(node, 'sp.Skeleton', {
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: rgba(255, 255, 255),
    _skeletonData: { __uuid__: skeletonDataUuid, __expectedType__: 'sp.SkeletonData' },
    defaultSkin: 'default',
    defaultAnimation: animation,
    _premultipliedAlpha: false,
    _timeScale: 1,
    _preCacheMode: 2,
    _cacheMode: 2,
    _sockets: [],
    _useTint: false,
    _debugMesh: false,
    _debugBones: false,
    _debugSlots: false,
    _enableBatch: false,
    loop,
  });
}

function actionButton(author, parent, name, caption, x, y, width = 360) {
  const node = author.sprite(name, parent, SHARED_ACTION_BUTTON_FRAME, {
    x, y, w: width, h: 112,
  });
  author.label('Caption', node, caption, {
    w: width - 24, h: 62, size: 34,
    color: rgba(255, 255, 255),
    outlineColor: rgba(117, 57, 20), outlineWidth: 3,
  });
  return button(author, node);
}

function statPanel(author, parent, name, x, text) {
  const panel = author.sprite(name, parent, existingFrame('assets/res/foodDeliveryFeed/white.png'), {
    x, y: -45, w: 220, h: 74, color: rgba(110, 62, 31, 225),
  });
  const label = author.label('Label', panel, text, {
    w: 204, h: 58, size: 28,
    color: rgba(255, 249, 220), outlineColor: rgba(63, 31, 17), outlineWidth: 3,
  });
  return label.component;
}

export function buildWhiteGooseScene() {
  const source = JSON.parse(fs.readFileSync('assets/gamescene/ArcheryGameScene.scene', 'utf8'));
  const author = new SceneAuthor([], 'whiteGoose');
  const objects = author.objects;
  makeSceneRoot(author);

  const canvas = author.node('Canvas', 1, { x: 375, y: 812, w: 750, h: 1624 });
  const camera = author.node('Camera', canvas, { z: 1000, w: 1, h: 1 });
  objects[camera]._layer = 1073741824;
  const cameraTemplate = structuredClone(source.find(item => item.__type__ === 'cc.Camera'));
  delete cameraTemplate.node;
  delete cameraTemplate._id;
  const cameraComponent = author.component(camera, 'cc.Camera', { ...cameraTemplate, _orthoHeight: 812 });
  author.component(canvas, 'cc.Canvas', {
    _cameraComponent: ref(cameraComponent),
    _alignCanvasWithScreen: true,
  });
  author.widget(canvas, 45);

  const background = author.sprite('Background', canvas, frameUuid('ditu.jpg'), {
    w: 1800 * (720 / 1680), h: 1800,
  });
  const fieldTouchArea = author.node('FieldTouchArea', canvas, { y: -55, w: 750, h: 1330 });
  const gameplay = author.node('GameplayRoot', canvas, { w: 750, h: 1624 });
  const gooseSlots = author.node('GooseSlots', gameplay, { w: 750, h: 1180 });
  const sourcePositions = [
    [-262, 155], [26, 90], [179, 25], [266, -40], [72, -105],
    [-84, -170], [-280, -235], [-4, -300], [210, -365], [-266, -430],
  ];
  const gooseSlotNodes = [];
  const gooseSkeletons = [];
  const gooseHitAreas = [];
  for (let index = 0; index < sourcePositions.length; index += 1) {
    const [sourceX, y] = sourcePositions[index];
    const slot = author.node(`GooseSlot${index}`, gooseSlots, {
      x: sourceX * (750 / 720), y, w: 220, h: 280,
    });
    author.sprite('Shadow', slot, frameUuid('goose-shadow.png'), {
      y: 0, w: 135, h: 63,
    });
    const goose = author.node('GooseSkeleton', slot, { y: 0, w: 220, h: 270 });
    const gooseSkeleton = skeleton(author, goose, assetUuid('taodae.json'), 'zou', true);
    const hitArea = author.node('HitArea', slot, { y: 72, w: 164, h: 238 });
    gooseSlotNodes.push(slot);
    gooseSkeletons.push(gooseSkeleton);
    gooseHitAreas.push(hitArea);
  }

  const thrownRingLayer = author.node('ThrownRingLayer', gameplay, { w: 750, h: 1624 });
  const foreground = author.sprite('Foreground', gameplay, frameUuid('ditulang.png'), {
    y: -654, w: 750, h: 329,
  });
  const throwingHand = author.node('ThrowingHand', gameplay, {
    x: -104, y: -676, w: 403, h: 272,
  });
  const handSkeleton = skeleton(author, throwingHand, assetUuid('taoquanshou.json'), 'idle', true);

  const ringTemplateRoot = author.node('RingTemplates', canvas, {
    y: -1000, w: 1, h: 1, active: false,
  });
  const ringTemplates = [];
  const ringNames = [
    ['blue', 'ring-blue-bottom.png', 'ring-blue-top.png'],
    ['yellow', 'ring-yellow-bottom.png', 'ring-yellow-top.png'],
    ['red', 'ring-red-bottom.png', 'ring-red-top.png'],
  ];
  for (const [colorName, bottomFrame, topFrame] of ringNames) {
    const ring = author.node(`RingTemplate-${colorName}`, ringTemplateRoot, { w: 184, h: 117 });
    author.sprite('Bottom', ring, frameUuid(bottomFrame), { w: 184, h: 117 });
    author.sprite('Top', ring, frameUuid(topFrame), { w: 184, h: 117 });
    ringTemplates.push(ring);
  }

  const safeArea = author.node('SafeArea', canvas, { y: 812, w: 750, h: 230, ay: 1 });
  author.widget(safeArea, 17, { _top: 64 });
  const backNode = author.sprite('BackButton', safeArea, existingFrame('assets/res/foodDeliveryFeed/back.png'), {
    x: -321, y: -48, w: 76, h: 76,
  });
  const backButton = button(author, backNode);
  author.label('Title', safeArea, '套大鹅', {
    y: -48, w: 330, h: 76, size: 48,
    color: rgba(255, 247, 209), outlineColor: rgba(80, 43, 24), outlineWidth: 5,
  });
  const caughtLabel = statPanel(author, safeArea, 'CaughtPanel', -130, '已套中 0/7');
  const ringLabel = statPanel(author, safeArea, 'RingPanel', 108, '套圈 10/10');
  const addRingsNode = author.sprite('AddRingsButton', safeArea, existingFrame('assets/res/foodDeliveryFeed/orange-button.png'), {
    x: 292, y: -125, w: 178, h: 64,
  });
  author.sprite('AdBadge', addRingsNode, existingFrame('assets/res/texture/UIs/ad_badge_cartoon_red.png'), {
    x: -62, w: 44, h: 44,
  });
  author.label('Caption', addRingsNode, '+5套圈', {
    x: 18, w: 118, h: 46, size: 25,
    color: rgba(255, 255, 255), outlineColor: rgba(113, 58, 24), outlineWidth: 3,
  });
  const addRingsButton = button(author, addRingsNode);

  // Keep the result hierarchy visible while authoring. resetRound() hides it
  // during onLoad, so the first rendered frame remains gameplay-only.
  const resultOverlay = author.node('ResultOverlay', canvas, { w: 750, h: 1624, active: true });
  author.component(resultOverlay, 'cc.BlockInputEvents');
  const resultDim = author.sprite('Mask', resultOverlay, existingFrame('assets/res/foodDeliveryFeed/white.png'), {
    w: 750, h: 1624, color: rgba(0, 0, 0),
  });
  author.widget(resultDim, 45);
  const resultDimOpacity = author.opacity(resultDim);
  objects[resultDimOpacity]._opacity = 200;
  const resultPanel = author.node('ResultPanel', resultOverlay, {
    w: 750, h: 1624,
  });
  author.widget(resultPanel, 45);
  author.label('ResultGameTitle', resultPanel, '套大鹅', {
    y: 318, w: 540, h: 68, size: 45,
    color: rgba(255, 232, 190), outlineColor: rgba(38, 28, 20), outlineWidth: 4,
  });
  author.sprite('ResultDivider', resultPanel, existingFrame('assets/res/foodDeliveryFeed/white.png'), {
    y: 180, w: 360, h: 4, color: rgba(255, 226, 113, 210),
  });
  const successTitle = author.label('SuccessTitle', resultPanel, '挑战成功', {
    y: 238, w: 500, h: 84, size: 56,
    color: rgba(255, 255, 255), outlineColor: rgba(38, 28, 20), outlineWidth: 4,
  });
  const failureTitle = author.label('FailureTitle', resultPanel, '挑战失败', {
    y: 238, w: 500, h: 84, size: 56, active: false,
    color: rgba(255, 255, 255), outlineColor: rgba(38, 28, 20), outlineWidth: 4,
  });
  const progressLabel = author.label('ProgressLabel', resultPanel, '已套中 0/7', {
    y: 88, w: 540, h: 58, size: 34,
    color: rgba(255, 255, 255), outlineColor: rgba(38, 28, 20), outlineWidth: 3,
  });
  const detailLabel = author.label('DetailLabel', resultPanel, '再来一局，看看能不能全部套中！', {
    y: 24, w: 540, h: 72, size: 29,
    color: rgba(255, 255, 255), outlineColor: rgba(38, 28, 20), outlineWidth: 3, wrap: true,
  });
  const homeButton = actionButton(author, resultPanel, 'HomeButton', '返回主页', 0, -205);
  const successActions = author.node('SuccessActions', resultPanel, { w: 560, h: 620 });
  const replayButton = actionButton(author, successActions, 'ReplayButton', '再玩一次', 0, -325);
  const failureActions = author.node('FailureActions', resultPanel, { w: 560, h: 620, active: false });
  const reviveNode = author.sprite('ReviveButton', failureActions, SHARED_ACTION_BUTTON_FRAME, {
    x: 0, y: -325, w: 360, h: 112,
  });
  author.sprite('AdBadge', reviveNode, existingFrame('assets/res/texture/UIs/ad_badge_cartoon_red.png'), {
    x: -126, w: 46, h: 46,
  });
  author.label('Caption', reviveNode, '加套圈', {
    x: 18, w: 248, h: 62, size: 34,
    color: rgba(255, 255, 255), outlineColor: rgba(117, 57, 20), outlineWidth: 3,
  });
  const reviveButton = button(author, reviveNode);
  const restartButton = actionButton(author, failureActions, 'RestartButton', '重新开始', 0, -445);

  author.component(canvas, SCRIPT_TYPE, {
    sceneBackground: ref(background),
    sceneBackButton: ref(backButton),
    sceneAddRingsButton: ref(addRingsButton),
    sceneCaughtLabel: ref(caughtLabel),
    sceneRingLabel: ref(ringLabel),
    sceneFieldTouchArea: ref(fieldTouchArea),
    sceneGooseSlots: ref(gooseSlots),
    sceneGooseSkeletons: gooseSkeletons.map(ref),
    sceneGooseHitAreas: gooseHitAreas.map(ref),
    sceneThrowingHand: ref(throwingHand),
    sceneHandSkeleton: ref(handSkeleton),
    sceneThrownRingLayer: ref(thrownRingLayer),
    sceneRingTemplates: ringTemplates.map(ref),
    sceneForeground: ref(foreground),
    sceneResultOverlay: ref(resultOverlay),
    sceneResultPanel: ref(resultPanel),
    sceneResultSuccessTitle: ref(successTitle.component),
    sceneResultFailureTitle: ref(failureTitle.component),
    sceneResultProgress: ref(progressLabel.component),
    sceneResultDetail: ref(detailLabel.component),
    sceneSuccessActions: ref(successActions),
    sceneFailureActions: ref(failureActions),
    sceneReplayButton: ref(replayButton),
    sceneRestartButton: ref(restartButton),
    sceneHomeButton: ref(homeButton),
    sceneReviveButton: ref(reviveButton),
  });

  objects[1]._globals = ref(appendSceneGlobals(source, objects));
  fitFeedResultOverlay(objects, 'WhiteGooseFeedGameScene');
  return objects;
}
