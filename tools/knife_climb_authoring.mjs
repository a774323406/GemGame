import crypto from 'node:crypto';
import fs from 'node:fs';
import { SceneAuthor, compressUuid, copySubtree, ref, rgba, vec } from './feed_scene_authoring.mjs';
import { appendSceneGlobals, fitFeedResultOverlay } from './feed_result_layout.mjs';

const SCENE = 'KnifeClimbFeedGameScene';
export function uuid(name) {
  const hex = crypto.createHash('sha256').update('GemGame/knifeClimb/' + name).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export const SCENE_UUID = uuid(SCENE);

const art = name => uuid(name + '.png') + '@f9941';
const readScene = name => JSON.parse(fs.readFileSync('assets/gamescene/' + name + '.scene', 'utf8'));
const frame = path => JSON.parse(fs.readFileSync('assets/res/' + path + '.meta', 'utf8')).uuid + '@f9941';
const component = (objects, node, type) => objects[node]._components.find(r => objects[r.__id__].__type__ === type);
const child = (objects, node, name) => objects[node]._children.find(r => objects[r.__id__]._name === name).__id__;

export function buildKnifeClimbScene() {
  const duck = readScene('DuckGrabFeedGameScene');
  const author = new SceneAuthor([], 'knifeClimb');
  const objects = author.objects;
  author.add({ ...structuredClone(duck[0]), _name: SCENE });
  author.add({ ...structuredClone(duck[1]), _name: SCENE, _id: SCENE_UUID, _children: [], _components: [], _globals: null });
  const screen = { w: 750, h: 1624 };
  const canvas = author.node('Canvas', 1, { ...screen, x: 375, y: 812 });
  author.widget(canvas, 45);
  const camera = copySubtree(duck, author, canvas, 'Camera');
  author.component(canvas, 'cc.Canvas', { _cameraComponent: component(objects, camera, 'cc.Camera'), _alignCanvasWithScreen: true });

  const background = author.sprite('Background', canvas, art('background'), screen);
  author.widget(background, 45);
  const surface = author.node('TapSurface', canvas, screen);
  author.widget(surface, 45);

  // Only World moves with the climb. The camera, background, touch target and HUD remain fixed.
  const world = author.node('World', canvas, screen);
  const firstBladeY = -435, stepHeight = 124, firstStageCount = 12, lastStageCount = 35;
  const goalY = count => firstBladeY + (count - 1) * stepHeight + 96;
  const blades = Array.from({ length: lastStageCount }, (_, i) =>
    author.sprite('Blade' + (i + 1), world, art('knife'), {
      x: i === 0 ? -295 : -8, y: firstBladeY + i * stepHeight, w: 306, h: 60, ax: 0, ay: 1, active: i < 2,
    }));
  // The wall covers the embedded tips while the handles remain in front of the background.
  const wallSize = { w: 112, h: 2304, ax: 0, ay: 1 };
  const wall = author.sprite('Wall', world, art('wall'), { x: -375, y: goalY(firstStageCount), ...wallSize });
  // Stack native-size wood sections down to the bottom of the longest stage's starting view.
  const wallSections = Math.ceil((goalY(lastStageCount) + screen.h / 2) / wallSize.h);
  for (let i = 1; i < wallSections; i++) {
    author.sprite('WallSection' + (i + 1), wall, art('wall'), { y: -i * wallSize.h, ...wallSize });
  }
  const flag = author.sprite('Flag', world, art('flag'), { x: -357, y: goalY(firstStageCount), w: 124, h: 176, ax: 0, ay: 0 });
  const food = author.sprite('Food', world, art('food'), { x: -155, y: firstBladeY, w: 84, h: 188, ay: 0 });
  const apple = author.sprite('Apple', world, art('apple'), { x: -155, y: firstBladeY, w: 136, h: 142, ay: 0, active: false });
  const watermelon = author.sprite('Watermelon', world, art('watermelon'), { x: -155, y: firstBladeY, w: 154, h: 148, ay: 0, active: false });

  const hud = author.node('HUD', canvas, screen);
  author.widget(hud, 45);
  const back = copySubtree(duck, author, hud, 'BackButton');
  const header = author.node('TopHUD', hud, { w: 460, h: 148, y: 650 });
  author.widget(header, 17, { _top: 88 });
  const plaque = author.sprite('TitlePlaque', header, frame('juggleBallGame/title-plaque.png'), { y: 34, w: 430, h: 100 });
  const stage = author.label('GameTitle', plaque, '第1关 烤苕皮', { w: 350, h: 80, size: 48, color: rgba(255, 255, 250), outlineWidth: 5 });
  const timer = author.label('Timer', header, '操作时间：8秒', { x: -95, y: -49, w: 245, h: 51, size: 29 });
  const progress = author.label('Progress', header, '已插刀 1/12', { x: 125, y: -49, w: 170, h: 51, size: 27 });
  const hint = author.label('StartHint', hud, '看准时机，出刀。', {
    w: 540, h: 80, y: 250, size: 42, outlineWidth: 5,
  });
  const countdown = author.label('Countdown', hud, '3', {
    w: 152, h: 144, size: 100, lineHeight: 112, outlineWidth: 7, active: false,
  });
  const slow = copySubtree(readScene('FoodDeliveryFeedGameScene'), author, hud, 'SlowdownButton');
  // The short screen leaves 4 units between the two bounding boxes; the badge sits beyond the handle.
  objects[slow]._lpos = vec(287, -708);
  author.widget(slow, 36, { _right: 24, _bottom: 40 });

  const result = copySubtree(readScene('RopeDuckFeedGameScene'), author, canvas, 'ResultOverlay');
  const panel = child(objects, result, 'ResultPanel');
  const resultLabel = name => component(objects, child(objects, panel, name), 'cc.Label');
  objects[resultLabel('Kicker').__id__]._string = '绝不落地';
  objects[resultLabel('ResultDetail').__id__]._string = '已插刀 1/12';
  const next = author.sprite('NextButton', panel, frame('feedResult/button-green.png'), { y: -180, w: 470, h: 138, active: false });
  author.label('Caption', next, '下一关', { w: 390, h: 86, size: 52 });
  const nextButton = author.button(next);
  const pause = copySubtree(duck, author, canvas, 'ExitConfirmation');
  const button = (parent, name) => component(objects, child(objects, parent, name), 'cc.Button');
  author.component(canvas, compressUuid(uuid('knifeClimbFeedGameScene.ts')), {
    surface: ref(surface), world: ref(world), food: ref(food), apple: ref(apple), watermelon: ref(watermelon),
    hitFrames: ['food-hit', 'apple-hit', 'watermelon-hit'].map(name => ({ __uuid__: art(name), __expectedType__: 'cc.SpriteFrame' })),
    wall: ref(wall), flag: ref(flag), blades: blades.map(ref),
    hud: ref(hud), startHint: ref(hint.node), countdownLabel: ref(countdown.component), stageLabel: ref(stage.component), timerLabel: ref(timer.component), progressLabel: ref(progress.component),
    backButton: component(objects, back, 'cc.Button'), slowdownButton: component(objects, slow, 'cc.Button'),
    resultOverlay: ref(result), resultTitle: resultLabel('ResultTitle'), resultDetail: resultLabel('ResultDetail'),
    nextButton: ref(nextButton), reviveButton: button(panel, 'ReviveButton'), replayButton: button(panel, 'ReplayButton'), homeButton: button(panel, 'HomeButton'),
    exitOverlay: ref(pause), continueButton: button(pause, 'ContinueButton'), exitButton: button(pause, 'ExitButton'),
  });
  objects[1]._globals = ref(appendSceneGlobals(duck, objects));
  fitFeedResultOverlay(objects, SCENE);
  return objects;
}

export function appendKnifeClimbCard(objects) {
  const controller = objects.find(o => o.gameList && o.puzzleButton);
  const content = objects[objects[controller.puzzleButton.__id__].node.__id__]._parent.__id__;
  const children = objects[content]._children;
  const existing = children.find(r => objects[r.__id__]._name === 'KnifeClimbCard');
  if (existing) {
    controller.knifeClimbButton = component(objects, existing.__id__, 'cc.Button');
    return;
  }
  const author = new SceneAuthor(objects, 'knifeClimbLobby');
  const index = children.length;
  const card = copySubtree(objects, author, content, 'TruckStackCard');
  objects[card]._name = 'KnifeClimbCard';
  objects[card]._lpos = vec(index % 2 ? 139 : -139, -152 - Math.floor(index / 2) * 294);
  const artwork = child(objects, child(objects, card, 'ArtworkMask'), 'Artwork');
  objects[component(objects, artwork, 'cc.Sprite').__id__]._spriteFrame = { __uuid__: art('preview'), __expectedType__: 'cc.SpriteFrame' };
  const title = child(objects, child(objects, card, 'TitlePlaque'), 'GameName');
  objects[component(objects, title, 'cc.Label').__id__]._string = '绝不落地';
  controller.knifeClimbButton = component(objects, card, 'cc.Button');
  objects[component(objects, content, 'cc.UITransform').__id__]._contentSize.height = 18 + Math.ceil(children.length / 2) * 294 - 26 + 14;
}
