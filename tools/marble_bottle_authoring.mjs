import crypto from 'node:crypto';
import fs from 'node:fs';
import { SceneAuthor, compressUuid, copySubtree, ref, rgba, vec } from './feed_scene_authoring.mjs';
import { appendSceneGlobals, fitFeedResultOverlay } from './feed_result_layout.mjs';

const SCENE = 'MarbleBottleFeedGameScene';
export function uuid(name) {
  const hex = crypto.createHash('sha256').update('GemGame/marbleBottle/' + name).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export const SCENE_UUID = uuid(SCENE);
const art = name => uuid(name + '.png') + '@f9941';
const readScene = name => JSON.parse(fs.readFileSync('assets/gamescene/' + name + '.scene', 'utf8'));
const frame = path => JSON.parse(fs.readFileSync('assets/res/' + path + '.meta', 'utf8')).uuid + '@f9941';
const component = (objects, node, type) => objects[node]._components.find(r => objects[r.__id__].__type__ === type);
const child = (objects, node, name) => objects[node]._children.find(r => objects[r.__id__]._name === name).__id__;

export function buildMarbleBottleScene() {
  const duck = readScene('DuckGrabFeedGameScene');
  const food = readScene('FoodDeliveryFeedGameScene');
  const author = new SceneAuthor([], 'marbleBottle');
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
  const bottle = author.sprite('Bottle', canvas, art('bottle'), { y: 177.5, w: 88, h: 315 });
  const cue = author.sprite('Cue', canvas, art('cue'), { y: -231, w: 22, h: 260 });
  const palette = [rgba(255, 105, 110), rgba(89, 190, 255), rgba(255, 197, 67), rgba(117, 218, 140), rgba(195, 130, 245)];
  const balls = Array.from({ length: 18 }, (_, i) =>
    author.sprite('Marble' + (i + 1), canvas, art('marble'), {
      x: 386 + 144 * i, y: -45, w: 22, h: 22, color: palette[i % palette.length],
    }));

  const hud = author.node('HUD', canvas, screen);
  author.widget(hud, 45);
  const back = copySubtree(duck, author, hud, 'BackButton');
  const header = author.node('TopHUD', hud, { w: 510, h: 152, y: 642 });
  author.widget(header, 17, { _top: 94 });
  const plaque = author.sprite('TitlePlaque', header, frame('newMain/card_title_blank.png'), { y: 38, w: 340, h: 83 });
  author.label('Goal', plaque, '打进10颗弹珠', { w: 312, h: 62, size: 36, color: rgba(43, 33, 26), outlineColor: rgba(255, 252, 235), outlineWidth: 3 });
  const score = author.label('CountLabel', header, '已进球 0/10', { x: -116, y: -44, w: 220, h: 56, size: 32 });
  const remaining = author.label('RemainingLabel', header, '剩余弹珠 18', { x: 118, y: -44, w: 228, h: 56, size: 32 });
  author.label('TapHint', hud, '看准时机，精准出杆', { y: -397, w: 410, h: 42, size: 24, color: rgba(102, 75, 41), outline: false });
  const slow = copySubtree(food, author, hud, 'SlowdownButton');
  objects[slow]._lpos = vec(0, -648);
  author.widget(slow, 20, { _bottom: 100 });

  const result = copySubtree(duck, author, canvas, 'ResultOverlay');
  const panel = child(objects, result, 'ResultPanel');
  const resultLabel = name => component(objects, child(objects, panel, name), 'cc.Label');
  objects[resultLabel('Kicker').__id__]._string = '弹珠入瓶';
  objects[resultLabel('ResultDetail').__id__]._string = '本次入瓶 0/10';
  const pause = copySubtree(duck, author, canvas, 'ExitConfirmation');
  const button = (parent, name) => component(objects, child(objects, parent, name), 'cc.Button');
  author.component(canvas, compressUuid(uuid('marbleBottleFeedGameScene.ts')), {
    surface: ref(surface), cue: ref(cue), bottle: ref(bottle), balls: balls.map(ref), hud: ref(hud),
    resultOverlay: ref(result), exitOverlay: ref(pause), countLabel: ref(score.component),
    remainingLabel: ref(remaining.component), resultTitle: resultLabel('ResultTitle'), resultDetail: resultLabel('ResultDetail'),
    backButton: component(objects, back, 'cc.Button'), slowdownButton: component(objects, slow, 'cc.Button'),
    replayButton: button(panel, 'ReplayButton'), homeButton: button(panel, 'HomeButton'),
    continueButton: button(pause, 'ContinueButton'), exitButton: button(pause, 'ExitButton'),
  });
  objects[1]._globals = ref(appendSceneGlobals(duck, objects));
  fitFeedResultOverlay(objects, SCENE);
  return objects;
}

export function appendMarbleBottleCard(objects) {
  const controller = objects.find(o => o.gameList && o.puzzleButton);
  const content = objects[objects[controller.puzzleButton.__id__].node.__id__]._parent.__id__;
  const children = objects[content]._children;
  const existing = children.find(r => objects[r.__id__]._name === 'MarbleBottleCard');
  if (existing) {
    controller.marbleBottleButton = component(objects, existing.__id__, 'cc.Button');
    return;
  }
  const author = new SceneAuthor(objects, 'marbleBottleLobby');
  const index = children.length;
  const card = copySubtree(objects, author, content, 'TruckStackCard');
  objects[card]._name = 'MarbleBottleCard';
  objects[card]._lpos = vec(index % 2 ? 139 : -139, -152 - Math.floor(index / 2) * 294);
  const mask = child(objects, card, 'ArtworkMask');
  const artNode = child(objects, mask, 'Artwork');
  objects[component(objects, artNode, 'cc.Sprite').__id__]._spriteFrame = { __uuid__: art('preview'), __expectedType__: 'cc.SpriteFrame' };
  const titleNode = child(objects, child(objects, card, 'TitlePlaque'), 'GameName');
  objects[component(objects, titleNode, 'cc.Label').__id__]._string = '弹珠入瓶';
  controller.marbleBottleButton = component(objects, card, 'cc.Button');
  objects[component(objects, content, 'cc.UITransform').__id__]._contentSize.height = 18 + Math.ceil(children.length / 2) * 294 - 26 + 14;
}
