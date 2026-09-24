// Non-destructive NewMainScene card appender for the white-goose game.
import { ref, vec } from './penguin_scene_authoring.mjs';

const WHITE_GOOSE_PREVIEW = '9bc09818-0e84-5ea3-a1a0-42cca593f1bd@f9941';
const WHITE_GOOSE_TITLE = '8ef97696-879e-43df-b9dc-42991bd5fedf@f9941';

function componentId(objects, nodeId, type) {
  return objects[nodeId]._components
    .map(item => item.__id__)
    .find(id => objects[id]?.__type__ === type);
}

function directChildId(objects, parentId, name) {
  return objects[parentId]._children
    .map(item => item.__id__)
    .find(id => objects[id]?._name === name);
}

function collectNodeSubtree(objects, rootId, result = []) {
  result.push(rootId);
  for (const component of objects[rootId]._components || []) result.push(component.__id__);
  for (const child of objects[rootId]._children || []) {
    collectNodeSubtree(objects, child.__id__, result);
  }
  return result;
}

function remapReferences(value, idMap) {
  if (Array.isArray(value)) {
    for (const item of value) remapReferences(item, idMap);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Number.isInteger(value.__id__) && idMap.has(value.__id__)) {
    value.__id__ = idMap.get(value.__id__);
  }
  for (const item of Object.values(value)) remapReferences(item, idMap);
}

function cloneNodeSubtree(objects, rootId, idPrefix) {
  const sourceIds = collectNodeSubtree(objects, rootId);
  const idMap = new Map(sourceIds.map((id, offset) => [id, objects.length + offset]));
  for (const sourceId of sourceIds) {
    const clone = structuredClone(objects[sourceId]);
    remapReferences(clone, idMap);
    if (typeof clone._id === 'string') clone._id = `${idPrefix}_${idMap.get(sourceId)}`;
    objects.push(clone);
  }
  return idMap.get(rootId);
}

function setSpriteFrame(objects, nodeId, uuid) {
  const sprite = objects[componentId(objects, nodeId, 'cc.Sprite')];
  sprite._spriteFrame = {
    __uuid__: uuid,
    __expectedType__: 'cc.SpriteFrame',
  };
}

function setContentHeight(objects, contentId, cardCount) {
  const rowCount = Math.ceil(cardCount / 2);
  const transform = objects[componentId(objects, contentId, 'cc.UITransform')];
  transform._contentSize.height = 18 + rowCount * 268 + (rowCount - 1) * 26 + 14;
}

export function appendWhiteGooseCard(objects) {
  const canvasId = objects.findIndex(item => item?.__type__ === 'cc.Node' && item._name === 'Canvas');
  const gameListId = directChildId(objects, canvasId, 'GameList');
  const viewId = directChildId(objects, gameListId, 'View');
  const contentId = directChildId(objects, viewId, 'Content');
  if ([canvasId, gameListId, viewId, contentId].some(id => !Number.isInteger(id) || id < 0)) {
    throw new Error('NewMainScene Canvas/GameList/View/Content hierarchy is incomplete');
  }

  const controller = objects.find(item =>
    item?.node?.__id__ === canvasId && item?.puzzleButton && item?.shootingButton && item?.gameList);
  if (!controller) throw new Error('NewMainScene controller is missing');

  const content = objects[contentId];
  const existingCardId = content._children
    .map(item => item.__id__)
    .find(id => objects[id]?._name === 'WhiteGooseCard');
  if (Number.isInteger(existingCardId)) {
    const titlePlaqueId = directChildId(objects, existingCardId, 'TitlePlaque');
    setSpriteFrame(objects, titlePlaqueId, WHITE_GOOSE_TITLE);
    objects[titlePlaqueId]._children = [];
    const existingButtonId = componentId(objects, existingCardId, 'cc.Button');
    controller.whiteGooseButton = ref(existingButtonId);
    setContentHeight(objects, contentId, content._children.length);
    return existingButtonId;
  }

  const sourceCardId = content._children
    .map(item => item.__id__)
    .find(id => objects[id]?._name === 'PuzzleGameCard');
  if (!Number.isInteger(sourceCardId)) throw new Error('NewMainScene source card is missing');

  const cardId = cloneNodeSubtree(objects, sourceCardId, 'whiteGooseCard');
  const card = objects[cardId];
  card._name = 'WhiteGooseCard';
  card._parent = ref(contentId);
  card._lpos = vec(139, -1034, 0);
  content._children.push(ref(cardId));

  const buttonId = componentId(objects, cardId, 'cc.Button');
  objects[buttonId].clickEvents = [];
  objects[buttonId]._clickEvents = [];

  const artworkMaskId = directChildId(objects, cardId, 'ArtworkMask');
  const artworkId = directChildId(objects, artworkMaskId, 'Artwork');
  setSpriteFrame(objects, artworkId, WHITE_GOOSE_PREVIEW);

  const titlePlaqueId = directChildId(objects, cardId, 'TitlePlaque');
  setSpriteFrame(objects, titlePlaqueId, WHITE_GOOSE_TITLE);
  objects[titlePlaqueId]._children = [];

  setContentHeight(objects, contentId, content._children.length);
  controller.whiteGooseButton = ref(buttonId);
  return buttonId;
}
