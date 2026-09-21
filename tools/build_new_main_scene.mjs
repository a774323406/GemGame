// Offline scene authoring for the replacement lobby. Fixed UI is serialized
// into NewMainScene.scene so it remains editable in Cocos Creator.
import fs from 'node:fs';
import path from 'node:path';
import {
  SceneAuthor,
  compressUuid,
  ref,
  rgba,
  vec,
} from './penguin_scene_authoring.mjs';
import { appendSceneGlobals } from './feed_result_layout.mjs';
import { appendFoodDeliveryCard } from './food_delivery_authoring.mjs';
import { appendWhiteGooseCard } from './white_goose_main_card.mjs';

const SCENE_NAME = 'NewMainScene';
const SCENE_UUID = 'e2f66be5-60ce-4ebc-90a4-d99841dd2b9a';
const SCRIPT_UUID = '1f91d745-0c6d-4b9b-b7c7-83e4c5e7a912';
const BACKGROUND_UUID = '7e26244b-852b-46ce-8b26-8d2d5c6aa1b4';
const CARD_UUID = '8bd4684e-a0dc-41db-bd6f-1f06872c885d';
const DIRECTORY_UUID = '236e12de-b423-4e6d-9e7a-59e7d4fd1121';
const NEW_MAIN_ASSETS = [
  { name: 'title_select_game.png', uuid: 'fd89cd19-2298-4adb-becf-feea6cc2d5af', width: 512, height: 187, alpha: true },
  { name: 'card_title_blank.png', uuid: 'e625bd7b-cbf1-4b43-9552-b13edb0bc4f4', width: 300, height: 63, alpha: true },
  { name: 'preview_puzzle.jpg', uuid: 'bb2e83a4-eb22-435c-bb35-3a3256985701', width: 246, height: 198, alpha: false },
  { name: 'preview_penguin.jpg', uuid: '9ded1a28-be90-404f-84e3-7060e6f70b6a', width: 246, height: 198, alpha: false },
  { name: 'preview_shooting.jpg', uuid: '0026ad32-f309-4aee-89cb-c8c0fdc0a8a5', width: 246, height: 198, alpha: false },
  { name: 'preview_archery.jpg', uuid: '3a4af03d-e8e9-41c0-9257-19109c84d816', width: 246, height: 198, alpha: false },
  { name: 'preview_nail.jpg', uuid: '45b97611-636d-4e3e-886b-8530aa02a17a', width: 246, height: 198, alpha: false },
  { name: 'title_puzzle.jpg', uuid: '4d694c49-116b-4d23-a8ef-75cfb0c2a3e9', width: 268, height: 57, alpha: false },
  { name: 'title_penguin.jpg', uuid: 'a9b70d4b-74b0-491d-9570-f94539bc5110', width: 268, height: 57, alpha: false },
  { name: 'title_shooting.jpg', uuid: 'ac2d12f2-8c40-4fa0-8795-8e810a4939c8', width: 268, height: 57, alpha: false },
  { name: 'title_archery.jpg', uuid: '6c7a110b-ce40-473b-a49d-0b60aa513b42', width: 268, height: 57, alpha: false },
  { name: 'title_balloon.jpg', uuid: '3f6c3128-e02f-4191-8287-56f514f718e8', width: 268, height: 57, alpha: false },
  { name: 'title_nail.jpg', uuid: '1087d369-3c94-43ad-bae5-8579307f178e', width: 290, height: 64, alpha: false },
  { name: 'preview_border.png', uuid: '75720185-3cba-42e9-bfa6-155295a8045a', width: 10, height: 10, alpha: true },
];
const SCENE_FILE = `assets/gamescene/${SCENE_NAME}.scene`;
const ASSET_DIR = 'assets/res/newMain';
const BUTTON_SOUND_TYPE = '7a1a5iVpkNPsYcjs1PU1SS/';

const existingFrame = file => {
  const meta = JSON.parse(fs.readFileSync(`${file}.meta`, 'utf8'));
  return `${meta.uuid}@f9941`;
};

const newMainFrame = name => {
  const asset = NEW_MAIN_ASSETS.find(item => item.name === name);
  if (!asset) throw new Error(`Missing new-main asset declaration: ${name}`);
  return `${asset.uuid}@f9941`;
};

const art = {
  lobby: `${BACKGROUND_UUID}@f9941`,
  rounded: `${CARD_UUID}@f9941`,
  title: newMainFrame('title_select_game.png'),
  blankCardTitle: newMainFrame('card_title_blank.png'),
  previewPuzzle: newMainFrame('preview_puzzle.jpg'),
  previewPenguin: newMainFrame('preview_penguin.jpg'),
  previewShooting: newMainFrame('preview_shooting.jpg'),
  previewArchery: newMainFrame('preview_archery.jpg'),
  previewNail: newMainFrame('preview_nail.jpg'),
  titlePuzzle: newMainFrame('title_puzzle.jpg'),
  titlePenguin: newMainFrame('title_penguin.jpg'),
  titleShooting: newMainFrame('title_shooting.jpg'),
  titleArchery: newMainFrame('title_archery.jpg'),
  titleBalloon: newMainFrame('title_balloon.jpg'),
  titleNail: newMainFrame('title_nail.jpg'),
  previewBorder: newMainFrame('preview_border.png'),
  setting: existingFrame('assets/res/texture/设置按钮-最小.png'),
  share: existingFrame('assets/res/texture/UIs/share_main_icon.png'),
  shareDot: existingFrame('assets/res/texture/UIs/share_red_dot.png'),
  sidebar: existingFrame('assets/res/texture/Sidebar/sidebar_entry_icon.png'),
  balloonBackground: existingFrame('assets/res/balloonWheelFeed/background.jpg'),
  wheel: existingFrame('assets/res/balloonWheelFeed/wheel.png'),
  balloon: existingFrame('assets/res/balloonWheelFeed/balloon.png'),
};

const sourceScene = JSON.parse(
  fs.readFileSync('assets/gamescene/ArcheryGameScene.scene', 'utf8'),
);
const a = new SceneAuthor([], 'newMain');
const objects = a.objects;

function componentOf(nodeId, type) {
  return objects[nodeId]._components
    .map(item => objects[item.__id__])
    .find(item => item.__type__ === type);
}

function slicedSprite(name, parent, uuid, options = {}) {
  const node = a.sprite(name, parent, uuid, options);
  componentOf(node, 'cc.Sprite')._type = 1;
  return node;
}

function addButtonSound(node) {
  return a.component(node, BUTTON_SOUND_TYPE, {
    enableClickSound: true,
    onlyPlayWhenInteractable: true,
  });
}

function interactiveButton(node) {
  const button = a.button(node);
  addButtonSound(node);
  return button;
}

function artworkMask(parent, { y = 24, h = 164 } = {}) {
  const mask = a.node('ArtworkMask', parent, { y, w: 202, h });
  a.component(mask, 'cc.Mask', {
    _type: 0,
    _inverted: false,
    _segments: 64,
    _alphaThreshold: 0.1,
  });
  return mask;
}

function fullArtwork(mask, uuid, options = {}) {
  return a.sprite('Artwork', mask, uuid, {
    w: 202,
    h: 164,
    ...options,
  });
}

function addCard({
  nodeName,
  title,
  titleArt,
  titleY = -91,
  artworkY = 24,
  artworkHeight = 164,
  preview,
}) {
  const card = a.node(nodeName, content, { w: 252, h: 268 });
  const button = interactiveButton(card);

  slicedSprite('CardShadow', card, art.rounded, {
    x: 6,
    y: -8,
    w: 256,
    h: 270,
    color: rgba(71, 184, 230, 205),
  });
  slicedSprite('CardOutline', card, art.rounded, {
    w: 256,
    h: 268,
    color: rgba(31, 29, 30),
  });
  slicedSprite('CardSurface', card, art.rounded, {
    w: 248,
    h: 260,
    color: rgba(255, 255, 251),
  });

  // The small hanging loop mirrors the reference while remaining editable text.
  a.label('HangingLoop', card, '∩', {
    x: -101,
    y: 140,
    w: 40,
    h: 34,
    size: 34,
    color: rgba(40, 34, 31),
    outline: false,
    bold: true,
  });
  a.label('HangingPin', card, '●', {
    x: -112,
    y: 120,
    w: 20,
    h: 20,
    size: 15,
    color: rgba(40, 34, 31),
    outline: false,
  });

  a.sprite('ArtworkOutline', card, art.previewBorder, {
    y: artworkY,
    w: 210,
    h: artworkHeight + 8,
    color: rgba(43, 34, 34),
  });
  const mask = artworkMask(card, { y: artworkY, h: artworkHeight });
  preview(mask);

  const plaque = a.sprite('TitlePlaque', card, titleArt || art.blankCardTitle, {
    y: titleY,
    w: 216,
    h: 46,
  });
  if (!titleArt) {
    a.label('GameName', plaque, title, {
      w: 204,
      h: 42,
      size: title.length >= 6 ? 27 : 31,
      color: rgba(255, 251, 241),
      outlineColor: rgba(105, 55, 28),
      outlineWidth: 4,
    });
  }

  return { card, button };
}

objects.push({
  __type__: 'cc.SceneAsset',
  _name: SCENE_NAME,
  _objFlags: 0,
  __editorExtras__: {},
  _native: '',
  scene: ref(1),
});
objects.push({
  __type__: 'cc.Scene',
  _name: SCENE_NAME,
  _objFlags: 0,
  __editorExtras__: {},
  _parent: null,
  _children: [],
  _active: true,
  _components: [],
  _prefab: null,
  _lpos: vec(),
  _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
  _lscale: vec(1, 1, 1),
  _mobility: 0,
  _layer: 1073741824,
  _euler: vec(),
  autoReleaseAssets: false,
  _globals: null,
  _id: SCENE_UUID,
});

const canvas = a.node('Canvas', 1, { x: 375, y: 667, w: 750, h: 1334 });
const camera = a.node('Camera', canvas, { z: 1000, w: 1, h: 1 });
objects[camera]._layer = 1073741824;
const cameraTemplate = structuredClone(
  sourceScene.find(item => item.__type__ === 'cc.Camera'),
);
delete cameraTemplate.node;
delete cameraTemplate._id;
const cameraComponent = a.component(camera, 'cc.Camera', {
  ...cameraTemplate,
  _orthoHeight: 667,
});
a.component(canvas, 'cc.Canvas', {
  _cameraComponent: ref(cameraComponent),
  _alignCanvasWithScreen: true,
});
a.widget(canvas, 45);

const background = a.sprite('LobbyBackground', canvas, art.lobby, {
  w: 750,
  h: 1624,
});
// Serialized as Sprite Size Mode = TRIMMED. The top-center Widget only crops
// the 750x1624 artwork on shorter screens; it never stretches the bitmap.
componentOf(background, 'cc.Sprite')._sizeMode = 1;
a.widget(background, 18, { _top: 0 });

const settingNode = a.sprite('SettingButton', canvas, art.setting, {
  x: -311,
  y: 583,
  w: 88,
  h: 88,
});
a.widget(settingNode, 9, { _left: 24, _top: 22 });
// The reference suspends the settings medallion from two soft fabric cords.
a.sprite('RopeLeft', settingNode, art.rounded, {
  x: -10,
  y: 70,
  w: 4,
  h: 55,
  color: rgba(232, 205, 190),
});
a.sprite('RopeRight', settingNode, art.rounded, {
  x: 16,
  y: 70,
  w: 4,
  h: 55,
  color: rgba(232, 205, 190),
});
const settingButton = interactiveButton(settingNode);

const shareNode = a.sprite('ShareButton', canvas, art.share, {
  x: -312,
  y: 452,
  w: 84,
  h: 84,
});
a.widget(shareNode, 9, { _left: 21, _top: 120 });
const shareButton = interactiveButton(shareNode);
a.label('Caption', shareNode, '分享有礼', {
  x: -4,
  y: -61,
  w: 112,
  h: 43,
  size: 23,
  color: rgba(255, 255, 255),
  outlineColor: rgba(91, 37, 139),
  outlineWidth: 4,
});
const shareRedDot = a.sprite('ShareRedDot', shareNode, art.shareDot, {
  x: 35,
  y: 34,
  w: 34,
  h: 35,
});

const sidebarNode = a.sprite('SidebarButton', canvas, art.sidebar, {
  x: -312,
  y: 293,
  w: 92,
  h: 92,
});
a.widget(sidebarNode, 9, { _left: 17, _top: 250 });
const sidebarButton = interactiveButton(sidebarNode);
a.label('Caption', sidebarNode, '侧边栏有礼', {
  x: -7,
  y: -64,
  w: 115,
  h: 43,
  size: 21,
  color: rgba(255, 255, 255),
  outlineColor: rgba(91, 37, 139),
  outlineWidth: 4,
});

// ScrollView has no scrollbar by design. Its content is a fixed two-column grid.
const gameListNode = a.node('GameList', canvas, {
  x: 0,
  y: -124.165,
  w: 570,
  h: 990.33,
});
// Top + bottom constraints make the viewport gain the full extra height on
// tall phones. These are editor-authored Widget values, not runtime sizing.
a.widget(gameListNode, 21, {
  _top: 296,
  _bottom: 47.67,
  _originalWidth: 570,
  _originalHeight: 990.33,
});

// The user-authored title is intentionally parented to GameList. Its negative
// top inset keeps it above the mask while following the list on every height.
const titleRoot = a.sprite('TitlePlaque', gameListNode, art.title, {
  x: 0,
  y: 600.719,
  w: 348,
  h: 122,
});
a.widget(titleRoot, 17, { _top: -166.554 });

const view = a.node('View', gameListNode, { w: 570, h: 990.33 });
a.widget(view, 45, {
  _originalWidth: 570,
  _originalHeight: 990.33,
});
a.component(view, 'cc.Mask', {
  _type: 0,
  _inverted: false,
  _segments: 64,
  _alphaThreshold: 0.1,
});
const content = a.node('Content', view, {
  y: 495.165,
  w: 556,
  h: 888,
  ax: 0.5,
  ay: 1,
});
a.component(content, 'cc.Layout', {
  _layoutType: 3,
  _resizeMode: 1,
  _cellSize: { __type__: 'cc.Size', width: 252, height: 268 },
  _startAxis: 0,
  _paddingLeft: 13,
  _paddingRight: 13,
  _paddingTop: 18,
  _paddingBottom: 14,
  _spacingX: 26,
  _spacingY: 26,
  _verticalDirection: 1,
  _horizontalDirection: 0,
  _constraint: 2,
  _constraintNum: 2,
  _affectedByScale: false,
  _isAlign: true,
});

const cards = [];
cards.push(addCard({
  nodeName: 'PuzzleGameCard',
  title: '拼豆玩法',
  titleArt: art.titlePuzzle,
  preview: mask => fullArtwork(mask, art.previewPuzzle),
}));
cards.push(addCard({
  nodeName: 'PenguinStackCard',
  title: '企鹅叠叠乐',
  titleArt: art.titlePenguin,
  preview: mask => fullArtwork(mask, art.previewPenguin),
}));
cards.push(addCard({
  nodeName: 'ShootingGlassBottlesCard',
  title: '射击玻璃瓶',
  titleArt: art.titleShooting,
  preview: mask => fullArtwork(mask, art.previewShooting),
}));
cards.push(addCard({
  nodeName: 'ArcheryCard',
  title: '牛来神箭',
  titleArt: art.titleArchery,
  preview: mask => fullArtwork(mask, art.previewArchery),
}));
cards.push(addCard({
  nodeName: 'NailHammerCard',
  title: '敲钉子',
  titleArt: art.titleNail,
  preview: mask => fullArtwork(mask, art.previewNail),
}));
cards.push(addCard({
  nodeName: 'BalloonWheelCard',
  title: '打气球',
  titleArt: art.titleBalloon,
  preview: mask => {
    fullArtwork(mask, art.balloonBackground);
    a.sprite('Wheel', mask, art.wheel, { x: -14, y: -9, w: 151, h: 151 });
    a.sprite('BalloonOne', mask, art.balloon, { x: 78, y: 51, w: 37, h: 43, rotation: 10 });
    a.sprite('BalloonTwo', mask, art.balloon, {
      x: 83,
      y: -5,
      w: 32,
      h: 37,
      rotation: -9,
      color: rgba(207, 139, 255),
    });
  },
}));

// Seed the exact editor positions as well as Layout settings. Creator can
// immediately display the intended grid before or after Layout recalculation.
cards.forEach(({ card }, index) => {
  const column = index % 2;
  const row = Math.floor(index / 2);
  objects[card]._lpos = vec(column === 0 ? -139 : 139, -152 - row * 294, 0);
});

const gameList = a.component(gameListNode, 'cc.ScrollView', {
  _content: ref(content),
  horizontal: false,
  vertical: true,
  inertia: true,
  brake: 0.7,
  elastic: true,
  bounceDuration: 0.25,
  cancelInnerEvents: true,
  _horizontalScrollBar: null,
  _verticalScrollBar: null,
  scrollEvents: [],
});

// Keep scrolling cards behind the fixed header and reward entries. The mask
// starts just below the header while still leaving room for the first loops.
const canvasChildren = objects[canvas]._children;
const gameListChildIndex = canvasChildren.findIndex(child => child.__id__ === gameListNode);
const [gameListChild] = canvasChildren.splice(gameListChildIndex, 1);
const backgroundChildIndex = canvasChildren.findIndex(child => child.__id__ === background);
canvasChildren.splice(backgroundChildIndex + 1, 0, gameListChild);

a.component(canvas, compressUuid(SCRIPT_UUID), {
  settingButton: ref(settingButton),
  shareButton: ref(shareButton),
  sidebarButton: ref(sidebarButton),
  shareRedDot: ref(shareRedDot),
  gameList: ref(gameList),
  puzzleButton: ref(cards[0].button),
  penguinButton: ref(cards[1].button),
  shootingButton: ref(cards[2].button),
  archeryButton: ref(cards[3].button),
  nailHammerButton: ref(cards[4].button),
  balloonWheelButton: ref(cards[5].button),
});

objects[1]._globals = ref(appendSceneGlobals(sourceScene, objects));

function imageMeta({ name, uuid, width, height, alpha, border = 0 }) {
  const extension = path.extname(name);
  const displayName = path.parse(name).name;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  return {
    ver: '1.0.27',
    importer: 'image',
    imported: true,
    uuid,
    files: ['.json', extension],
    subMetas: {
      '6c48a': {
        ver: '1.0.22',
        importer: 'texture',
        imported: true,
        uuid: `${uuid}@6c48a`,
        displayName,
        id: '6c48a',
        name: 'texture',
        files: ['.json'],
        subMetas: {},
        userData: {
          wrapModeS: 'clamp-to-edge',
          wrapModeT: 'clamp-to-edge',
          imageUuidOrDatabaseUri: uuid,
          isUuid: true,
          visible: false,
          minfilter: 'linear',
          magfilter: 'linear',
          mipfilter: 'none',
          anisotropy: 0,
        },
      },
      f9941: {
        ver: '1.0.12',
        importer: 'sprite-frame',
        imported: true,
        uuid: `${uuid}@f9941`,
        displayName,
        id: 'f9941',
        name: 'spriteFrame',
        files: ['.json'],
        subMetas: {},
        userData: {
          trimType: 'none',
          trimThreshold: 1,
          rotated: false,
          offsetX: 0,
          offsetY: 0,
          trimX: 0,
          trimY: 0,
          width,
          height,
          rawWidth: width,
          rawHeight: height,
          borderTop: border,
          borderBottom: border,
          borderLeft: border,
          borderRight: border,
          packable: false,
          pixelsToUnit: 100,
          pivotX: 0.5,
          pivotY: 0.5,
          meshType: 0,
          vertices: {
            rawPosition: [
              -halfWidth, -halfHeight, 0,
              halfWidth, -halfHeight, 0,
              -halfWidth, halfHeight, 0,
              halfWidth, halfHeight, 0,
            ],
            indexes: [0, 1, 2, 2, 1, 3],
            uv: [0, height, width, height, 0, 0, width, 0],
            nuv: [0, 0, 1, 0, 0, 1, 1, 1],
            minPos: [-halfWidth, -halfHeight, 0],
            maxPos: [halfWidth, halfHeight, 0],
          },
          isUuid: true,
          imageUuidOrDatabaseUri: `${uuid}@6c48a`,
          atlasUuid: '',
        },
      },
    },
    userData: {
      type: 'sprite-frame',
      hasAlpha: alpha,
      fixAlphaTransparencyArtifacts: alpha,
      redirect: `${uuid}@6c48a`,
    },
  };
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

if (process.argv.includes('--write')) {
  const replace = process.argv.includes('--replace-scene');
  if (fs.existsSync(SCENE_FILE) && !replace) {
    throw new Error(`${SCENE_FILE} already exists; pass --replace-scene to update it.`);
  }
  // NewMainScene contains editor-authored layout adjustments. When it already
  // exists, update that serialized scene in place instead of regenerating its
  // unrelated nodes from this fallback authoring template.
  const outputObjects = fs.existsSync(SCENE_FILE)
    ? JSON.parse(fs.readFileSync(SCENE_FILE, 'utf8'))
    : objects;
  appendFoodDeliveryCard(outputObjects);
  appendWhiteGooseCard(outputObjects);
  writeJson(SCENE_FILE, outputObjects);
  if (!fs.existsSync(`${SCENE_FILE}.meta`)) {
    writeJson(`${SCENE_FILE}.meta`, {
      ver: '1.1.50',
      importer: 'scene',
      imported: true,
      uuid: SCENE_UUID,
      files: ['.json'],
      subMetas: {},
      userData: {},
    });
  }
  if (!fs.existsSync(`${ASSET_DIR}.meta`)) {
    writeJson(`${ASSET_DIR}.meta`, {
      ver: '1.2.0',
      importer: 'directory',
      imported: true,
      uuid: DIRECTORY_UUID,
      files: [],
      subMetas: {},
      userData: {},
    });
  }
  writeJson(
    `${ASSET_DIR}/main_lobby_background.jpg.meta`,
    imageMeta({
      name: 'main_lobby_background.jpg',
      uuid: BACKGROUND_UUID,
      width: 750,
      height: 1624,
      alpha: false,
    }),
  );
  if (!fs.existsSync(`${ASSET_DIR}/card_round.png.meta`)) {
    writeJson(
      `${ASSET_DIR}/card_round.png.meta`,
      imageMeta({
        name: 'card_round.png',
        uuid: CARD_UUID,
        width: 78,
        height: 78,
        alpha: true,
        border: 25,
      }),
    );
  }
  for (const asset of NEW_MAIN_ASSETS) {
    const file = `${ASSET_DIR}/${asset.name}`;
    if (!fs.existsSync(file)) {
      throw new Error(`Missing NewMainScene artwork: ${file}`);
    }
    writeJson(`${file}.meta`, imageMeta(asset));
  }
}

console.log(JSON.stringify({
  scene: SCENE_FILE,
  sceneUuid: SCENE_UUID,
  scriptType: compressUuid(SCRIPT_UUID),
  objects: process.argv.includes('--write')
    ? JSON.parse(fs.readFileSync(SCENE_FILE, 'utf8')).length
    : objects.length,
  wrote: process.argv.includes('--write'),
}));
