import fs from 'node:fs';
import { SceneAuthor, ref, rgba } from './feed_scene_authoring.mjs';
import { standardizeLobbyCard } from './lobby_card_style.mjs';

const frame = file => `${JSON.parse(fs.readFileSync(`${file}.meta`, 'utf8')).uuid}@f9941`;
const component = (objects, node, type) => objects[node]._components
  .map(item => objects[item.__id__]).find(item => item.__type__ === type);
const child = (objects, node, name) => objects[node]._children
  .find(item => objects[item.__id__]._name === name).__id__;

/** Restore the existing ping-pong game without rebuilding the rest of the lobby. */
export function appendJuggleBallCard(objects) {
  const controller = objects.find(item => item.gameList && item.puzzleButton);
  if (!controller) throw new Error('Missing lobby controller');
  const puzzle = objects[controller.puzzleButton.__id__].node.__id__;
  const content = objects[puzzle]._parent.__id__;
  const existing = objects[content]._children.find(item => objects[item.__id__]._name === 'JuggleBallCard');
  if (existing) {
    controller.juggleButton = ref(objects.indexOf(component(objects, existing.__id__, 'cc.Button')));
    return;
  }

  const author = new SceneAuthor(objects, 'juggleBallLobby');
  author.serial = objects.length;
  const index = objects[content]._children.length;
  const card = author.node('JuggleBallCard', content, {
    x: index % 2 ? 139 : -139, y: -152 - Math.floor(index / 2) * 294, w: 252, h: 268,
  });
  for (const [name, x, y, w, h, color] of [
    ['CardShadow', 6, -8, 256, 270, rgba(71, 184, 230, 205)],
    ['CardOutline', 0, 0, 256, 268, rgba(31, 29, 30)],
    ['CardSurface', 0, 0, 248, 260, rgba(255, 255, 251)],
  ]) {
    const node = author.sprite(name, card, frame('assets/res/newMain/card_round.png'), { x, y, w, h, color });
    component(objects, node, 'cc.Sprite')._type = 1;
  }
  author.sprite('Preview', card, frame('assets/res/juggleBallGame/sky-background.jpg'), { y: 25, w: 218, h: 177 });
  author.label('Title', card, '乒乓球挑战', { y: -94, w: 230, h: 60, size: 31 });
  controller.juggleButton = ref(author.button(card));
  standardizeLobbyCard(objects, card, '乒乓球挑战');

  const mask = child(objects, card, 'ArtworkMask');
  const artwork = child(objects, mask, 'Artwork');
  component(objects, artwork, 'cc.Sprite')._spriteFrame = {
    __uuid__: frame('assets/res/juggleBallGame/sky-background.jpg'), __expectedType__: 'cc.SpriteFrame',
  };
  // Reuse the original paddle/ball icon; no new bitmap or gameplay asset is needed.
  author.sprite('PaddleAndBall', mask, frame('assets/res/juggleBallGame/main-entry-icon.png'), { w: 134, h: 150 });
  component(objects, content, 'cc.UITransform')._contentSize.height =
    18 + Math.ceil((index + 1) / 2) * 294 - 26 + 14;
}
