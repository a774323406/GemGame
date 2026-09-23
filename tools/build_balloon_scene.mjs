import fs from 'node:fs';
import { SceneAuthor, assetUuid, SCENE_UUID, SCRIPT_UUID, compressUuid, ref, vec, rgba } from './balloon_scene_authoring.mjs';
import { appendSceneGlobals, fitFeedResultOverlay } from './feed_result_layout.mjs';

const SCENE = 'assets/gamescene/BalloonWheelFeedGameScene.scene';
const metadata = (importer, uuid, ver, files = []) => ({ ver, importer, imported: true, uuid, files, subMetas: {}, userData: {} });
const frame = name => assetUuid(name) + '@f9941';
const existing = file => JSON.parse(fs.readFileSync(file + '.meta', 'utf8')).uuid + '@f9941';
const art = {
  back: existing('assets/res/texture/UIs/feed_back_button.png'),
  header: existing('assets/res/shootingGlassBottles/cartoonHeader.png'),
  wood: existing('assets/res/shootingGlassBottles/woodTitle.png'),
  panel: existing('assets/res/shootingGlassBottles/panel.png'),
  reward: existing('assets/res/shootingGlassBottles/rewardSquare.png'),
  bullet: existing('assets/res/shootingGlassBottles/bullet.png'),
  muzzle: existing('assets/res/shootingGlassBottles/muzzle.png'),
  ad: 'cf633ac8-e94b-4433-a837-05cc338157cd@f9941',
  dim: 'b900cef1-182a-4426-a80e-8a842d396eec@f9941',
  modal: existing('assets/res/shootingGlassBottles/cuteModal.png'),
  action: existing('assets/res/shootingGlassBottles/successButton.png'),
};
const source = JSON.parse(fs.readFileSync('assets/gamescene/ArcheryGameScene.scene', 'utf8'));
const a = new SceneAuthor(); const o = a.objects;
a.add({ __type__: 'cc.SceneAsset', _name: 'BalloonWheelFeedGameScene', _objFlags: 0, __editorExtras__: {}, _native: '', scene: ref(1) });
a.add({ __type__: 'cc.Scene', _name: 'BalloonWheelFeedGameScene', _objFlags: 0, __editorExtras__: {}, _parent: null,
  _children: [], _active: true, _components: [], _prefab: null, _lpos: vec(),
  _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 }, _lscale: vec(1, 1, 1), _mobility: 0,
  _layer: 1073741824, _euler: vec(), autoReleaseAssets: false, _globals: null, _id: SCENE_UUID });
const canvas = a.node('Canvas', 1, { x: 375, y: 667, w: 750, h: 1334 });
const camera = a.node('Camera', canvas, { z: 1000, w: 1, h: 1 });
o[camera]._layer = 1073741824;
const cameraTemplate = structuredClone(source.find(item => item.__type__ === 'cc.Camera'));
delete cameraTemplate.node; delete cameraTemplate._id;
const cameraComponent = a.component(camera, 'cc.Camera', { ...cameraTemplate, _orthoHeight: 667 });
a.component(canvas, 'cc.Canvas', { _cameraComponent: ref(cameraComponent), _alignCanvasWithScreen: true });
a.widget(canvas, 45);
const background = a.sprite('BeachBackground', canvas, frame('background.jpg'), { w: 750, h: 1624 });
a.widget(background, 45);

// Fixed-width layout; top controls and wheel follow the top, gun/actions follow the bottom.
// The shortest supported 750x1334 still has a gap between the disk and ammo panel.
const header = a.node('TopHUD', canvas, { y: 597, w: 750, h: 210, ay: 1 });
a.widget(header, 17, { _top: 70 });
a.sprite('TitlePlaque', header, art.header, { y: -43, w: 520, h: 110 });
a.label('Title', header, '第1关  枪法大挑战', { y: -43, w: 480, h: 70, size: 37, outlineWidth: 4 });
const backNode = a.sprite('BackButton', header, art.back, { x: -322, y: -42, w: 76, h: 76 });
const back = a.button(backNode);
const timerPanel = a.sprite('TimerPanel', header, art.wood, { y: -113, w: 170, h: 49 });
const timer = a.label('Timer', timerPanel, '时间：60s', { w: 165, h: 45, size: 28, outlineWidth: 2 });
const instruction = a.sprite('InstructionPlaque', header, art.wood, { y: -177, w: 382, h: 57 });
a.label('Instruction', instruction, '打爆角色周围的气球', { w: 355, h: 46, size: 29 });

const playfield = a.node('Playfield', canvas, { y: 57, w: 750, h: 630 });
a.widget(playfield, 17, { _top: 295 });
const wheel = a.node('WheelRoot', playfield, { w: 620, h: 620 });
const wheelArt = a.sprite('BlueWhiteWheel', wheel, frame('wheel.png'), { w: 620, h: 620 });
const points = [[-188, 156], [-231, 72], [-202, -134], [26, -239], [220, -77], [210, 108]];
const balloons = points.map(([x, y], i) => a.sprite(`Balloon${i + 1}`, wheel, frame('balloon.png'), {
  x, y, w: 94, h: 108, rotation: -Math.atan2(x, y) * 180 / Math.PI,
}));
const character = a.sprite('Character', wheel, frame('character.png'), { y: 0, w: 403, h: 534 });
const holes = Array.from({ length: 16 }, (_, i) => a.sprite(`BulletHole${i + 1}`, wheel, frame('bullet-hole.png'), { w: 28, h: 28, active: false }));
const bursts = points.map(([x, y], i) => {
  const node = a.sprite(`BalloonBurst${i + 1}`, wheel, frame('burst.png'), { x, y, w: 120, h: 120, active: false });
  a.opacity(node); return node;
});
const aim = a.sprite('FixedCrosshair', playfield, frame('crosshair.png'), { y: -240, w: 94, h: 94 });
const score = a.label('Score', playfield, '当前得分：\n0', { x: -220, y: 292, w: 230, h: 95,
  size: 33, align: 0, wrap: true, color: rgba(255, 228, 67), outlineWidth: 2 });
const progress = a.label('BalloonProgress', playfield, '气球 0/6', { x: 253, y: 307, w: 174, h: 48, size: 26,
  color: rgba(255, 241, 155), outlineWidth: 2 });
const feedback = a.label('ShotFeedback', playfield, '+350', { y: -340, w: 400, h: 62, size: 39, active: false });
a.opacity(feedback.node);

const bottom = a.node('BottomHUD', canvas, { y: -667, w: 750, h: 445, ay: 0 });
a.widget(bottom, 20, { _bottom: 0 });
const gun = a.sprite('GunAndHands', bottom, frame('gun.png'), { y: 0, w: 720, h: 430, ay: 0 });
const muzzle = a.sprite('MuzzleFlash', bottom, art.muzzle, { y: 424, w: 82, h: 82, active: false });
const ammoPanel = a.sprite('AmmoPanel', bottom, art.panel, { x: -246, y: 401, w: 240, h: 118 });
a.sprite('AmmoIcon', ammoPanel, art.bullet, { x: -70, w: 24, h: 81 });
const ammo = a.label('AmmoCount', ammoPanel, '×8', { x: 32, w: 140, h: 82, size: 47, color: rgba(32, 30, 26), outline: false });

function rewardButton(name, x, label, icon, { w = 60, h = 69, rotation = 0 } = {}) {
  const node = a.node(name, bottom, { x, y: 95, w: 160, h: 165 });
  a.sprite('ButtonArt', node, art.reward, { y: -6, w: 129, h: 126 });
  a.sprite('RewardIcon', node, icon, { y: 10, w, h, rotation });
  a.label('Caption', node, label, { y: -44, w: 126, h: 35, size: 25, outlineWidth: 2 });
  a.sprite('AdBadge', node, art.ad, { x: 52, y: 52, w: 48, h: 45 });
  return a.button(node);
}
const time = rewardButton('AddTimeButton', -150, '加时', frame('hourglass.png'));
const supply = rewardButton('AmmoSupplyButton', 150, '补给 +5', art.bullet, { w: 23, h: 72, rotation: -22 });

const overlay = a.node('ResultOverlay', canvas, { w: 750, h: 1334, active: false });
a.component(overlay, 'cc.BlockInputEvents');
a.sprite('DimBackground', overlay, art.dim, { w: 750, h: 1334, color: rgba(0, 0, 0, 192) });
const panel = a.sprite('ResultPanel', overlay, art.modal, { y: 10, w: 660, h: 650 }); a.opacity(panel);
const success = a.label('SuccessTitle', panel, '挑战成功', { y: 228, w: 500, h: 85, size: 58,
  color: rgba(44, 154, 78), outlineColor: rgba(255, 244, 180), outlineWidth: 4 });
const failure = a.label('FailureTitle', panel, '挑战失败', { y: 228, w: 500, h: 85, size: 58,
  color: rgba(220, 62, 81), outlineColor: rgba(255, 244, 180), outlineWidth: 4, active: false });
const rating = a.label('ResultRating', panel, '评价为：神枪手', { y: 126, w: 560, h: 65, size: 37, color: rgba(78, 48, 30), outline: false });
const stats = a.label('ResultStats', panel, '准确率：100%    得分：2100\n打爆气球：6/6', { y: 43, w: 566, h: 90,
  size: 28, lineHeight: 40, wrap: true, color: rgba(78, 48, 30), outline: false });
const reason = a.label('ResultReason', panel, '气球全部打爆，角色安然无恙！', { y: -51, w: 560, h: 65,
  size: 26, wrap: true, color: rgba(115, 69, 41), outline: false });
function action(name, label, x, y, w = 260, parent = panel) {
  const node = a.sprite(name, parent, art.action, { x, y, w, h: 82 });
  a.label('Caption', node, label, { w: w - 30, h: 54, size: 30, outlineWidth: 2 });
  return a.button(node);
}
// Success/failure titles are separate editor nodes; runtime never changes their position/size.
const retry = action('RetryButton', '再次挑战', 0, -155, 350);
const reviveNode = a.sprite('ReviveButton', panel, art.action, { y: -155, w: 350, h: 82, active: false });
const reviveCaption = a.label('Caption', reviveNode, '原地复活', { x: -12, w: 286, h: 54, size: 30, outlineWidth: 2 });
a.sprite('AdBadge', reviveNode, art.ad, { x: 148, y: 16, w: 48, h: 45 });
const revive = a.button(reviveNode);
const row = a.node('ResultButtonRow', panel, { y: -259.833, w: 540, h: 100 });
a.component(row, 'cc.Layout', { _resizeMode: 1, _layoutType: 1,
  _cellSize: { __type__: 'cc.Size', width: 40, height: 40 }, _startAxis: 0,
  _paddingLeft: 0, _paddingRight: 0, _paddingTop: 0, _paddingBottom: 0,
  _spacingX: 20, _spacingY: 0, _verticalDirection: 1, _horizontalDirection: 0,
  _constraint: 0, _constraintNum: 2, _affectedByScale: false, _isAlign: true });
const home = action('ResultHomeButton', '返回首页', -140, 0, 260, row);
const next = action('NextButton', '下一关', 140, 0, 260, row);
const failureRetry = action('FailureRetryButton', '再次挑战', 140, 0, 260, row);
o[o[failureRetry].node.__id__]._active = false;

a.component(canvas, compressUuid(SCRIPT_UUID), {
  rotationSpeed: -100, initialAmmo: 8, timeLimit: 60, shotInterval: 0.18, balloonHitScale: 0.92,
  sceneBackground: ref(background), wheelRoot: ref(wheel), wheelArt: ref(wheelArt), character: ref(character),
  characterHitMask: { __uuid__: assetUuid('character-mask.json'), __expectedType__: 'cc.JsonAsset' },
  balloons: balloons.map(ref), balloonBursts: bursts.map(ref), bulletHoles: holes.map(ref), crosshair: ref(aim),
  gun: ref(gun), muzzle: ref(muzzle), timerLabel: ref(timer.component), scoreLabel: ref(score.component),
  ammoLabel: ref(ammo.component), progressLabel: ref(progress.component), feedbackLabel: ref(feedback.component),
  backButton: ref(back), timeButton: ref(time), ammoButton: ref(supply),
  resultOverlay: ref(overlay), resultPanel: ref(panel), successTitle: ref(success.node), failureTitle: ref(failure.node),
  resultRating: ref(rating.component), resultStats: ref(stats.component), resultReason: ref(reason.component),
  retryButton: ref(retry), nextButton: ref(next), resultHomeButton: ref(home),
  reviveButton: ref(revive), reviveButtonLabel: ref(reviveCaption.component), failureRetryButton: ref(failureRetry),
});
o[1]._globals = ref(appendSceneGlobals(source, o));
fitFeedResultOverlay(o, 'BalloonWheelFeedGameScene');

if (process.argv.includes('--write')) {
  if (fs.existsSync(SCENE) && !process.argv.includes('--replace-scene')) {
    throw new Error('Scene already exists. Preserve editor changes; --replace-scene is only for intentional regeneration.');
  }
  fs.writeFileSync(SCENE, JSON.stringify(o, null, 2) + '\n');
  const metas = [
    [SCENE + '.meta', metadata('scene', SCENE_UUID, '1.1.50', ['.json'])],
    ['assets/scripts/balloonWheelFeedGameScene.ts.meta', metadata('typescript', SCRIPT_UUID, '4.0.24')],
    ['assets/scripts/balloonWheelRules.ts.meta', metadata('typescript', assetUuid('balloonWheelRules.ts'), '4.0.24')],
  ];
  for (const [file, data] of metas) if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
console.log(JSON.stringify({ scene: SCENE, sceneUuid: SCENE_UUID, scriptUuid: SCRIPT_UUID, objects: o.length, wrote: process.argv.includes('--write') }));
