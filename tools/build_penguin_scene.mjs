import fs from 'node:fs';
import {
  SceneAuthor,
  assetUuid,
  SCENE_UUID,
  SCRIPT_UUID,
  compressUuid,
  ref,
  rgba,
  vec,
} from './penguin_scene_authoring.mjs';
import { appendSceneGlobals, fitFeedResultOverlay } from './feed_result_layout.mjs';

const SCENE = 'assets/gamescene/PenguinStackFeedGameScene.scene';
const metadata = (importer, uuid, ver, files = []) => ({
  ver, importer, imported: true, uuid, files, subMetas: {}, userData: {},
});
const frame = name => assetUuid(name) + '@f9941';
const existing = file => JSON.parse(fs.readFileSync(file + '.meta', 'utf8')).uuid + '@f9941';

const art = {
  background: frame('background.jpg'),
  penguin: frame('penguin.png'),
  whale: frame('whale.png'),
  failCat: frame('fail-cat.png'),
  successCat: frame('success-cat.png'),
  title: frame('title-plaque.png'),
  goal: frame('goal-plaque.png'),
  lives: frame('lives-plaque.png'),
  heart: frame('heart.png'),
  reward: frame('reward-button.png'),
  videoBadge: frame('video-badge.png'),
  stageOne: frame('stage-one.png'),
  stageTwo: frame('stage-two.png'),
  slow: frame('slow-icon.png'),
  surge: frame('surge-banner.png'),
  result: frame('result-panel.png'),
  blue: frame('action-blue.png'),
  green: frame('action-green.png'),
  orange: frame('action-orange.png'),
  purple: frame('action-purple.png'),
  back: existing('assets/res/juggleBallGame/back-button.png'),
  dim: existing('assets/res/shootingGlassBottles/dim.png'),
};

const source = JSON.parse(fs.readFileSync('assets/gamescene/PenRefillFeedGameScene.scene', 'utf8'));
const a = new SceneAuthor();
const o = a.objects;

a.add({ __type__: 'cc.SceneAsset', _name: 'PenguinStackFeedGameScene', _objFlags: 0,
  __editorExtras__: {}, _native: '', scene: ref(1) });
a.add({ __type__: 'cc.Scene', _name: 'PenguinStackFeedGameScene', _objFlags: 0,
  __editorExtras__: {}, _parent: null, _children: [], _active: true, _components: [], _prefab: null,
  _lpos: vec(), _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 }, _lscale: vec(1, 1, 1),
  _mobility: 0, _layer: 1073741824, _euler: vec(), autoReleaseAssets: false, _globals: null,
  _id: SCENE_UUID });

const canvas = a.node('Canvas', 1, { x: 375, y: 667, w: 750, h: 1334 });
const camera = a.node('Camera', canvas, { z: 1000, w: 1, h: 1 });
o[camera]._layer = 1073741824;
const cameraTemplate = structuredClone(source.find(item => item.__type__ === 'cc.Camera'));
delete cameraTemplate.node;
delete cameraTemplate._id;
const cameraComponent = a.component(camera, 'cc.Camera', { ...cameraTemplate, _orthoHeight: 667 });
a.component(canvas, 'cc.Canvas', { _cameraComponent: ref(cameraComponent), _alignCanvasWithScreen: true });
a.widget(canvas, 45);

const background = a.sprite('SunsetSeaBackground', canvas, art.background, { w: 750, h: 1334 });
a.widget(background, 45);

// Header closely follows the reference: title plaque, three hearts, wood objective, then 1—2 stage markers.
const header = a.node('TopHUD', canvas, { y: 667, w: 750, h: 250, ay: 1 });
a.widget(header, 17, { _top: 88 });
const titlePlaque = a.sprite('TitlePlaque', header, art.title, { y: -52, w: 540, h: 118 });
a.label('TitleLabel', titlePlaque, '第1关  叠叠乐挑战', {
  w: 510, h: 72, size: 41, outlineWidth: 4, color: rgba(255, 250, 237),
});
const backNode = a.sprite('BackButton', header, art.back, { x: -320, y: -50, w: 76, h: 76 });
const backButton = a.button(backNode);

const heartsRoot = a.node('Lives', header, { y: -111, w: 210, h: 58 });
a.sprite('LivesBacking', heartsRoot, art.lives, { w: 184, h: 58 });
const hearts = [-54, 0, 54].map((x, index) =>
  a.sprite(`Heart${index + 1}`, heartsRoot, art.heart, { x, w: 49, h: 45 }));

const goalPlaque = a.sprite('GoalPlaque', header, art.goal, { y: -172, w: 350, h: 58 });
const goalLabel = a.label('GoalLabel', goalPlaque, '用鲸鱼接住10只企鹅', {
  w: 330, h: 43, size: 25, outlineWidth: 2, color: rgba(255, 250, 228),
});
const stageRoot = a.node('StageProgress', header, { y: -228, w: 170, h: 48 });
const stageOneDot = a.sprite('StageOneDot', stageRoot, art.stageOne, { x: -42, w: 42, h: 42 });
const stageOne = a.label('StageOne', stageOneDot, '1', {
  w: 36, h: 36, size: 24, color: rgba(255), outlineWidth: 2,
});
a.label('StageDash', stageRoot, '—', { w: 55, h: 37, size: 23, color: rgba(80, 76, 80), outlineWidth: 1 });
const stageTwoDot = a.sprite('StageTwoDot', stageRoot, art.stageTwo, { x: 42, w: 42, h: 42 });
const stageTwo = a.label('StageTwo', stageTwoDot, '2', {
  w: 36, h: 36, size: 24, color: rgba(255), outlineWidth: 2,
});

const playfield = a.node('Playfield', canvas, { w: 750, h: 1334 });
const caughtLabel = a.label('CaughtLabel', playfield, '已接住0只企鹅', {
  x: 205, y: 350, w: 285, h: 54, size: 30, align: 2,
  color: rgba(255), outlineColor: rgba(41, 32, 28), outlineWidth: 4,
});
const guide = a.label('MoveGuide', playfield, '左右滑动开始游戏', {
  y: 235, w: 540, h: 62, size: 36, color: rgba(255), outlineColor: rgba(30, 24, 24), outlineWidth: 5,
});
const feedback = a.label('CatchFeedback', playfield, '完美！', {
  y: -102, w: 420, h: 68, size: 36, active: false, outlineWidth: 3,
});
a.opacity(feedback.node);

// Falling penguins and visible stack are pre-authored pools, so no runtime Node/UI creation is required.
const falling = Array.from({ length: 7 }, (_, index) =>
  a.sprite(`FallingPenguin${index + 1}`, playfield, art.penguin, {
    y: 390, w: 196, h: 98, active: index < 3,
  }));
const whale = a.sprite('WhaleCatcher', playfield, art.whale, { y: -455, w: 440, h: 220 });
const tower = a.node('TowerRoot', playfield, { y: -375, w: 280, h: 650, ay: 0 });
const stack = Array.from({ length: 10 }, (_, index) =>
  a.sprite(`StackPenguin${index + 1}`, tower, art.penguin, {
    y: 28 + index * 52, w: 188, h: 94, active: false,
  }));

const bottom = a.node('BottomHUD', canvas, { y: -667, w: 750, h: 190, ay: 0 });
a.widget(bottom, 20, { _bottom: 4 });
function rewardButton(name, x, caption, icon, iconSize) {
  const node = a.sprite(name, bottom, art.reward, { x, y: 76, w: 128, h: 128 });
  a.sprite('RewardIcon', node, icon, { y: 14, w: iconSize[0], h: iconSize[1] });
  a.label('Caption', node, caption, { y: -42, w: 118, h: 38, size: 25, outlineWidth: 3 });
  a.sprite('VideoBadge', node, art.videoBadge, { x: 48, y: 50, w: 45, h: 32 });
  return a.button(node);
}
const lifeButton = rewardButton('AddLifeButton', -100, '加血', art.heart, [63, 58]);
const slowButton = rewardButton('SlowDownButton', 100, '降速', art.slow, [68, 68]);

const surgeOverlay = a.node('SurgeOverlay', canvas, { w: 750, h: 1334, active: false });
a.component(surgeOverlay, 'cc.BlockInputEvents');
const surgePanel = a.sprite('SurgePanel', surgeOverlay, art.surge, { y: 30, w: 448, h: 162 });
a.opacity(surgePanel);
a.label('SurgeTitle', surgePanel, '难度飙升', {
  y: 3, w: 390, h: 74, size: 48, color: rgba(209, 73, 69),
  outlineColor: rgba(103, 60, 38), outlineWidth: 4,
});

const resultOverlay = a.node('ResultOverlay', canvas, { w: 750, h: 1334, active: false });
a.component(resultOverlay, 'cc.BlockInputEvents');
const dim = a.sprite('DimBackground', resultOverlay, art.dim, { w: 750, h: 1334, color: rgba(0, 0, 0, 185) });
const resultPanel = a.sprite('ResultPanel', resultOverlay, art.result, {
  y: 20, w: 650, h: 650, sx: 0.86,
});
a.opacity(resultPanel);
const resultTitle = a.label('ResultTitle', resultPanel, '失败', {
  y: 222, w: 520, h: 84, size: 58, color: rgba(79, 70, 103), outline: false,
});
const resultDetail = a.label('ResultDetail', resultPanel, '左右滑动接住动物\n本局接住 0 只企鹅', {
  y: 138, w: 520, h: 76, size: 27, lineHeight: 34, wrap: true,
  color: rgba(232, 136, 52), outline: false,
});
const successCat = a.sprite('SuccessCat', resultPanel, art.successCat, { y: 5, w: 330, h: 220 });
const failCat = a.sprite('FailCat', resultPanel, art.failCat, { y: -1, w: 360, h: 180, active: false });

function resultButton(name, label, x, y, sprite, width = 270) {
  const node = a.sprite(name, resultPanel, sprite, { x, y, w: width, h: 84 });
  a.label('Caption', node, label, { w: width - 24, h: 55, size: 31, outlineWidth: 3 });
  return { node, button: a.button(node) };
}
const retry = resultButton('RetryButton', '再来一局', -146, -205, art.blue, 270);
const next = resultButton('NextButton', '下一关', 146, -205, art.green, 270);
const revive = resultButton('ReviveButton', '复活', 146, -205, art.orange, 270);
a.sprite('VideoBadge', revive.node, art.videoBadge, { x: -76, w: 48, h: 34 });
const share = resultButton('ShareButton', '喊人', 0, -292, art.purple, 250);

a.component(canvas, compressUuid(SCRIPT_UUID), {
  stageOneTarget: 10,
  finalTarget: 200,
  initialLives: 3,
  stageOneFallSpeed: 310,
  stageTwoFallSpeed: 440,
  stageOneSpawnInterval: 0.72,
  stageTwoSpawnInterval: 0.34,
  sceneBackground: ref(background),
  playfield: ref(playfield),
  whale: ref(whale),
  towerRoot: ref(tower),
  stackPenguins: stack.map(ref),
  fallingPenguins: falling.map(ref),
  heartNodes: hearts.map(ref),
  goalLabel: ref(goalLabel.component),
  caughtLabel: ref(caughtLabel.component),
  stageOneLabel: ref(stageOne.component),
  stageTwoLabel: ref(stageTwo.component),
  guideNode: ref(guide.node),
  feedbackLabel: ref(feedback.component),
  backButton: ref(backButton),
  lifeButton: ref(lifeButton),
  slowButton: ref(slowButton),
  surgeOverlay: ref(surgeOverlay),
  surgePanel: ref(surgePanel),
  resultOverlay: ref(resultOverlay),
  resultPanel: ref(resultPanel),
  resultTitle: ref(resultTitle.component),
  resultDetail: ref(resultDetail.component),
  successCat: ref(successCat),
  failCat: ref(failCat),
  retryButton: ref(retry.button),
  nextButton: ref(next.button),
  reviveButton: ref(revive.button),
  shareButton: ref(share.button),
});

o[1]._globals = ref(appendSceneGlobals(source, o));
fitFeedResultOverlay(o, 'PenguinStackFeedGameScene');

function addMainEntry() {
  const file = 'assets/gamescene/MainScene.scene';
  const main = JSON.parse(fs.readFileSync(file, 'utf8'));
  const controller = main.find(item => Object.hasOwn(item, 'startBtn'));
  if (!controller) throw new Error('mainScene controller is missing');
  if (controller.penguinStackGameBtn) return;
  const canvasId = main.findIndex(item => item.__type__ === 'cc.Node' && item._name === 'Canvas');
  const b = new SceneAuthor(main, 'penguinEntry');
  const entry = b.node('penguinStackGameBtn', canvasId, { x: 306, y: -395, w: 140, h: 174 });
  b.sprite('WhaleIcon', entry, art.whale, { y: 2, w: 135, h: 68 });
  b.sprite('PenguinIcon1', entry, art.penguin, { x: -3, y: 49, w: 68, h: 34 });
  b.sprite('PenguinIcon2', entry, art.penguin, { x: 2, y: 78, w: 64, h: 32 });
  b.label('Label', entry, '叠企鹅', { y: -65, w: 140, h: 47, size: 30, outlineWidth: 3 });
  controller.penguinStackGameBtn = ref(b.button(entry));
  fs.writeFileSync(file, JSON.stringify(main, null, 2) + '\n');
}

if (process.argv.includes('--write')) {
  if (fs.existsSync(SCENE) && !process.argv.includes('--replace-scene')) {
    throw new Error('Scene already exists. Use --replace-scene only for intentional regeneration.');
  }
  fs.writeFileSync(SCENE, JSON.stringify(o, null, 2) + '\n');
  const metas = [
    [SCENE + '.meta', metadata('scene', SCENE_UUID, '1.1.50', ['.json'])],
    ['assets/scripts/penguinStackFeedGameScene.ts.meta', metadata('typescript', SCRIPT_UUID, '4.0.24')],
    ['assets/scripts/penguinStackRules.ts.meta', metadata('typescript', assetUuid('penguinStackRules.ts'), '4.0.24')],
  ];
  for (const [file, data] of metas) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  }
  addMainEntry();
}

if (process.argv.includes('--add-main-entry')) addMainEntry();

console.log(JSON.stringify({ scene: SCENE, sceneUuid: SCENE_UUID, scriptUuid: SCRIPT_UUID,
  objects: o.length, wrote: process.argv.includes('--write') }));
