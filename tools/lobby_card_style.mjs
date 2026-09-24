// Upgrade appended lobby cards to the shared card chrome without changing their
// root/Button references or the surrounding editor-authored scene layout.
import fs from 'node:fs';
import { SceneAuthor, ref, rgba, vec } from './penguin_scene_authoring.mjs';
const frame = file => `${JSON.parse(fs.readFileSync(`${file}.meta`)).uuid}@f9941`;
const component = (objects, node, type) => objects[node]._components
  .map(r => objects[r.__id__]).find(v => v.__type__ === type);
const child = (objects, node, name) => objects[node]._children
  .map(r => r.__id__).find(id => objects[id]._name === name);

function applySharedTitleBar(objects, plaque, a) {
  if (child(objects, plaque, 'TitleFill') !== undefined) return;
  // Keep the same brush-shaped edge pixels as the existing title cards.
  // A flat UI fill replaces the baked caption underneath the editable label.
  component(objects, plaque, 'cc.Sprite')._spriteFrame = {
    __uuid__: frame('assets/res/newMain/title_white_goose.jpg'), __expectedType__: 'cc.SpriteFrame',
  };
  const fill = a.sprite('TitleFill', plaque, frame('assets/res/foodDeliveryFeed/white.png'), {
    w: 134, h: 41, color: rgba(248, 174, 48),
  });
  objects[plaque]._children = [ref(fill), ...objects[plaque]._children.filter(r => r.__id__ !== fill)];
}

export function standardizeLobbyCard(objects, cardId, title) {
  // Preserve subsequent editor adjustments and make authoring repeatable.
  const existingPlaque = child(objects, cardId, 'TitlePlaque');
  if (existingPlaque !== undefined && child(objects, cardId, 'ArtworkMask') !== undefined) {
    applySharedTitleBar(objects, existingPlaque, new SceneAuthor(objects, `${objects[cardId]._name}Title`));
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
  applySharedTitleBar(objects, plaque, a);
}
