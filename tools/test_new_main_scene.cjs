const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(projectRoot, file), 'utf8');
const scene = JSON.parse(read('assets/gamescene/NewMainScene.scene'));

const SCRIPT_TYPE = '1f91ddFDG1Lm7fHg+TF56kS';
const SCENE_UUID = 'e2f66be5-60ce-4ebc-90a4-d99841dd2b9a';
const BACKGROUND_FRAME = '7e26244b-852b-46ce-8b26-8d2d5c6aa1b4@f9941';
const PREVIEW_BORDER_FRAME = '75720185-3cba-42e9-bfa6-155295a8045a@f9941';

const object = ref => scene[ref.__id__];
const nodes = scene
  .map((entry, id) => ({ entry, id }))
  .filter(({ entry }) => entry.__type__ === 'cc.Node');
const nodeByName = name => nodes.find(({ entry }) => entry._name === name);
const component = (nodeId, type) => scene[nodeId]._components
  .map(object)
  .find(entry => entry.__type__ === type);

assert.equal(scene[0].__type__, 'cc.SceneAsset');
assert.equal(scene[0]._name, 'NewMainScene');
assert.equal(scene[1].__type__, 'cc.Scene');
assert.equal(scene[1]._id, SCENE_UUID);

for (const [index, entry] of scene.entries()) {
  const walk = value => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== 'object') return;
    if (Number.isInteger(value.__id__)) {
      assert(value.__id__ >= 0 && value.__id__ < scene.length,
        `invalid __id__ ${value.__id__} from object ${index}`);
      return;
    }
    Object.values(value).forEach(walk);
  };
  walk(entry);
}

const canvas = nodeByName('Canvas');
assert(canvas, 'Canvas is missing');
const background = nodeByName('LobbyBackground');
assert(background, 'LobbyBackground is missing');
const backgroundTransform = component(background.id, 'cc.UITransform');
const backgroundSprite = component(background.id, 'cc.Sprite');
const backgroundWidget = component(background.id, 'cc.Widget');
assert.deepEqual(
  [backgroundTransform._contentSize.width, backgroundTransform._contentSize.height],
  [750, 1624],
  'long-screen background must use its native 750x1624 size',
);
assert.equal(backgroundSprite._spriteFrame.__uuid__, BACKGROUND_FRAME);
assert.equal(backgroundSprite._sizeMode, 1, 'LobbyBackground must use editor Sprite Size Mode = TRIMMED');
assert.equal(backgroundSprite._isTrimmedMode, true, 'LobbyBackground trim must stay enabled');
assert.equal(backgroundWidget._alignFlags, 18, 'background must stay top-centered without stretch constraints');
assert.equal(backgroundWidget._top, 0);

const controller = component(canvas.id, SCRIPT_TYPE);
assert(controller, 'newMainScene controller is missing');

const gameListNode = nodeByName('GameList');
assert(gameListNode, 'GameList is missing');
const titlePlaque = nodes.find(({ entry }) =>
  entry._name === 'TitlePlaque' && entry._parent.__id__ === gameListNode.id);
assert(titlePlaque, 'top title plaque is missing');
assert.equal(titlePlaque.entry._lpos.x, 0, 'title must be centered on GameList');
const titleWidget = component(titlePlaque.id, 'cc.Widget');
assert.equal(titleWidget._alignFlags, 17, 'title must follow the responsive list top and horizontal center');
assert.equal(titleWidget._top, -166.554);

const gameListTransform = component(gameListNode.id, 'cc.UITransform');
const gameListWidget = component(gameListNode.id, 'cc.Widget');
assert.equal(gameListWidget._alignFlags, 21, 'GameList must use top, bottom and center Widget constraints');
assert(gameListWidget._top >= 0 && gameListWidget._bottom >= 0,
  'GameList must keep non-negative safe-area insets');
const baseListHeight = 1334 - gameListWidget._top - gameListWidget._bottom;
const tallListHeight = 1624 - gameListWidget._top - gameListWidget._bottom;
assert(Math.abs(gameListTransform._contentSize.height - tallListHeight) < 0.001,
  'serialized editor layout must match the 750x1624 target');
assert(Math.abs(tallListHeight - baseListHeight - 290) < 0.001,
  'GameList must gain the complete long-screen height');
const scrollView = component(gameListNode.id, 'cc.ScrollView');
assert(scrollView, 'GameList must use ScrollView');
assert.equal(scrollView.horizontal, false);
assert.equal(scrollView.vertical, true);
assert.equal(scrollView.cancelInnerEvents, true);
assert.equal(scrollView._horizontalScrollBar, null);
assert.equal(scrollView._verticalScrollBar, null);
assert(!nodeByName('ScrollBar'), 'the new lobby must not contain a scrollbar');

const view = nodeByName('View');
const viewWidget = component(view.id, 'cc.Widget');
assert.equal(view.entry._parent.__id__, gameListNode.id);
assert.equal(viewWidget._alignFlags, 45, 'ScrollView mask must stretch with GameList');

const content = nodeByName('Content');
assert(content, 'Content is missing');
assert.equal(scrollView._content.__id__, content.id);
const layout = component(content.id, 'cc.Layout');
assert(layout, 'Content must use Layout');
assert.equal(layout._layoutType, 3);
assert.equal(layout._constraint, 2);
assert.equal(layout._constraintNum, 2);

const expectedCards = [
  'PuzzleGameCard',
  'PenguinStackCard',
  'ShootingGlassBottlesCard',
  'FoodDeliveryCard',
  'WhiteGooseCard',
  'MathExamCard',
  'RhythmCatCard',
  'MotoRaceCard',
];
const contentChildren = content.entry._children.map(object).map(node => node._name);
assert.deepEqual(contentChildren, expectedCards, 'game cards/order changed');
const contentTransform = component(content.id, 'cc.UITransform');
assert.equal(contentTransform._contentSize.height, 18 + Math.ceil(contentChildren.length / 2) * 294 - 26 + 14,
  'all two-column rows must be fully scrollable');
assert.deepEqual(
  [nodeByName('FoodDeliveryCard').entry._lpos.x, nodeByName('FoodDeliveryCard').entry._lpos.y],
  [139, -446],
  'the fourth card must complete the second row',
);
assert.deepEqual(
  [nodeByName('WhiteGooseCard').entry._lpos.x, nodeByName('WhiteGooseCard').entry._lpos.y],
  [-139, -740],
  'the fifth card must start the third row',
);

const buildSource = read('tools/build_new_main_scene.mjs');
const visibleStrings = scene
  .filter(item => typeof item?._string === 'string')
  .map(item => item._string);
for (const oldTitle of ['奶茶接接乐', '神箭手', '气球转盘']) {
  assert(!visibleStrings.includes(oldTitle) && !buildSource.includes(`title: '${oldTitle}'`),
    `old lobby title remains: ${oldTitle}`);
}

const artworkMasks = nodes.filter(({ entry }) => entry._name === 'ArtworkMask');
assert.equal(artworkMasks.length, expectedCards.length, 'each card needs one artwork mask');
for (const { id } of artworkMasks) {
  const transform = component(id, 'cc.UITransform');
  assert.deepEqual(
    [transform._contentSize.width, transform._contentSize.height],
    [202, 164],
    'all artwork viewports must use the same size',
  );
}

const artworkOutlines = nodes.filter(({ entry }) => entry._name === 'ArtworkOutline');
assert.equal(artworkOutlines.length, expectedCards.length, 'each card needs one artwork outline');
for (const { id } of artworkOutlines) {
  assert.equal(
    component(id, 'cc.Sprite')._spriteFrame.__uuid__,
    PREVIEW_BORDER_FRAME,
    'artwork outlines must not use a transparent rounded-corner texture',
  );
}

const buttonProperties = [
  'puzzleButton',
  'penguinButton',
  'shootingButton',
  'foodDeliveryButton',
  'whiteGooseButton',
  'mathExamButton',
  'rhythmCatButton',
  'motoRaceButton',
];
buttonProperties.forEach((property, index) => {
  const button = object(controller[property]);
  assert.equal(button.__type__, 'cc.Button', `${property} is not a Button`);
  assert.equal(scene[button.node.__id__]._name, expectedCards[index]);
});
assert(!('juggleButton' in controller), 'new lobby must not bind a juggle entry');
assert(!scene.some(item => item?._name === 'JuggleBallCard'), 'new lobby must not contain a juggle card');
const foodCard = nodeByName('FoodDeliveryCard');
const bottomTitleAssets = [
  ['FoodDeliveryCard', 'title_food_delivery.jpg'],
  ['WhiteGooseCard', 'title_white_goose.jpg'],
];
for (const [cardName, filename] of bottomTitleAssets) {
  const card = nodeByName(cardName);
  const plaque = card.entry._children.map(object).find(child => child._name === 'TitlePlaque');
  assert(plaque, `${cardName} title plaque is missing`);
  assert(!plaque._children.some(child => object(child)._name === 'GameName'),
    `${cardName} must use the same baked-title-image type as the other gameplay cards`);
  const metaPath = `assets/res/newMain/${filename}.meta`;
  assert(fs.existsSync(path.join(projectRoot, metaPath)), `${filename} metadata is missing`);
  const meta = JSON.parse(read(metaPath));
  const frame = meta.subMetas.f9941.userData;
  assert.equal(component(scene.indexOf(plaque), 'cc.Sprite')._spriteFrame.__uuid__, `${meta.uuid}@f9941`);
  assert.deepEqual([frame.rawWidth, frame.rawHeight], [268, 57],
    `${filename} must match the common gameplay-title dimensions`);
}
const foodMask = foodCard.entry._children.map(object).find(child => child._name === 'ArtworkMask');
const foodArtNames = foodMask._children.map(object).map(child => child._name);
assert.deepEqual(foodArtNames, ['Artwork', 'CourierPreview', 'OrderPreview']);
const whiteGooseCard = nodeByName('WhiteGooseCard');
const whiteGooseMask = whiteGooseCard.entry._children.map(object)
  .find(child => child._name === 'ArtworkMask');
const whiteGooseArtwork = whiteGooseMask._children.map(object)
  .find(child => child._name === 'Artwork');
assert.equal(
  component(scene.indexOf(whiteGooseArtwork), 'cc.Sprite')._spriteFrame.__uuid__,
  '9bc09818-0e84-5ea3-a1a0-42cca593f1bd@f9941',
  'white goose card must use its dedicated preview image',
);

for (const property of ['settingButton', 'shareButton', 'sidebarButton']) {
  assert.equal(object(controller[property]).__type__, 'cc.Button', `${property} is not bound`);
}
assert.equal(object(controller.shareRedDot)._name, 'ShareRedDot');
assert.equal(controller.gameList.__id__, scene.indexOf(scrollView));

const sceneMeta = JSON.parse(read('assets/gamescene/NewMainScene.scene.meta'));
assert.equal(sceneMeta.uuid, SCENE_UUID);
const backgroundMeta = JSON.parse(read('assets/res/newMain/main_lobby_background.jpg.meta'));
const backgroundFrame = backgroundMeta.subMetas.f9941.userData;
assert.deepEqual(
  [backgroundFrame.rawWidth, backgroundFrame.rawHeight],
  [750, 1624],
  'background import metadata must match the long-screen artwork',
);
const bundleSource = read('assets/scripts/framework/GameSceneBundle.ts');
assert(bundleSource.includes('Main = "NewMainScene"'));
assert(bundleSource.includes(`[GameSceneName.Main]: "${SCENE_UUID}"`));
assert(bundleSource.includes('WhiteGooseFeedGame = "WhiteGooseFeedGameScene"'));
assert(bundleSource.includes(
  '[GameSceneName.WhiteGooseFeedGame]: "ba4c8390-ece1-56f3-ae54-585950e78599"',
));
assert(!bundleSource.includes('LegacyMain'));

const controllerSource = read('assets/scripts/newMainScene.ts');
assert(controllerSource.includes('whiteGooseButton: Button = null'));
assert(controllerSource.includes(
  'this.whiteGooseButton?.node?.on(Button.EventType.CLICK, this.openWhiteGoose, this)',
));
assert(controllerSource.includes(
  'this.whiteGooseButton?.node?.off(Button.EventType.CLICK, this.openWhiteGoose, this)',
));
assert(controllerSource.includes('this.enterGame(GameSceneName.WhiteGooseFeedGame)'));

const loadingSource = read('assets/scripts/loadScene.ts');
assert(loadingSource.includes('feedEntry?.sceneName ?? GameSceneName.Main'));
assert(!loadingSource.includes('FIRST_DIRECT_GAME_ENTRY_KEY'));
assert(!loadingSource.includes('首次启动直接进入关卡'));

const rasterFiles = fs.readdirSync(path.join(projectRoot, 'assets/res/newMain'))
  .filter(filename => /\.(?:png|jpe?g)$/i.test(filename));
const rasterBytes = rasterFiles.reduce((total, filename) =>
  total + fs.statSync(path.join(projectRoot, 'assets/res/newMain', filename)).size, 0);
assert(rasterBytes < 1024 * 1024, `new lobby images exceed 1 MiB: ${rasterBytes}`);

const previewFiles = rasterFiles.filter(filename => /^preview_.*\.jpg$/i.test(filename));
assert.equal(previewFiles.length, 3, 'expected three extracted preview images');
for (const filename of previewFiles) {
  const meta = JSON.parse(read(`assets/res/newMain/${filename}.meta`));
  const frame = meta.subMetas.f9941.userData;
  assert.deepEqual(
    [frame.rawWidth, frame.rawHeight],
    [246, 198],
    `${filename} must use the common source size`,
  );
}

console.log(JSON.stringify({
  sceneObjects: scene.length,
  cards: expectedCards.length,
  columns: layout._constraintNum,
  scrollbars: 0,
  baseListHeight,
  tallListHeight,
  rasterBytes,
  legacyMainRemoved: true,
}, null, 2));
