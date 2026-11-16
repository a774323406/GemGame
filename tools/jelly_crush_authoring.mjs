import crypto from 'node:crypto';
import fs from 'node:fs';
import { SceneAuthor, compressUuid, ref, rgba, vec } from './feed_scene_authoring.mjs';
import { appendSceneGlobals, fitFeedResultOverlay } from './feed_result_layout.mjs';
import { standardizeLobbyCard } from './lobby_card_style.mjs';

export const uuid = name => {
  const hash = crypto.createHash('sha256').update(`GemGame/jellyCrush/${name}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
export const SCENE_UUID = uuid('JellyCrushFeedGameScene');

const frame = file => `${JSON.parse(fs.readFileSync(`${file}.meta`, 'utf8')).uuid}@f9941`;
const asset = file => JSON.parse(fs.readFileSync(`${file}.meta`, 'utf8')).uuid;
const backgroundFrame = frame('assets/res/jellyCrushFeed/background.jpg');
const pressFrame = frame('assets/res/jellyCrushFeed/press-head.png');
const jellyArtFrame = frame('assets/res/jellyCrushFeed/jelly-red.png');
const warningFrame = frame('assets/res/jellyCrushFeed/warning-strip.png');
const heartIconFrame = frame('assets/res/jellyCrushFeed/heart-icon.png');
const clockIconFrame = frame('assets/res/jellyCrushFeed/clock-icon.png');
const heartItemFrame = frame('assets/res/jellyCrushFeed/heart-item.png');
const slowItemFrame = frame('assets/res/jellyCrushFeed/slow-item.png');
const cardRoundFrame = frame('assets/res/newMain/card_round.png');
const whiteFrame = frame('assets/res/foodDeliveryFeed/white.png');
const buttonFrame = frame('assets/res/feedResult/button-orange.png');
const backFrame = frame('assets/res/foodDeliveryFeed/back.png');
const adBadgeFrame = frame('assets/res/feedShared/video-badge.png');
const component = (objects, nodeId, type) => objects[nodeId]._components
  .map(item => objects[item.__id__]).find(item => item.__type__ === type);
const componentId = (objects, nodeId, type) => objects[nodeId]._components
  .map(item => item.__id__).find(id => objects[id]?.__type__ === type);

function cloneExternalSubtree(source, destination, rootId, prefix) {
  const sourceIds = [];
  const collect = id => {
    sourceIds.push(id);
    for (const componentRef of source[id]._components || []) sourceIds.push(componentRef.__id__);
    for (const childRef of source[id]._children || []) collect(childRef.__id__);
  };
  collect(rootId);
  const map = new Map(sourceIds.map((id, index) => [id, destination.length + index]));
  const remap = value => {
    if (Array.isArray(value)) return value.map(remap);
    if (!value || typeof value !== 'object') return value;
    if (Number.isInteger(value.__id__)) return map.has(value.__id__) ? ref(map.get(value.__id__)) : null;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, remap(child)]));
  };
  for (const id of sourceIds) {
    const clone = remap(source[id]);
    if (clone._id) clone._id = `${prefix}_${map.get(id)}`;
    destination.push(clone);
  }
  return map.get(rootId);
}

function button(author, parent, name, text, y, width = 470) {
  const node = author.sprite(name, parent, buttonFrame, { y, w: width, h: 138 });
  author.label('Caption', node, text, { w: width - 60, h: 86, size: 50, outlineWidth: 4 });
  return author.button(node);
}

function colorSprite(author, name, parent, x, y, w, h, color, active = true) {
  return author.sprite(name, parent, whiteFrame, { x, y, w, h, color, active });
}

function ensureLobbyCardChrome(objects, cardId) {
  const author = new SceneAuthor(objects, `${objects[cardId]._name}Chrome`);
  author.serial = objects.length;
  const addChrome = (name, x, y, w, h, color) => {
    const node = author.sprite(name, cardId, cardRoundFrame, { x, y, w, h, color });
    objects[componentId(objects, node, 'cc.Sprite')]._type = 1;
    return node;
  };
  if (directChild(objects, cardId, 'CardShadow') === undefined) {
    addChrome('CardShadow', 6, -8, 256, 270, rgba(71, 184, 230, 205));
  }
  if (directChild(objects, cardId, 'CardOutline') === undefined) {
    addChrome('CardOutline', 0, 0, 256, 268, rgba(31, 29, 30));
  }
  if (directChild(objects, cardId, 'CardSurface') === undefined) {
    addChrome('CardSurface', 0, 0, 248, 260, rgba(255, 255, 251));
  }
  const chromeOrder = ['CardShadow', 'CardOutline', 'CardSurface'];
  const chromeRefs = chromeOrder
    .map(name => directChild(objects, cardId, name))
    .filter(id => id !== undefined)
    .map(id => ref(id));
  objects[cardId]._children = [
    ...chromeRefs,
    ...objects[cardId]._children.filter(item => !chromeOrder.includes(objects[item.__id__]?._name)),
  ];
}

export function buildJellyCrushScene() {
  const source = JSON.parse(fs.readFileSync('assets/gamescene/FoodDeliveryFeedGameScene.scene', 'utf8'));
  const buttonSource = JSON.parse(fs.readFileSync('assets/gamescene/JuggleBallGameScene.scene', 'utf8'));
  const author = new SceneAuthor([], 'jellyCrush');
  const objects = author.objects;

  author.add({ __type__: 'cc.SceneAsset', _name: 'JellyCrushFeedGameScene', _objFlags: 0, __editorExtras__: {}, _native: '', scene: ref(1) });
  author.add({
    ...structuredClone(source[1]),
    _name: 'JellyCrushFeedGameScene',
    _children: [],
    _components: [],
    _globals: null,
    _id: SCENE_UUID,
  });

  const canvas = author.node('Canvas', 1, { x: 375, y: 812, w: 750, h: 1624 });
  author.widget(canvas, 45);
  const cameraTemplate = structuredClone(source.find(item => item.__type__ === 'cc.Camera'));
  delete cameraTemplate.node;
  delete cameraTemplate._id;
  const camera = author.node('Camera', canvas, { z: 1000, w: 1, h: 1 });
  objects[camera]._layer = 1073741824;
  const cameraComponent = author.component(camera, 'cc.Camera', { ...cameraTemplate, _orthoHeight: 812 });
  author.component(canvas, 'cc.Canvas', { _cameraComponent: ref(cameraComponent), _alignCanvasWithScreen: true });

  const background = author.sprite('Background', canvas, backgroundFrame, { w: 750, h: 1624 });
  const playfield = author.node('PlayfieldRoot', canvas, { w: 750, h: 1624 });
  const stageShade = colorSprite(author, 'StageShade', playfield, 0, 40, 680, 920, rgba(40, 8, 78, 24));
  objects[componentId(objects, stageShade, 'cc.Sprite')]._type = 1;
  objects[stageShade]._active = false;
  const topGlow = colorSprite(author, 'TopGlow', playfield, 0, 510, 580, 300, rgba(189, 115, 246, 16));
  objects[componentId(objects, topGlow, 'cc.Sprite')]._type = 1;
  objects[topGlow]._active = false;

  author.sprite('WarningLine', playfield, warningFrame, { x: 0, y: -438, w: 750, h: 108 });

  // The press is one shaded, transparent illustration so the long metal rod and
  // the heavy collar keep the same proportions while the whole assembly moves.
  const head = author.node('PressHead', playfield, { x: 0, y: 360, w: 360, h: 920 });
  author.sprite('PressArt', head, pressFrame, { w: 360, h: 920 });

  const jellies = [];
  // The extracted jelly has transparent padding below its visible body. This
  // center position aligns the visible base with the warning strip.
  const jellyStarts = [[-390, -331], [390, -331], [-390, -331], [390, -331], [-390, -331], [390, -331]];
  for (let index = 0; index < 6; index += 1) {
    const [x, y] = jellyStarts[index];
    const jelly = author.node(`Jelly${index}`, playfield, { x, y, w: 180, h: 180, active: index < 2 });
    author.sprite('JellyArt', jelly, jellyArtFrame, { w: 190, h: 190 });
    author.opacity(jelly);
    jellies.push(jelly);
  }
  const heart = author.node('HeartItem', playfield, { x: -220, y: -357, w: 100, h: 100, active: false });
  // The moving pickup uses a transparent cutout.  Keeping the sprite itself
  // transparent avoids the white bubble/edge that made the old label look
  // like a UI button when it crossed the playfield.
  author.sprite('HeartArt', heart, heartItemFrame, { w: 88, h: 88 });
  const clock = author.node('ClockItem', playfield, { x: 220, y: -357, w: 100, h: 100, active: false });
  // This node is still named ClockItem for the existing scene property and
  // runtime wiring, while the art communicates the new slow-down pickup.
  author.sprite('SlowArt', clock, slowItemFrame, { w: 88, h: 88 });

  const tapSurface = author.node('TapSurface', canvas, { w: 750, h: 1624 });
  author.widget(tapSurface, 45);

  const hud = author.node('HUD', canvas, { w: 750, h: 1624 });
  author.widget(hud, 45);
  const backNode = author.sprite('BackButton', hud, backFrame, { w: 76, h: 76 });
  author.widget(backNode, 9, { _left: 24, _top: 105 });
  const backButton = author.button(backNode);
  const title = author.label('Title', hud, '果冻压压乐', { x: 0, y: 690, w: 500, h: 60, size: 34, color: rgba(255, 255, 255, 235), outlineColor: rgba(58, 26, 91), outlineWidth: 4 });
  const heartHud = author.sprite('HeartHudIcon', hud, heartIconFrame, { x: -288, y: 615, w: 62, h: 62 });
  const lives = author.label('Lives', hud, '5', { x: -218, y: 615, w: 100, h: 58, size: 42, color: rgba(255, 255, 255), outlineColor: rgba(76, 33, 105), outlineWidth: 4 });
  const clockHud = author.sprite('ClockHudIcon', hud, clockIconFrame, { x: -288, y: 535, w: 62, h: 62 });
  const time = author.label('Time', hud, '45', { x: -218, y: 535, w: 120, h: 58, size: 40, color: rgba(255, 255, 255), outlineColor: rgba(76, 33, 105), outlineWidth: 4 });
  // The round is endless.  The score is the only progress value shown.
  objects[clockHud]._active = false;
  objects[time.node]._active = false;
  const score = author.label('Score', hud, '0', { x: 240, y: 615, w: 220, h: 56, size: 30, color: rgba(255, 255, 255, 220), outlineColor: rgba(76, 33, 105), outlineWidth: 4 });
  const hint = author.label('Hint', hud, '', { x: 0, y: 520, w: 560, h: 50, size: 27, color: rgba(255, 238, 255, 220), outlineColor: rgba(65, 30, 95), outlineWidth: 4 });
  const countdown = author.label('Countdown', hud, '3', { x: 0, y: 90, w: 300, h: 220, size: 160, color: rgba(255, 255, 255), outlineColor: rgba(86, 34, 104), outlineWidth: 8 });
  objects[countdown.node]._active = false;
  const hit = author.label('HitMessage', canvas, '', { x: 0, y: -155, w: 650, h: 70, size: 46, color: rgba(255, 238, 96), outlineColor: rgba(82, 27, 94), outlineWidth: 4 });

  const sourceButton = buttonSource.findIndex(item => item.__type__ === 'cc.Node' && item._name === 'SlowdownButton');
  if (sourceButton < 0) throw new Error('JuggleBallGameScene SlowdownButton is missing');
  const rewardButtonId = cloneExternalSubtree(buttonSource, objects, sourceButton, 'jellyReward');
  objects[rewardButtonId]._name = 'RewardLifeButton';
  objects[rewardButtonId]._parent = ref(hud);
  objects[rewardButtonId]._lpos = vec(0, -650, 0);
  objects[hud]._children.push(ref(rewardButtonId));
  author.widget(rewardButtonId, 20, {
    _bottom: 96,
    _horizontalCenter: 0,
    _isAbsHorizontalCenter: false,
  });
  const rewardChild = objects[rewardButtonId]._children.find(item => objects[item.__id__]._name === 'Label')?.__id__;
  if (rewardChild !== undefined) component(objects, rewardChild, 'cc.Label')._string = '加生命';
  const rewardButton = componentId(objects, rewardButtonId, 'cc.Button');

  const resultOverlay = author.node('ResultOverlay', canvas, { w: 750, h: 1624, active: false });
  author.component(resultOverlay, 'cc.BlockInputEvents');
  const resultDim = author.sprite('ResultDim', resultOverlay, whiteFrame, { w: 750, h: 1624, color: rgba(0, 0, 0, 145) });
  author.widget(resultDim, 45);
  const resultPanel = author.node('ResultPanel', resultOverlay, { w: 750, h: 1624 });
  author.widget(resultPanel, 45);
  const resultTitle = author.label('ResultTitle', resultPanel, '挑战成功', { y: 400, w: 620, h: 165, size: 104 });
  const resultKicker = author.label('ResultKicker', resultPanel, '果冻压压乐', { y: 550, w: 650, h: 60, size: 42 });
  const resultDetail = author.label('ResultDetail', resultPanel, '本次压中 0 个\n最高记录 0 个', { y: 130, w: 660, h: 230, size: 42, wrap: true });
  const reviveButton = button(author, resultPanel, 'ReviveButton', '复活', -180);
  const adBadge = author.sprite('AdBadge', reviveButton === undefined ? resultPanel : objects[reviveButton].node.__id__, adBadgeFrame, { x: -150, w: 72, h: 52 });
  const replayButton = button(author, resultPanel, 'ReplayButton', '重新挑战', -345);
  const homeButton = button(author, resultPanel, 'HomeButton', '返回主页', -510);

  const exitOverlay = author.node('ExitOverlay', canvas, { w: 750, h: 1624, active: false });
  author.widget(exitOverlay, 45);
  author.component(exitOverlay, 'cc.BlockInputEvents');
  const exitDim = author.sprite('ExitDim', exitOverlay, whiteFrame, { w: 750, h: 1624, color: rgba(0, 0, 0, 145) });
  author.widget(exitDim, 45);
  author.label('PauseTitle', exitOverlay, '游戏暂停', { y: 245, w: 650, h: 130, size: 80, outlineWidth: 5 });
  author.label('PauseDetail', exitOverlay, '确定退出本局吗？', { y: 100, w: 650, h: 90, size: 42 });
  const continueButton = button(author, exitOverlay, 'ContinueButton', '继续游戏', -80);
  const exitButton = button(author, exitOverlay, 'ExitButton', '退出本局', -255);

  const audioUuid = file => ({ __uuid__: asset(file), __expectedType__: 'cc.AudioClip' });
  const audio = (name, file, volume) => {
    const node = author.node(name, canvas);
    return author.component(node, 'cc.AudioSource', { _clip: audioUuid(file), _loop: false, _playOnAwake: false, _volume: volume });
  };
  const pressAudio = audio('PressAudio', 'assets/res/jellyCrushFeed/jelly-squash.wav', 0.9);
  const hitAudio = audio('HitAudio', 'assets/res/brickChopFeed/impact.wav', 0.6);
  const missAudio = audio('MissAudio', 'assets/res/sound/fail.mp3', 0.32);

  author.component(canvas, compressUuid(uuid('jellyCrushFeedGameScene.ts')), {
    surface: ref(tapSurface), playfieldRoot: ref(playfield), pressHead: ref(head), jellies: jellies.map(ref),
    heartItem: ref(heart), clockItem: ref(clock), hud: ref(hud), titleLabel: ref(title.component), lifeLabel: ref(lives.component),
    scoreLabel: ref(score.component), timeLabel: ref(time.component), hintLabel: ref(hint.component), countdownLabel: ref(countdown.component), hitLabel: ref(hit.component),
    rewardButton: ref(rewardButton), resultOverlay: ref(resultOverlay), resultTitle: ref(resultTitle.component), resultKicker: ref(resultKicker.component), resultDetail: ref(resultDetail.component),
    reviveButton: ref(reviveButton), replayButton: ref(replayButton), homeButton: ref(homeButton), backButton: ref(backButton),
    exitOverlay: ref(exitOverlay), continueButton: ref(continueButton), exitButton: ref(exitButton), pressAudio: ref(pressAudio), hitAudio: ref(hitAudio), missAudio: ref(missAudio),
  });
  objects[1]._globals = ref(appendSceneGlobals(source, objects));
  fitFeedResultOverlay(objects, 'JellyCrushFeedGameScene');
  return objects;
}

function directChild(objects, parentId, name) {
  return objects[parentId]._children.map(item => item.__id__).find(id => objects[id]?._name === name);
}

function setSpriteFrame(objects, nodeId, spriteFrame, width, height) {
  if (nodeId === undefined) return;
  const sprite = component(objects, nodeId, 'cc.Sprite');
  const transform = component(objects, nodeId, 'cc.UITransform');
  if (sprite) sprite._spriteFrame = { __uuid__: spriteFrame, __expectedType__: 'cc.SpriteFrame' };
  if (transform) transform._contentSize = { __type__: 'cc.Size', width, height };
}

function refreshExistingJellyCrushCard(objects, cardId) {
  const mask = directChild(objects, cardId, 'ArtworkMask');
  if (mask === undefined) return;
  const artwork = directChild(objects, mask, 'Artwork');
  // Keep the shared white content board used by every lobby item. The game
  // artwork sits inside it with a small inset instead of replacing the board.
  setSpriteFrame(objects, artwork, whiteFrame, 202, 164);
  let backdrop = directChild(objects, mask, 'PreviewBackdrop');
  if (backdrop !== undefined) {
    setSpriteFrame(objects, backdrop, backgroundFrame, 194, 156);
    objects[backdrop]._lpos = vec(0, 0, 0);
  }
  const oldHead = directChild(objects, mask, 'PreviewHead');
  setSpriteFrame(objects, oldHead, pressFrame, 72, 122);
  if (oldHead !== undefined) objects[oldHead]._lpos = vec(0, 61, 0);
  const oldJelly = directChild(objects, mask, 'PreviewJelly');
  if (oldJelly !== undefined) {
    objects[oldJelly]._name = 'PreviewJellyLeft';
    setSpriteFrame(objects, oldJelly, jellyArtFrame, 58, 58);
    objects[oldJelly]._lpos = vec(-46, -45, 0);
  }
  const oldFace = directChild(objects, mask, 'PreviewFace');
  if (oldFace !== undefined) objects[oldFace]._active = false;
  const author = new SceneAuthor(objects, 'jellyCrushLobbyRefresh');
  author.serial = objects.length;
  if (backdrop === undefined) {
    backdrop = author.sprite('PreviewBackdrop', mask, backgroundFrame, { x: 0, y: 0, w: 194, h: 156 });
  }
  // Put the backdrop immediately above the shared white board and below the
  // press/jelly artwork, even when upgrading an already-authored lobby card.
  objects[mask]._children = objects[mask]._children.filter(refItem => refItem.__id__ !== backdrop);
  const artworkIndex = objects[mask]._children.findIndex(refItem => refItem.__id__ === artwork);
  objects[mask]._children.splice(Math.max(0, artworkIndex + 1), 0, ref(backdrop));
  if (directChild(objects, mask, 'PreviewWarning') === undefined) {
    author.sprite('PreviewWarning', mask, warningFrame, { x: 0, y: -61, w: 202, h: 30 });
  }
  if (directChild(objects, mask, 'PreviewJellyRight') === undefined) {
    author.sprite('PreviewJellyRight', mask, jellyArtFrame, { x: 40, y: -40, w: 58, h: 58 });
  }
}

export function appendJellyCrushCard(objects) {
  const controller = objects.find(item => item?.gameList && item?.puzzleButton && item?.duckGrabButton);
  if (!controller) throw new Error('NewMainScene controller is missing');
  const sourceCardId = objects[controller.puzzleButton.__id__].node.__id__;
  const contentId = objects[sourceCardId]._parent.__id__;
  const existing = objects[contentId]._children.find(item => objects[item.__id__]?._name === 'JellyCrushCard');
  if (existing) {
    controller.jellyCrushButton = ref(componentId(objects, existing.__id__, 'cc.Button'));
    ensureLobbyCardChrome(objects, existing.__id__);
    refreshExistingJellyCrushCard(objects, existing.__id__);
    standardizeLobbyCard(objects, existing.__id__, '果冻压压乐');
    return;
  }
  const author = new SceneAuthor(objects, 'jellyCrushLobby');
  author.serial = objects.length;
  const index = objects[contentId]._children.length;
  const card = author.node('JellyCrushCard', contentId, { x: index % 2 ? 139 : -139, y: -152 - Math.floor(index / 2) * 294, w: 252, h: 268 });
  ensureLobbyCardChrome(objects, card);
  colorSprite(author, 'Preview', card, 0, 25, 218, 177, rgba(88, 46, 139));
  author.label('Title', card, '果冻压压乐', { y: -94, w: 230, h: 60, size: 31 });
  const cardButton = author.button(card);
  controller.jellyCrushButton = ref(cardButton);
  standardizeLobbyCard(objects, card, '果冻压压乐');
  const mask = directChild(objects, card, 'ArtworkMask');
  const artwork = directChild(objects, mask, 'Artwork');
  const artSprite = component(objects, artwork, 'cc.Sprite');
  artSprite._spriteFrame = { __uuid__: whiteFrame, __expectedType__: 'cc.SpriteFrame' };
  author.sprite('PreviewBackdrop', mask, backgroundFrame, { x: 0, y: 0, w: 194, h: 156 });
  const previewHead = author.sprite('PreviewHead', mask, pressFrame, { x: 0, y: 61, w: 72, h: 122 });
  author.sprite('PreviewWarning', mask, warningFrame, { x: 0, y: -61, w: 202, h: 30 });
  author.sprite('PreviewJellyLeft', mask, jellyArtFrame, { x: -46, y: -45, w: 58, h: 58 });
  author.sprite('PreviewJellyRight', mask, jellyArtFrame, { x: 40, y: -40, w: 58, h: 58 });
  const transformId = componentId(objects, contentId, 'cc.UITransform');
  const rowCount = Math.ceil((index + 1) / 2);
  objects[transformId]._contentSize.height = 18 + rowCount * 268 + (rowCount - 1) * 26 + 14;
}
