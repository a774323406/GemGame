import crypto from 'node:crypto';
import fs from 'node:fs';
import { SceneAuthor, compressUuid, ref, rgba } from './feed_scene_authoring.mjs';
import { appendSceneGlobals, fitFeedResultOverlay } from './feed_result_layout.mjs';
import { standardizeLobbyCard } from './lobby_card_style.mjs';

export const uuid = name => {
  const hash = crypto.createHash('sha256').update(`GemGame/airdropRescue/${name}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
export const SCENE_UUID = uuid('AirdropRescueFeedGameScene');

const frame = file => `${JSON.parse(fs.readFileSync(`${file}.meta`, 'utf8')).uuid}@f9941`;
const art = name => frame(`assets/res/airdropRescueFeed/${name}`);
const shared = name => frame(`assets/res/${name}`);
const artSize = (name, width) => {
  const data = JSON.parse(fs.readFileSync(`assets/res/airdropRescueFeed/${name}.meta`, 'utf8'));
  const size = data.subMetas.f9941.userData;
  return { w: width, h: width * size.rawHeight / size.rawWidth };
};
const component = (objects, nodeId, type) => objects[nodeId]._components
  .map(item => objects[item.__id__]).find(item => item.__type__ === type);

function button(author, parent, name, text, y, width = 470) {
  const node = author.sprite(name, parent, shared('feedResult/button-orange.png'), { y, w: width, h: 138 });
  author.label('Caption', node, text, { w: width - 60, h: 86, size: 48, outlineWidth: 4 });
  return { node, component: author.button(node) };
}

export function buildAirdropRescueScene() {
  const source = JSON.parse(fs.readFileSync('assets/gamescene/FoodDeliveryFeedGameScene.scene', 'utf8'));
  const author = new SceneAuthor([], 'airdropRescue');
  const objects = author.objects;

  author.add({ __type__: 'cc.SceneAsset', _name: 'AirdropRescueFeedGameScene', _objFlags: 0, __editorExtras__: {}, _native: '', scene: ref(1) });
  author.add({ ...structuredClone(source[1]), _name: 'AirdropRescueFeedGameScene', _children: [], _components: [], _globals: null, _id: SCENE_UUID });

  const canvas = author.node('Canvas', 1, { x: 375, y: 812, w: 750, h: 1624 });
  author.widget(canvas, 45);
  const cameraTemplate = structuredClone(source.find(item => item.__type__ === 'cc.Camera'));
  delete cameraTemplate.node; delete cameraTemplate._id;
  const camera = author.node('Camera', canvas, { z: 1000, w: 1, h: 1 }); objects[camera]._layer = 1073741824;
  const cameraComponent = author.component(camera, 'cc.Camera', { ...cameraTemplate, _orthoHeight: 812 });
  author.component(canvas, 'cc.Canvas', { _cameraComponent: ref(cameraComponent), _alignCanvasWithScreen: true });

  const background = author.sprite('Background', canvas, art('background.png'), { w: 750, h: 1624 });
  author.widget(background, 45);
  const playfield = author.node('Playfield', canvas, { w: 750, h: 1624 }); author.widget(playfield, 45);
  const bottleSize = artSize('bottle.png', 260);
  const pigSize = artSize('pig.png', 106);
  const groundY = -0.312 * 1624;
  // Collected food stays behind the pig and the glass outline, including results.
  const collectedPool = [];
  for (let index = 0; index < 12; index += 1) {
    collectedPool.push(author.sprite(`CollectedVegetable${index}`, playfield, art('vegetable.png'), {
      ...artSize('vegetable.png', 62), active: false,
    }));
  }
  const pig = author.sprite('Pig', playfield, art('pig.png'), { x: 4, y: groundY + 14 + pigSize.h / 2, ...pigSize });
  const bottle = author.sprite('Bottle', playfield, art('bottle.png'), { x: 0, y: groundY + bottleSize.h / 2, ...bottleSize });
  const bottleMouth = author.node('BottleMouth', bottle, { y: bottleSize.h / 2 - 8, w: 66, h: 12 });
  const bottleInterior = author.node('BottleInterior', bottle, { y: -bottleSize.h / 2 + 128, w: 248, h: 252 });
  const targetPool = [];
  for (let index = 0; index < 12; index += 1) {
    const target = author.node(`Target${index}`, playfield, { x: -35, y: 258, w: 245, h: 190, active: index === 0 });
    author.sprite('Helicopter', target, art('helicopter.png'), { x: -39, y: 114, ...artSize('helicopter.png', 164) });
    author.sprite('Rope', target, shared('foodDeliveryFeed/white.png'), { y: 50, w: 3, h: 62, color: rgba(104, 87, 57) });
    author.sprite('Vegetable', target, art('vegetable.png'), artSize('vegetable.png', 62));
    targetPool.push(target);
  }
  const departingPool = [];
  for (let index = 0; index < 24; index += 1) {
    departingPool.push(author.sprite(`DepartingHelicopter${index}`, playfield, art('helicopter.png'), {
      ...artSize('helicopter.png', 164), active: false,
    }));
  }
  const trailNode = author.node('SwipeTrail', playfield, { w: 750, h: 1624 });
  author.widget(trailNode, 45);
  const swipeTrail = author.component(trailNode, 'cc.Graphics', {
    _lineWidth: 4.5, _strokeColor: rgba(247, 167, 29), _fillColor: rgba(),
    _lineJoin: 2, _lineCap: 1, _miterLimit: 10,
  });
  const surface = author.node('TouchSurface', playfield, { w: 750, h: 1160, y: -60 });

  const hud = author.node('HUD', canvas, { w: 750, h: 1624 }); author.widget(hud, 45);
  const backNode = author.sprite('BackButton', hud, shared('juggleBallGame/back-button.png'), { w: 76, h: 76 });
  author.widget(backNode, 9, { _left: 24, _top: 80 });
  const backButton = author.button(backNode);
  author.sprite('TitlePlaque', hud, shared('juggleBallGame/title-plaque.png'), { x: 0, y: 685, w: 560, h: 150 });
  const title = author.label('Title', hud, '第1关 空投救援', { x: 0, y: 685, w: 540, h: 78, size: 52, color: rgba(255, 250, 224), outlineColor: rgba(109, 70, 25), outlineWidth: 5 });
  author.sprite('DescriptionPlaque', hud, shared('feedShared/action-orange.png'), { x: 0, y: 540, w: 420, h: 78 });
  author.label('Description', hud, '空投食物救救小猪', { x: 0, y: 540, w: 390, h: 52, size: 28, color: rgba(255, 248, 220), outlineColor: rgba(109, 70, 25), outlineWidth: 4 });
  const food = author.label('Food', hud, '食物\n0/5', { x: -285, y: 500, w: 150, h: 110, size: 32, color: rgba(255, 255, 255), outlineColor: rgba(50, 75, 84), outlineWidth: 4 });
  const chances = author.label('Chances', hud, '剩余机会\n25/25', { x: 285, y: 500, w: 190, h: 110, size: 30, color: rgba(255, 255, 255), outlineColor: rgba(50, 75, 84), outlineWidth: 4 });
  for (const name of ['TitlePlaque', 'Title', 'DescriptionPlaque', 'Description', 'Food', 'Chances']) {
    const node = objects[hud]._children.map(item => item.__id__).find(id => objects[id]._name === name);
    const size = component(objects, node, 'cc.UITransform')._contentSize;
    author.widget(node, 1, { _top: 812 - objects[node]._lpos.y - size.height / 2 });
  }

  const slow = author.sprite('SlowdownButton', hud, shared('juggleBallGame/slowdown-button.png'), { y: -640, w: 128, h: 128 });
  author.widget(slow, 20, { _bottom: 108 });
  author.label('Caption', slow, '减速', { y: -39, w: 100, h: 42, size: 28 });
  const foodBadgeId = source.findIndex(item => item.__type__ === 'cc.Node' && item._name === 'SlowdownAdBadge');
  const foodBadge = source[foodBadgeId];
  const badgeSprite = component(source, foodBadgeId, 'cc.Sprite');
  const badgeSize = component(source, foodBadgeId, 'cc.UITransform')._contentSize;
  const slowBadge = author.sprite('SlowdownAdBadge', slow, badgeSprite._spriteFrame.__uuid__, {
    x: foodBadge._lpos.x, y: foodBadge._lpos.y, w: badgeSize.width, h: badgeSize.height,
  });
  component(objects, slowBadge, 'cc.Sprite')._sizeMode = badgeSprite._sizeMode;
  author.component(slowBadge, 'cc.UIOpacity', { _opacity: component(source, foodBadgeId, 'cc.UIOpacity')?._opacity ?? 255 });
  const slowdownButton = author.button(slow);

  const overlay = author.node('ResultOverlay', canvas, { w: 750, h: 1624, active: false });
  author.sprite('ResultDim', overlay, shared('foodDeliveryFeed/white.png'), { w: 750, h: 1624, color: rgba(0, 0, 0, 145) });
  const panel = author.node('ResultPanel', overlay, { w: 750, h: 1624 });
  author.label('Kicker', panel, '空投救援', { y: 550, w: 650, h: 65, size: 42 });
  const resultTitle = author.label('ResultTitle', panel, '挑战失败', { y: 400, w: 620, h: 165, size: 104 });
  const resultDetail = author.label('ResultDetail', panel, '本次食物 0/5', { y: 140, w: 660, h: 240, size: 40, wrap: true });
  const revive = button(author, panel, 'ReviveButton', '复活继续', -180);
  author.sprite('ReviveAdBadge', revive.node, shared('feedShared/video-badge.png'), { x: -145, w: 72, h: 52 });
  const replay = button(author, panel, 'ReplayButton', '重新挑战', -345);
  const home = button(author, panel, 'HomeButton', '返回主页', -510);

  const exitOverlay = author.node('ExitConfirmation', canvas, { w: 750, h: 1624, active: false }); author.widget(exitOverlay, 45);
  author.component(exitOverlay, 'cc.BlockInputEvents', {});
  author.sprite('ExitDim', exitOverlay, shared('foodDeliveryFeed/white.png'), { w: 750, h: 1624, color: rgba(0, 0, 0, 145) });
  const pauseTitle = author.label('PauseTitle', exitOverlay, '游戏暂停', { y: 340, w: 650, h: 110, size: 80 });
  const pauseDetail = author.label('PauseDetail', exitOverlay, '继续挑战，还是重新开始？', { y: 200, w: 650, h: 90, size: 36 });
  const resume = button(author, exitOverlay, 'ContinueButton', '继续游戏', 20);
  const restart = button(author, exitOverlay, 'RestartButton', '重新开始', -155);
  const exit = button(author, exitOverlay, 'ExitButton', '退出本局', -330);
  for (const node of [pauseTitle.node, pauseDetail.node, resume.node, restart.node, exit.node]) author.widget(node, 18, { _verticalCenter: node === pauseTitle.node ? 0.255 : node === pauseDetail.node ? 0.15 : node === resume.node ? 0.015 : node === restart.node ? -0.12 : -0.25, _isAbsVerticalCenter: false });

  const sounds = {};
  for (const [name, file] of [
    ['release', 'airdropRescueFeed/rope-cut.wav'],
    ['caught', 'ropeDuckFeed/pickup.wav'],
    ['miss', 'ropeDuckFeed/fall.wav'],
  ]) {
    const clip = JSON.parse(fs.readFileSync(`assets/res/${file}.meta`, 'utf8')).uuid;
    sounds[name + 'Audio'] = ref(author.component(canvas, 'cc.AudioSource', { _clip: { __uuid__: clip, __expectedType__: 'cc.AudioClip' }, _loop: false, _playOnAwake: false, _volume: 0.65 }));
  }

  author.component(canvas, compressUuid(uuid('airdropRescueFeedGameScene.ts')), {
    surface: ref(surface), playfield: ref(playfield), hud: ref(hud), targetPool: targetPool.map(ref),
    departingPool: departingPool.map(ref), collectedPool: collectedPool.map(ref), swipeTrail: ref(swipeTrail),
    bottle: ref(bottle), bottleMouth: ref(bottleMouth), bottleInterior: ref(bottleInterior), pig: ref(pig),
    backButton: ref(backButton), titleLabel: ref(title.component), foodLabel: ref(food.component), chanceLabel: ref(chances.component),
    slowdownButton: ref(slowdownButton), slowdownSeconds: 20,
    resultOverlay: ref(overlay), resultTitle: ref(resultTitle.component), resultDetail: ref(resultDetail.component), reviveButton: ref(revive.component), replayButton: ref(replay.component), homeButton: ref(home.component),
    exitOverlay: ref(exitOverlay), continueButton: ref(resume.component), restartButton: ref(restart.component), exitButton: ref(exit.component), ...sounds,
  });

  objects[1]._globals = ref(appendSceneGlobals(source, objects));
  fitFeedResultOverlay(objects, 'AirdropRescueFeedGameScene');
  return objects;
}

function styleAirdropRescueCard(objects, card) {
  standardizeLobbyCard(objects, card, '空投救援');
  const mask = objects[card]._children.find(item => objects[item.__id__]._name === 'ArtworkMask').__id__;
  const artwork = objects[mask]._children.find(item => objects[item.__id__]._name === 'Artwork').__id__;
  // The common card helper creates a flat preview backing; keep this game's
  // complete thumbnail inside the shared frame instead.
  component(objects, artwork, 'cc.Sprite')._spriteFrame = {
    __uuid__: art('preview.jpg'), __expectedType__: 'cc.SpriteFrame',
  };
}

export function appendAirdropRescueCard(objects) {
  const controller = objects.find(item => item.gameList && item.puzzleButton);
  if (!controller) throw new Error('Missing lobby controller');
  const parentId = objects[controller.puzzleButton.__id__].node.__id__;
  const parent = objects[parentId]._parent.__id__;
  const existing = objects[parent]._children.find(item => objects[item.__id__]._name === 'AirdropRescueCard');
  if (existing) {
    styleAirdropRescueCard(objects, existing.__id__);
    return;
  }
  const author = new SceneAuthor(objects, 'airdropRescueLobby'); author.serial = objects.length;
  const index = objects[parent]._children.length;
  const card = author.node('AirdropRescueCard', parent, { x: index % 2 ? 139 : -139, y: -152 - Math.floor(index / 2) * 294, w: 252, h: 268 });
  for (const [name, x, y, w, h, color] of [['CardShadow', 6, -8, 256, 270, rgba(71, 184, 230, 205)], ['CardOutline', 0, 0, 256, 268, rgba(31, 29, 30)], ['CardSurface', 0, 0, 248, 260, rgba(255, 255, 251)]]) {
    const chrome = author.sprite(name, card, shared('newMain/card_round.png'), { x, y, w, h, color });
    component(objects, chrome, 'cc.Sprite')._type = 1;
  }
  author.sprite('Preview', card, art('preview.jpg'), { y: 25, w: 218, h: 177 });
  author.label('Title', card, '空投救援', { y: -94, w: 230, h: 60, size: 31 });
  controller.airdropRescueButton = ref(author.button(card));
  styleAirdropRescueCard(objects, card);
  const contentTransform = component(objects, parent, 'cc.UITransform');
  if (contentTransform) contentTransform._contentSize.height = 18 + Math.ceil((index + 1) / 2) * 294 - 26 + 14;
}
