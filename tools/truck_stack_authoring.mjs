import fs from 'node:fs';
import {SceneAuthor, compressUuid, ref, rgba} from './feed_scene_authoring.mjs';
import {appendSceneGlobals, fitFeedResultOverlay} from './feed_result_layout.mjs';
import {standardizeLobbyCard} from './lobby_card_style.mjs';
import {uuid, SCENE_UUID} from './truck_stack_ids.mjs';
export {uuid, SCENE_UUID};
const frame = path => JSON.parse(fs.readFileSync(path + '.meta')).uuid + '@f9941';
const art = name => frame('assets/res/truckStackFeed/' + name);
const white = () => frame('assets/res/foodDeliveryFeed/white.png');
const comp = (objects, node, type) => objects[node]._components.map(r => objects[r.__id__]).find(v => v.__type__ === type);

export function buildTruckStackScene() {
  const source = JSON.parse(fs.readFileSync('assets/gamescene/FoodDeliveryFeedGameScene.scene'));
  const a = new SceneAuthor([], 'truckStack'), o = a.objects;
  a.add({__type__: 'cc.SceneAsset', _name: 'TruckStackFeedGameScene', _objFlags: 0, __editorExtras__: {}, _native: '', scene: ref(1)});
  a.add({...structuredClone(source[1]), _name: 'TruckStackFeedGameScene', _children: [], _components: [], _globals: null, _id: SCENE_UUID});
  const canvas = a.node('Canvas', 1, {x: 375, y: 812, w: 750, h: 1624});
  a.widget(canvas, 45);
  const camera = a.node('Camera', canvas, {z: 1000, w: 1, h: 1}); o[camera]._layer = 1073741824;
  const cameraData = structuredClone(source.find(v => v.__type__ === 'cc.Camera'));
  delete cameraData.node; delete cameraData._id;
  const cameraId = a.component(camera, 'cc.Camera', {...cameraData, _orthoHeight: 812, _color: rgba(250, 247, 239)});
  a.component(canvas, 'cc.Canvas', {_cameraComponent: ref(cameraId), _alignCanvasWithScreen: true});
  const bg = a.sprite('CreamBackground', canvas, white(), {w: 750, h: 1624, color: rgba(250, 247, 239)}); a.widget(bg, 45);
  const surface = a.node('TouchSurface', canvas, {w: 750, h: 1624}); a.widget(surface, 45);
  const clouds = [0, 1, 2].map(i => a.sprite('Cloud' + i, canvas, art('cloud.png'), {w: 220, h: 86}));
  const drawing = name => {
    const n = a.node(name, canvas, {w: 750, h: 1624}); a.widget(n, 45);
    return a.component(n, 'cc.Graphics', {_lineWidth: 3, _strokeColor: rgba(40, 41, 32), _fillColor: rgba(), _lineJoin: 2, _lineCap: 1, _miterLimit: 10});
  };
  const scenery = drawing('RoadAndGrass');
  const truck = a.sprite('Truck', canvas, art('truck.png'), {x: 72, y: -479.4, w: 640, h: 228, sx: .9, sy: .9});
  const rope = drawing('SwingRope');
  const boxNodes = Array.from({length: 18}, (_, i) => a.sprite('StackBox' + i, canvas, art('box.png'), {y: -337 + i * 124, w: 276, h: 124, active: i === 0}));
  const heldBox = a.sprite('HeldBox', canvas, art('box.png'), {y: 73, w: 276, h: 124});
  const effects = drawing('LandingDust');
  const hud = a.node('HUD', canvas, {w: 750, h: 1624}); a.widget(hud, 45);
  const back = a.sprite('BackButton', hud, frame('assets/res/foodDeliveryFeed/back.png'), {w: 76, h: 76}); a.widget(back, 9, {_left: 24, _top: 80});
  const height = a.label('Height', hud, '1 米', {w: 180, h: 54, size: 42, align: 0, outlineWidth: 3, outlineColor: rgba(48, 43, 35)}); a.widget(height.node, 9, {_left: 128, _top: 78});
  const best = a.label('Best', hud, '最高 1 米', {w: 148, h: 28, size: 22, align: 0, color: rgba(118, 93, 66), outline: false}); a.widget(best.node, 9, {_left: 128, _top: 136});
  const hint = a.label('Hint', hud, '', {w: 640, h: 40, size: 26, color: rgba(91, 77, 57), outlineWidth: 3, outlineColor: rgba(250, 247, 239)}); a.widget(hint.node, 20, {_bottom: 260});
  const slow = a.sprite('SlowdownButton', hud, frame('assets/res/juggleBallGame/slowdown-button.png'), {w: 128, h: 128}); a.widget(slow, 20, {_bottom: 108});
  const slowLabel = a.label('Caption', slow, '减速', {y: -39, w: 100, h: 42, size: 28});
  const foodBadgeId = source.findIndex(v => v.__type__ === 'cc.Node' && v._name === 'SlowdownAdBadge');
  const foodBadge = source[foodBadgeId], foodBadgeSprite = comp(source, foodBadgeId, 'cc.Sprite');
  const badgeSize = comp(source, foodBadgeId, 'cc.UITransform')._contentSize;
  const slowBadge = a.sprite('SlowdownAdBadge', slow, foodBadgeSprite._spriteFrame.__uuid__, {
    x: foodBadge._lpos.x, y: foodBadge._lpos.y, w: badgeSize.width, h: badgeSize.height,
  });
  comp(o, slowBadge, 'cc.Sprite')._sizeMode = foodBadgeSprite._sizeMode;
  a.component(slowBadge, 'cc.UIOpacity', {_opacity: comp(source, foodBadgeId, 'cc.UIOpacity')?._opacity ?? 255});

  function button(parent, name, caption, y) {
    const n = a.sprite(name, parent, frame('assets/res/feedResult/button-orange.png'), {y, w: 470, h: 138});
    a.label('Caption', n, caption, {w: 405, h: 82, size: 44});
    return {node: n, component: a.button(n)};
  }
  const overlay = a.node('ResultOverlay', canvas, {w: 750, h: 1624, active: false});
  a.sprite('ResultDim', overlay, white(), {w: 750, h: 1624, color: rgba(0, 0, 0, 145)});
  const panel = a.node('ResultPanel', overlay, {w: 750, h: 1624});
  a.label('Kicker', panel, '货车叠叠高', {y: 550, w: 650, h: 65, size: 42});
  const resultTitle = a.label('ResultTitle', panel, '挑战失败', {y: 400, w: 620, h: 165, size: 104});
  const detail = a.label('ResultDetail', panel, '本次高度 1 米\n最高纪录 1 米', {y: 140, w: 660, h: 240, size: 40, wrap: true});
  const revive = button(panel, 'ReviveButton', '复活继续', -180);
  a.sprite('ReviveAdBadge', revive.node, frame('assets/res/feedShared/video-badge.png'), {x: -145, w: 72, h: 52});
  const replay = button(panel, 'ReplayButton', '重新挑战', -345);
  const home = button(panel, 'HomeButton', '返回主页', -510);
  const exitOverlay = a.node('ExitConfirmation', canvas, {w: 750, h: 1624, active: false}); a.widget(exitOverlay, 45); a.component(exitOverlay, 'cc.BlockInputEvents', {});
  const dim = a.sprite('ExitDim', exitOverlay, white(), {w: 750, h: 1624, color: rgba(0, 0, 0, 145)}); a.widget(dim, 45);
  const pauseTitle = a.label('PauseTitle', exitOverlay, '游戏暂停', {w: 650, h: 120, size: 80, outlineWidth: 5});
  const pauseDetail = a.label('PauseDetail', exitOverlay, '继续挑战，还是重新开始？', {w: 650, h: 90, size: 36});
  const resume = button(exitOverlay, 'ContinueButton', '继续游戏', 20);
  const restart = button(exitOverlay, 'RestartButton', '重新开始', -155);
  const exit = button(exitOverlay, 'ExitButton', '退出本局', -330);
  for (const [n, y] of [[pauseTitle.node, 340], [pauseDetail.node, 200], [resume.node, 20], [restart.node, -155], [exit.node, -330]]) a.widget(n, 18, {_verticalCenter: y / 1334, _isAbsVerticalCenter: false});
  const sounds = {};
  for (const [name, file] of [['drop', 'jump'], ['land', 'land'], ['perfect', 'pickup'], ['fall', 'fall']]) {
    const clip = JSON.parse(fs.readFileSync('assets/res/ropeDuckFeed/' + file + '.wav.meta')).uuid;
    sounds[name + 'Audio'] = ref(a.component(canvas, 'cc.AudioSource', {_clip: {__uuid__: clip, __expectedType__: 'cc.AudioClip'}, _loop: false, _playOnAwake: false, _volume: .6}));
  }
  a.component(canvas, compressUuid(uuid('truckStackFeedGameScene.ts')), {
    surface: ref(surface), hud: ref(hud), truck: ref(truck), heldBox: ref(heldBox), boxNodes: boxNodes.map(ref), clouds: clouds.map(ref),
    scenery: ref(scenery), rope: ref(rope), effects: ref(effects), heightLabel: ref(height.component), bestLabel: ref(best.component), hintLabel: ref(hint.component),
    slowdownLabel: ref(slowLabel.component), backButton: ref(a.button(back)), slowdownButton: ref(a.button(slow)),
    resultOverlay: ref(overlay), resultTitle: ref(resultTitle.component), resultDetail: ref(detail.component), reviveButton: ref(revive.component), replayButton: ref(replay.component), homeButton: ref(home.component),
    exitOverlay: ref(exitOverlay), continueButton: ref(resume.component), restartButton: ref(restart.component), exitButton: ref(exit.component), ...sounds,
  });
  o[1]._globals = ref(appendSceneGlobals(source, o));
  fitFeedResultOverlay(o, 'TruckStackFeedGameScene');
  // Endless mode only has failure results; its first enabled frame must already
  // show the failure artwork before the shared presentation callback runs.
  const heading = o.findIndex(v => v.__type__ === 'cc.Node' && v._name === 'ResultHeadingArtwork');
  comp(o, heading, 'cc.Sprite')._spriteFrame = {__uuid__: frame('assets/res/feedResult/title-failure.png'), __expectedType__: 'cc.SpriteFrame'};
  return o;
}

export function appendTruckStackCard(o) {
  const controller = o.find(v => v.gameList && v.puzzleButton);
  if (!controller) throw Error('Missing lobby controller');
  const parent = o[o[controller.puzzleButton.__id__].node.__id__]._parent.__id__;
  if (o[parent]._children.some(r => o[r.__id__]._name === 'TruckStackCard')) return;
  const a = new SceneAuthor(o, 'truckStackLobby'); a.serial = o.length;
  const index = o[parent]._children.length;
  const card = a.node('TruckStackCard', parent, {x: index % 2 ? 139 : -139, y: -152 - Math.floor(index / 2) * 294, w: 252, h: 268});
  for (const [name, x, y, w, h, color] of [['CardShadow', 6, -8, 256, 270, rgba(71, 184, 230, 205)], ['CardOutline', 0, 0, 256, 268, rgba(31, 29, 30)], ['CardSurface', 0, 0, 248, 260, rgba(255, 255, 251)]]) {
    const n = a.sprite(name, card, frame('assets/res/newMain/card_round.png'), {x, y, w, h, color}); comp(o, n, 'cc.Sprite')._type = 1;
  }
  a.sprite('Preview', card, art('lobby.png'), {y: 25, w: 218, h: 177});
  a.label('Title', card, '货车叠叠高', {y: -94, w: 230, h: 60, size: 31});
  controller.truckStackButton = ref(a.button(card));
  standardizeLobbyCard(o, card, '货车叠叠高');
  const mask = o[card]._children.find(r => o[r.__id__]._name === 'ArtworkMask').__id__;
  const artwork = o[mask]._children.find(r => o[r.__id__]._name === 'Artwork').__id__;
  comp(o, artwork, 'cc.Sprite')._spriteFrame = {__uuid__: art('lobby.png'), __expectedType__: 'cc.SpriteFrame'};
  comp(o, parent, 'cc.UITransform')._contentSize.height = 18 + Math.ceil((index + 1) / 2) * 294 - 26 + 14;
}
