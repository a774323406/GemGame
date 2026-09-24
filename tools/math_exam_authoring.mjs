import { standardizeLobbyCard } from './lobby_card_style.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { SceneAuthor, compressUuid, ref, rgba, vec } from './penguin_scene_authoring.mjs';
import { appendSceneGlobals } from './feed_result_layout.mjs';

export function mathUuid(name) {
  const h = crypto.createHash('sha256').update(`GemGame/mathExam/${name}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export const SCENE_UUID = mathUuid('MathExamFeedGameScene');
export const SCRIPT_UUID = mathUuid('mathExamFeedGameScene.ts');
const frame = file => `${JSON.parse(fs.readFileSync(`${file}.meta`)).uuid}@f9941`;
const white = () => frame('assets/res/foodDeliveryFeed/white.png');
const rounded = () => frame('assets/res/newMain/card_round.png');
const inkColor = rgba(46, 47, 43);
const muted = rgba(136, 130, 114);
const red = rgba(201, 52, 43);

function rect(a, name, parent, x, y, w, h, color, round = false) {
  const id = a.sprite(name, parent, round ? rounded() : white(), { x, y, w, h, color });
  if (round) a.objects[a.objects[id]._components.find(r => a.objects[r.__id__].__type__ === 'cc.Sprite').__id__]._type = 1;
  return id;
}
function text(a, name, parent, caption, x, y, w, h, size, color = inkColor, extra = {}) {
  return a.label(name, parent, caption, { x, y, w, h, size, color, outline: false, bold: false, ...extra });
}
function resultButton(a, name, parent, caption, y, rewarded = false) {
  const id = a.sprite(name, parent, frame('assets/res/penguinStackFeed/action-orange.png'), { y, w: 360, h: 112 });
  a.label('Caption', id, caption, {
    x: rewarded ? 18 : 0, w: rewarded ? 248 : 336, h: 62, size: 34,
    color: rgba(255, 255, 255), outlineColor: rgba(117, 57, 20), outlineWidth: 3,
  });
  if (rewarded) a.sprite('AdBadge', id, frame('assets/res/texture/UIs/ad_badge_cartoon_red.png'), { x: -126, w: 46, h: 46 });
  a.component(id, '7a1a5iVpkNPsYcjs1PU1SS/', { enableClickSound: true, onlyPlayWhenInteractable: true });
  return a.button(id);
}

function addTimeButton(a, parent) {
  // Reuse the exact gauge artwork and corner badge from the reference slowdown control.
  const id = a.sprite('AddTimeButton', parent, frame('assets/res/juggleBallGame/slowdown-button.png'), { y: -555, w: 112, h: 112 });
  a.label('Caption', id, '加时', {
    y: -34.125, w: 56, h: 35, size: 22, lineHeight: 24,
    color: rgba(255, 255, 255), outlineColor: rgba(91, 54, 29), outlineWidth: 3,
  });
  a.sprite('AdBadge', id, frame('assets/res/texture/UIs/ad_badge_cartoon_red.png'), { x: 46.3, y: 43.5, w: 52.5, h: 49 });
  a.component(id, '7a1a5iVpkNPsYcjs1PU1SS/', { enableClickSound: true, onlyPlayWhenInteractable: true });
  return a.button(id);
}

export function buildMathExamScene() {
  const source = JSON.parse(fs.readFileSync('assets/gamescene/JuggleBallGameScene.scene'));
  const a = new SceneAuthor([], 'mathExam');
  const o = a.objects;
  a.add({ __type__: 'cc.SceneAsset', _name: 'MathExamFeedGameScene', _objFlags: 0, __editorExtras__: {}, _native: '', scene: ref(1) });
  const scene = structuredClone(source[1]);
  Object.assign(scene, { _name: 'MathExamFeedGameScene', _children: [], _components: [], _globals: null, _id: SCENE_UUID });
  a.add(scene);
  const canvas = a.node('Canvas', 1, { x: 375, y: 812, w: 750, h: 1624 });
  const camera = a.node('Camera', canvas, { z: 1000, w: 1, h: 1 });
  o[camera]._layer = 1073741824;
  const cameraFields = structuredClone(source.find(v => v.__type__ === 'cc.Camera'));
  delete cameraFields.node; delete cameraFields._id;
  const cc = a.component(camera, 'cc.Camera', { ...cameraFields, _orthoHeight: 812 });
  a.component(canvas, 'cc.Canvas', { _cameraComponent: ref(cc), _alignCanvasWithScreen: true });
  a.widget(canvas, 45);
  // Coordinates below use the video's original 592×1280 pixel grid.
  const background = rect(a, 'DeskBackground', canvas, 0, 0, 750, 1624, rgba(146, 91, 48));
  a.widget(background, 45);
  const root = a.node('LayoutRoot', canvas, { w: 592, h: 1280 });
  const paper = a.sprite('VideoArtwork', root, `${mathUuid('video-artwork.png')}@f9941`, { w: 592, h: 1280 });
  const viewport = a.node('QuestionViewport', paper, { x: -106, y: -7, w: 340, h: 570 });
  a.component(viewport, 'cc.Mask', { _type: 0, _inverted: false, _segments: 64, _alphaThreshold: 0.1 });
  const questions = a.node('QuestionRoot', viewport, { w: 340, h: 570 });
  const labels = [];
  const ys = [215, 72, -72, -215];
  for (let i = 0; i < 4; i++) {
    const q = text(a, `Equation${i}`, questions, ['9−3=', '3+1=', '8+2=', '4×7='][i], 0, ys[i], 332, 104, 104, rgba(60, 65, 63), { lineHeight: 104, align: 0 });
    Object.assign(o[q.component], { _font: { __uuid__: mathUuid('video-digits.fnt'), __expectedType__: 'cc.BitmapFont' }, _isSystemFontUsed: false, _overflow: 0 });
    labels.push(q.component);
  }
  rect(a, 'ActiveUnderline', paper, -141.5, 149, 251, 2.7, rgba(65, 70, 68));
  const score = text(a, 'Score', paper, '', 191, 319, 104, 47, 43, rgba(230, 123, 132));
  // Transparent hit regions let the original paper remain entirely visible.
  // Keep the original top edge (272), extend only the bottom by 50% (66 px).
  const inkArea = a.node('InkArea', paper, { x: 146, y: 173, w: 240, h: 198 });
  const inkHint = text(a, 'InkHint', inkArea, '', 0, 0, 240, 40, 22, muted);
  const ink = a.component(inkArea, 'cc.Graphics', { _lineWidth: 7, _strokeColor: rgba(228, 0, 22), _fillColor: rgba(228, 0, 22), _lineJoin: 2, _lineCap: 2, _miterLimit: 10 });
  const feedback = text(a, 'Feedback', paper, '', 152, 299, 220, 60, 34, red);
  o[feedback.node]._active = false;
  const hint = text(a, 'Hint', paper, '', 50, -363, 390, 42, 20, red);
  o[hint.node]._active = false;
  const clockNode = a.node('ClockHands', paper, { x: 47, y: 591, w: 68, h: 68 });
  const clock = a.component(clockNode, 'cc.Graphics', { _lineWidth: 2.5, _strokeColor: inkColor, _fillColor: red, _lineJoin: 2, _lineCap: 2, _miterLimit: 10 });
  const time = text(a, 'Time', paper, '60 秒', 47, 591, 60, 35, 22);
  o[time.node]._active = false;
  const backNode = a.node('BackButton', root, { x: -224, y: 580, w: 76, h: 76 });
  const back = a.button(backNode);
  o[back]._transition = 0;
  const bottle = a.sprite('CorrectionFluid', root, `${mathUuid('correction-fluid.png')}@f9941`, { x: -197, y: -454, w: 162, h: 276 });
  const eraserTip = a.node('EraserTip', bottle, { x: -45, y: 125, w: 36, h: 36 });
  const addTime = addTimeButton(a, root);

  const overlay = a.node('ResultOverlay', canvas, { w: 2400, h: 3000, active: false });
  a.widget(overlay, 45);
  a.component(overlay, 'cc.BlockInputEvents');
  const shade = rect(a, 'Shade', overlay, 0, 0, 2400, 3000, rgba(37, 27, 19, 170));
  a.widget(shade, 45);
  const panel = rect(a, 'ResultPanel', overlay, 0, 0, 610, 900, rgba(255, 253, 246), true);
  text(a, 'ResultKicker', panel, '口 算 成 绩 单', 0, 348, 480, 46, 25, muted);
  const resultTitle = text(a, 'ResultTitle', panel, '挑战完成', 0, 276, 510, 68, 45, inkColor, { bold: true });
  const resultScore = text(a, 'ResultScore', panel, '0 分', 0, 160, 510, 152, 102, red, { bold: true });
  const resultDetail = text(a, 'ResultDetail', panel, '答对 0 题', 0, 52, 510, 54, 30);
  const best = text(a, 'Best', panel, '最佳成绩  0 分', 0, -12, 510, 50, 26, muted);
  const revive = resultButton(a, 'ReviveButton', panel, '复活', -115, true);
  const replay = resultButton(a, 'ReplayButton', panel, '再考一次', -235);
  const home = resultButton(a, 'HomeButton', panel, '返回大厅', -355);
  a.component(canvas, compressUuid(SCRIPT_UUID), {
    layoutRoot: ref(root), paper: ref(paper), questionRoot: ref(questions),
    inkArea: ref(inkArea), ink: ref(ink), inkHint: ref(inkHint.component),
    questionLabels: labels.map(ref), clock: ref(clock), scoreLabel: ref(score.component), timeLabel: ref(time.component),
    hintLabel: ref(hint.component), feedbackLabel: ref(feedback.component),
    correctionBottle: ref(bottle), eraserTip: ref(eraserTip), backButton: ref(back), resultOverlay: ref(overlay), resultPanel: ref(panel),
    resultTitle: ref(resultTitle.component), resultScore: ref(resultScore.component),
    resultDetail: ref(resultDetail.component), bestLabel: ref(best.component),
    replayButton: ref(replay), homeButton: ref(home), addTimeButton: ref(addTime), reviveButton: ref(revive),
  });
  o[1]._globals = ref(appendSceneGlobals(source, o));
  return o;
}

export function appendMathExamCard(objects) {
  const controller = objects.find(v => v.gameList && v.puzzleButton && v.whiteGooseButton);
  if (!controller) throw new Error('Lobby controller not found');
  const sourceCard = objects[objects[controller.puzzleButton.__id__].node.__id__];
  const contentId = sourceCard._parent.__id__;
  const existing = objects[contentId]._children.find(r => objects[r.__id__]._name === 'MathExamCard');
  if (existing) { standardizeLobbyCard(objects, existing.__id__, '口算大挑战'); return; }
  const a = new SceneAuthor(objects, 'mathExamLobby');
  const index = objects[contentId]._children.length;
  const card = a.node('MathExamCard', contentId, { x: index % 2 ? 139 : -139, y: -152 - Math.floor(index / 2) * 294, w: 252, h: 268 });
  rect(a, 'CardShadow', card, 6, -8, 256, 270, rgba(71, 184, 230, 205), true);
  rect(a, 'CardOutline', card, 0, 0, 256, 268, rgba(31, 29, 30), true);
  rect(a, 'CardSurface', card, 0, 0, 248, 260, rgba(255, 255, 251), true);
  const preview = rect(a, 'Preview', card, 0, 25, 218, 177, rgba(183, 131, 77), true);
  const page = rect(a, 'ExamPaper', preview, 0, 0, 185, 154, rgba(255, 253, 243));
  text(a, 'Heading', page, '口算 A 卷', 0, 54, 170, 34, 20, inkColor, { bold: true });
  text(a, 'Equation', page, '9 − 3 =', -30, 10, 115, 40, 27, inkColor, { bold: true });
  text(a, 'Answer', page, '6', 58, 10, 45, 45, 36, red, { bold: true });
  text(a, 'Equation2', page, '4 × 7 = ?', 0, -40, 170, 40, 27, inkColor, { bold: true });
  text(a, 'Title', card, '口算大挑战', 0, -94, 230, 60, 31, inkColor, { bold: true });
  const b = a.button(card);
  a.component(card, '7a1a5iVpkNPsYcjs1PU1SS/', { enableClickSound: true, onlyPlayWhenInteractable: true });
  controller.mathExamButton = ref(b);
  standardizeLobbyCard(objects, card, '口算大挑战');
  const transform = objects[objects[contentId]._components.find(r => objects[r.__id__].__type__ === 'cc.UITransform').__id__];
  transform._contentSize.height = 18 + Math.ceil((index + 1) / 2) * 294 - 26 + 14;
}
