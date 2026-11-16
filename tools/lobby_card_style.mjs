// Upgrade appended lobby cards to the shared card chrome without changing their
// root/Button references or the surrounding editor-authored scene layout.
import fs from 'node:fs';
import { SceneAuthor, ref, rgba, vec } from './feed_scene_authoring.mjs';
const frame = file => `${JSON.parse(fs.readFileSync(`${file}.meta`)).uuid}@f9941`;
const duckTitleFrame = frame('assets/res/newMain/card_title_blank.png');
const component = (objects, node, type) => objects[node]._components
  .map(r => objects[r.__id__]).find(v => v.__type__ === type);
const child = (objects, node, name) => objects[node]._children
  .map(r => r.__id__).find(id => objects[id]._name === name);

function applySharedTitleBar(objects, plaque, a, title) {
  // Use the same plaque and label treatment as the duck challenge card. Old
  // game-specific title art and the extra fill sprite are no longer needed.
  const plaqueSprite = component(objects, plaque, 'cc.Sprite');
  if (plaqueSprite) plaqueSprite._spriteFrame = {
    __uuid__: duckTitleFrame, __expectedType__: 'cc.SpriteFrame',
  };
  const labelId = objects[plaque]._children
    .map(r => r.__id__)
    .find(id => component(objects, id, 'cc.Label') !== undefined);
  let gameName = labelId;
  if (gameName === undefined) {
    gameName = a.label('GameName', plaque, title || '', {
      w: 230, h: 54, size: 30, color: rgba(255, 255, 255),
      outlineColor: rgba(67, 42, 31), outlineWidth: 3,
    }).node;
  }
  const label = component(objects, gameName, 'cc.Label');
  const transform = component(objects, gameName, 'cc.UITransform');
  if (label) Object.assign(label, {
    _string: title || label._string,
    _actualFontSize: 30,
    _fontSize: 30,
    _lineHeight: 37.5,
    _color: rgba(255, 255, 255),
    _isBold: true,
    _enableOutline: true,
    _outlineColor: rgba(67, 42, 31),
    _outlineWidth: 3,
  });
  if (transform) transform._contentSize = { __type__: 'cc.Size', width: 230, height: 54 };
  objects[gameName]._name = 'GameName';
  objects[gameName]._parent = ref(plaque);
  objects[gameName]._lpos = vec(0, 0, 0);
  objects[plaque]._children = [ref(gameName)];
}

export function standardizeLobbyCard(objects, cardId, title) {
  // Preserve subsequent editor adjustments and make authoring repeatable.
  const existingPlaque = child(objects, cardId, 'TitlePlaque');
  if (existingPlaque !== undefined && child(objects, cardId, 'ArtworkMask') !== undefined) {
    applySharedTitleBar(objects, existingPlaque, new SceneAuthor(objects, `${objects[cardId]._name}Title`), title);
    return;
  }
  const preview = child(objects, cardId, 'Preview');
  const titleNode = child(objects, cardId, 'Title');
  if (preview === undefined || titleNode === undefined) throw new Error(`Incomplete lobby card: ${title}`);
  const a = new SceneAuthor(objects, `${objects[cardId]._name}Style`);
  for (const [oldName, name] of [['Shadow', 'CardShadow'], ['Outline', 'CardOutline'], ['Surface', 'CardSurface']]) {
    const id = child(objects, cardId, oldName);
    if (id !== undefined) objects[id]._name = name;
  }
  a.label('HangingLoop', cardId, '∩', { x: -101, y: 140, w: 40, h: 34, size: 34, color: rgba(40, 34, 31), outline: false });
  a.label('HangingPin', cardId, '●', { x: -112, y: 120, w: 20, h: 20, size: 15, color: rgba(40, 34, 31), outline: false });
  a.sprite('ArtworkOutline', cardId, frame('assets/res/newMain/preview_border.png'), {
    y: 24, w: 210, h: 172, color: rgba(43, 34, 34),
  });
  const mask = a.node('ArtworkMask', cardId, { y: 24, w: 202, h: 164 });
  a.component(mask, 'cc.Mask', { _type: 0, _inverted: false, _segments: 64, _alphaThreshold: 0.1 });
  const plaque = a.sprite('TitlePlaque', cardId, frame('assets/res/newMain/card_title_blank.png'), {
    y: -91, w: 216, h: 46,
  });
  objects[cardId]._children = objects[cardId]._children.filter(r => r.__id__ !== preview && r.__id__ !== titleNode);
  objects[mask]._children.push(ref(preview));
  Object.assign(objects[preview], { _name: 'Artwork', _parent: ref(mask), _lpos: vec(0, 0, 0) });
  Object.assign(component(objects, preview, 'cc.UITransform')._contentSize, { width: 202, height: 164 });
  // The shared frame supplies the border; the thumbnail background is flat.
  Object.assign(component(objects, preview, 'cc.Sprite'), {
    _spriteFrame: { __uuid__: frame('assets/res/foodDeliveryFeed/white.png'), __expectedType__: 'cc.SpriteFrame' },
    _type: 0,
  });
  objects[plaque]._children.push(ref(titleNode));
  Object.assign(objects[titleNode], { _name: 'GameName', _parent: ref(plaque), _lpos: vec(0, 0, 0) });
  Object.assign(component(objects, titleNode, 'cc.UITransform')._contentSize, { width: 204, height: 42 });
  Object.assign(component(objects, titleNode, 'cc.Label'), {
    _string: title, _fontSize: 31, _actualFontSize: 31, _lineHeight: 38.75,
    _color: rgba(255, 251, 241), _isBold: true, _enableOutline: true,
    _outlineColor: rgba(105, 55, 28), _outlineWidth: 4,
  });
  applySharedTitleBar(objects, plaque, a, title);
}

export function standardizeAllLobbyCards(objects) {
  const titles = {
    PuzzleGameCard: '拼豆玩法',
    DuckGrabCard: '抓鸭子挑战',
    FoodDeliveryCard: '外卖精准投送',
    BrickChopCard: '劈砖挑战',
    RopeDuckCard: '双鸭跳跃',
    JellyCrushCard: '果冻压压乐',
  };
  for (const [name, title] of Object.entries(titles)) {
    const cardId = objects.findIndex(item => item?.__type__ === 'cc.Node' && item._name === name);
    if (cardId >= 0) standardizeLobbyCard(objects, cardId, title);
  }
}
