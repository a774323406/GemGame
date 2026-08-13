import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scenePath = path.join(root, "assets/gamescene/ShootingGlassBottlesGame.scene");
const previous = JSON.parse(fs.readFileSync(scenePath, "utf8"));
const objects = [];
let serial = 0;

const ref = (id) => ({ __id__: id });
const uuidRef = (uuid, type = "cc.SpriteFrame") => ({
  __uuid__: uuid,
  __expectedType__: type,
});
const nextId = (prefix) => `${prefix}_${String(++serial).padStart(3, "0")}`;
const vec3 = (x = 0, y = 0, z = 0) => ({ __type__: "cc.Vec3", x, y, z });
const quat = () => ({ __type__: "cc.Quat", x: 0, y: 0, z: 0, w: 1 });
const color = (r, g, b, a = 255) => ({ __type__: "cc.Color", r, g, b, a });

function add(object) {
  const id = objects.length;
  objects.push(object);
  return id;
}

const sceneAssetId = add({
  __type__: "cc.SceneAsset",
  _name: "ShootingGlassBottlesGame",
  _objFlags: 0,
  __editorExtras__: {},
  _native: "",
  scene: ref(1),
});

const sceneId = add({
  __type__: "cc.Scene",
  _name: "ShootingGlassBottlesGame",
  _objFlags: 0,
  __editorExtras__: {},
  _parent: null,
  _children: [],
  _active: true,
  _components: [],
  _prefab: null,
  _lpos: vec3(),
  _lrot: quat(),
  _lscale: vec3(1, 1, 1),
  _mobility: 0,
  _layer: 1073741824,
  _euler: vec3(),
  autoReleaseAssets: false,
  _globals: null,
  _id: "5b031fbc-c698-4add-ae79-f39a1cfa3b8c",
});

function makeNode(name, parentId, { x = 0, y = 0, z = 0, width = 100, height = 100, active = true } = {}) {
  const id = add({
    __type__: "cc.Node",
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _parent: parentId === null ? ref(sceneId) : ref(parentId),
    _children: [],
    _active: active,
    _components: [],
    _prefab: null,
    _lpos: vec3(x, y, z),
    _lrot: quat(),
    _lscale: vec3(1, 1, 1),
    _mobility: 0,
    _layer: 33554432,
    _euler: vec3(),
    _id: nextId(`node_${name}`),
  });
  const parent = parentId === null ? objects[sceneId] : objects[parentId];
  parent._children.push(ref(id));
  addUITransform(id, width, height);
  return id;
}

function addComponent(nodeId, component) {
  const id = add(component);
  objects[nodeId]._components.push(ref(id));
  return id;
}

function addUITransform(nodeId, width, height, anchorX = 0.5, anchorY = 0.5) {
  return addComponent(nodeId, {
    __type__: "cc.UITransform",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: ref(nodeId),
    _enabled: true,
    __prefab: null,
    _contentSize: { __type__: "cc.Size", width, height },
    _anchorPoint: { __type__: "cc.Vec2", x: anchorX, y: anchorY },
    _id: nextId("transform"),
  });
}

function addSprite(nodeId, frameUuid, tint = color(255, 255, 255)) {
  return addComponent(nodeId, {
    __type__: "cc.Sprite",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: ref(nodeId),
    _enabled: true,
    __prefab: null,
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: tint,
    _spriteFrame: uuidRef(frameUuid),
    _type: 0,
    _fillType: 0,
    _sizeMode: 0,
    _fillCenter: { __type__: "cc.Vec2", x: 0, y: 0 },
    _fillStart: 0,
    _fillRange: 0,
    _isTrimmedMode: true,
    _useGrayscale: false,
    _atlas: null,
    _id: nextId("sprite"),
  });
}

function addButton(nodeId) {
  const buttonId = addComponent(nodeId, {
    __type__: "cc.Button",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: ref(nodeId),
    _enabled: true,
    __prefab: null,
    clickEvents: [],
    _interactable: true,
    _transition: 3,
    _normalColor: color(255, 255, 255),
    _hoverColor: color(255, 255, 255),
    _pressedColor: color(225, 225, 225),
    _disabledColor: color(124, 124, 124),
    _normalSprite: null,
    _hoverSprite: null,
    _pressedSprite: null,
    _disabledSprite: null,
    _duration: 0.1,
    _zoomScale: 0.92,
    _target: ref(nodeId),
    _id: nextId("button"),
  });
  addComponent(nodeId, {
    __type__: "7a1a5iVpkNPsYcjs1PU1SS/",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: ref(nodeId),
    _enabled: true,
    __prefab: null,
    enableClickSound: true,
    onlyPlayWhenInteractable: true,
    _id: nextId("buttonSound"),
  });
  return buttonId;
}

function addLabel(nodeId, text, {
  fontSize = 30,
  lineHeight = Math.round(fontSize * 1.2),
  textColor = color(255, 255, 255),
  horizontal = 1,
  vertical = 1,
  overflow = 2,
  wrap = false,
  bold = true,
  outline = true,
  outlineColor = color(93, 52, 25),
  outlineWidth = 4,
} = {}) {
  const labelId = addComponent(nodeId, {
    __type__: "cc.Label",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: ref(nodeId),
    _enabled: true,
    __prefab: null,
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: textColor,
    _string: text,
    _horizontalAlign: horizontal,
    _verticalAlign: vertical,
    _actualFontSize: fontSize,
    _fontSize: fontSize,
    _fontFamily: "Arial",
    _lineHeight: lineHeight,
    _overflow: overflow,
    _enableWrapText: wrap,
    _font: null,
    _isSystemFontUsed: true,
    _spacingX: 0,
    _isItalic: false,
    _isBold: bold,
    _isUnderline: false,
    _underlineHeight: 2,
    _cacheMode: 0,
    _enableOutline: outline,
    _outlineColor: outlineColor,
    _outlineWidth: outlineWidth,
    _enableShadow: false,
    _shadowColor: color(0, 0, 0),
    _shadowOffset: { __type__: "cc.Vec2", x: 2, y: 2 },
    _shadowBlur: 2,
    _id: nextId("label"),
  });
  if (outline) {
    addComponent(nodeId, {
      __type__: "cc.LabelOutline",
      _name: "",
      _objFlags: 0,
      __editorExtras__: {},
      node: ref(nodeId),
      _enabled: true,
      __prefab: null,
      _id: nextId("labelOutline"),
    });
  }
  return labelId;
}

function addOpacity(nodeId, opacity) {
  return addComponent(nodeId, {
    __type__: "cc.UIOpacity",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: ref(nodeId),
    _enabled: true,
    __prefab: null,
    _opacity: opacity,
    _id: nextId("opacity"),
  });
}

function addBlockInput(nodeId) {
  return addComponent(nodeId, {
    __type__: "cc.BlockInputEvents",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: ref(nodeId),
    _enabled: true,
    __prefab: null,
    _id: nextId("blockInput"),
  });
}

function makeSprite(name, parentId, frame, options = {}) {
  const node = makeNode(name, parentId, options);
  addSprite(node, frame, options.tint);
  return node;
}

function makeLabel(name, parentId, text, options = {}, nodeOptions = {}) {
  const node = makeNode(name, parentId, nodeOptions);
  const component = addLabel(node, text, options);
  return { node, component };
}

const frames = {
  background: "c9f3e35b-5f1f-5af0-a70e-6d5319741341@f9941",
  bottle: "5b990358-f4c5-5ccd-8df6-b600b3ff8b38@f9941",
  brokenBottle: "bfd54952-5a35-5d1c-98ea-07a1ea516cee@f9941",
  gun: "7ca739a0-c25b-57be-abd2-3f52cc69f6f5@f9941",
  rope: "9eaf3f42-d58a-5fa4-a532-b077bdaece20@f9941",
  crosshair: "dcf78474-76dc-5e7b-a59e-7290fc49cca5@f9941",
  bullet: "3591f63e-66f5-5297-bf2b-72d39a332765@f9941",
  hook: "f76e624e-e74f-5a63-9b55-69a8dac68796@f9941",
  shard: "62c80bdc-7397-5a10-8bb1-289504f47b50@f9941",
  muzzle: "662f5d8f-b70f-5954-98fe-003462746909@f9941",
  panel: "5840c5f8-1131-5512-ac4e-27fea0ee7064@f9941",
  successButton: "0dff928c-f9de-5357-ace4-2b810fc35af8@f9941",
  dim: "41d81ce5-66b4-5e09-ba6d-e2b9a72fb370@f9941",
  cartoonHeader: "46cdcf81-c8ef-51df-bd39-a1cd1a6bbe9d@f9941",
  cuteModal: "34944704-ec90-57b8-9b0c-129b4793ae54@f9941",
  adButton: "cb706d47-db4b-5f33-8cde-a6299daad9f5@f9941",
  rewardSquare: "bfd4538b-4561-42c5-a088-86ef042dbaeb@f9941",
  woodTitle: "4da1d5f0-714b-4a3e-8bf2-d3667160f7dc@f9941",
  setting: "59849e72-902f-4785-8d9d-73b108142815@f9941",
  clock: "5f62c161-6808-463c-b6fe-0cd108cae195@f9941",
  adBadge: "cf633ac8-e94b-4433-a837-05cc338157cd@f9941",
};

const canvas = makeNode("Canvas", null, { x: 375, y: 667, width: 750, height: 1334 });

const camera = makeNode("Camera", canvas, { z: 1000, width: 1, height: 1 });
objects[camera]._layer = 1073741824;
const cameraComponent = addComponent(camera, {
  __type__: "cc.Camera",
  _name: "",
  _objFlags: 0,
  __editorExtras__: {},
  node: ref(camera),
  _enabled: true,
  __prefab: null,
  _projection: 0,
  _priority: 0,
  _fov: 45,
  _fovAxis: 0,
  _orthoHeight: 667,
  _near: 0,
  _far: 2000,
  _color: color(0, 0, 0),
  _depth: 1,
  _stencil: 0,
  _clearFlags: 7,
  _rect: { __type__: "cc.Rect", x: 0, y: 0, width: 1, height: 1 },
  _aperture: 19,
  _shutter: 7,
  _iso: 0,
  _screenScale: 1,
  _visibility: 1108344832,
  _targetTexture: null,
  _postProcess: null,
  _usePostProcess: false,
  _cameraType: -1,
  _trackingType: 0,
  _id: nextId("camera"),
});

addComponent(canvas, {
  __type__: "cc.Canvas",
  _name: "",
  _objFlags: 0,
  __editorExtras__: {},
  node: ref(canvas),
  _enabled: true,
  __prefab: null,
  _cameraComponent: ref(cameraComponent),
  _alignCanvasWithScreen: true,
  _id: nextId("canvas"),
});
addComponent(canvas, {
  __type__: "cc.Widget",
  _name: "",
  _objFlags: 0,
  __editorExtras__: {},
  node: ref(canvas),
  _enabled: true,
  __prefab: null,
  _alignFlags: 45,
  _target: null,
  _left: 0,
  _right: 0,
  _top: 0,
  _bottom: 0,
  _horizontalCenter: 0,
  _verticalCenter: 0,
  _isAbsLeft: true,
  _isAbsRight: true,
  _isAbsTop: true,
  _isAbsBottom: true,
  _isAbsHorizontalCenter: true,
  _isAbsVerticalCenter: true,
  _originalWidth: 0,
  _originalHeight: 0,
  _alignMode: 2,
  _lockFlags: 0,
  _id: nextId("widget"),
});

makeSprite("Background", canvas, frames.background, { width: 750, height: 1334 });

const gameplayRoot = makeNode("GameplayRoot", canvas, { width: 750, height: 1334 });
const ropeLayer = makeNode("RopeLayer_Dynamic", gameplayRoot, { width: 750, height: 1334 });
const bottleLayer = makeNode("BottleLayer_Dynamic", gameplayRoot, { width: 750, height: 1334 });
const bottlePivot = makeNode("BottlePivot", gameplayRoot, { y: 345, width: 24, height: 24 });
const crosshair = makeSprite("Crosshair", gameplayRoot, frames.crosshair, { y: -55, width: 76, height: 76 });
const gun = makeSprite("Gun", gameplayRoot, frames.gun, { y: -535, width: 90, height: 253 });
const gunMuzzle = makeNode("MuzzlePoint", gun, { y: 126, width: 8, height: 8 });
const effectLayer = makeNode("EffectLayer_Dynamic", gameplayRoot, { width: 750, height: 1334 });

const topHud = makeNode("TopHUD", canvas, { width: 750, height: 1334 });
const settingButtonNode = makeSprite("SettingButton", topHud, frames.rewardSquare, { x: -310, y: 562, width: 92, height: 92 });
makeSprite("SettingIcon", settingButtonNode, frames.setting, { width: 58, height: 58 });
const settingButton = addButton(settingButtonNode);

const titlePanel = makeSprite("TitlePanel", topHud, frames.cartoonHeader, { x: 20, y: 567, width: 530, height: 132 });
const levelTitle = makeLabel("LevelTitleLabel", titlePanel, "第1关  小小神枪手", {
  fontSize: 42,
  lineHeight: 52,
  textColor: color(255, 255, 255),
  outlineColor: color(90, 49, 30),
  outlineWidth: 5,
}, { y: 3, width: 470, height: 64 });

const timerPanel = makeSprite("TimerPanel", topHud, frames.woodTitle, { y: 491, width: 210, height: 46 });
const countdown = makeLabel("CountdownLabel", timerPanel, "时间：48s", {
  fontSize: 28,
  lineHeight: 36,
  textColor: color(255, 255, 255),
  outlineColor: color(91, 48, 25),
  outlineWidth: 3,
}, { width: 180, height: 45 });

const gameTitle = makeSprite("GameTitlePanel", topHud, frames.woodTitle, { y: 445, width: 390, height: 70 });
makeLabel("GameTitleLabel", gameTitle, "打爆酒瓶", {
  fontSize: 32,
  lineHeight: 40,
  textColor: color(255, 255, 255),
  outlineColor: color(80, 43, 24),
  outlineWidth: 4,
}, { width: 300, height: 54 });

const score = makeLabel("ScoreLabel", topHud, "当前得分：\n0", {
  fontSize: 32,
  lineHeight: 40,
  textColor: color(255, 226, 65),
  horizontal: 0,
  vertical: 1,
  overflow: 0,
  wrap: true,
  outlineColor: color(89, 57, 22),
  outlineWidth: 4,
}, { x: -260, y: 340, width: 300, height: 92 });

const rewards = makeNode("RewardControls", canvas, { width: 750, height: 220, y: -550 });
const ammoDisplay = makeSprite("AmmoDisplay", rewards, frames.panel, { x: -245, y: 120, width: 235, height: 82 });
const ammoIcon = makeSprite("AmmoIcon", ammoDisplay, frames.bullet, { x: -45, width: 20, height: 52 });
const ammoLabel = makeLabel("AmmoLabel", ammoDisplay, "×13", {
  fontSize: 34,
  lineHeight: 42,
  textColor: color(255, 255, 255),
  outlineColor: color(96, 55, 25),
  outlineWidth: 4,
}, { x: 25, width: 100, height: 55 });

function makeRewardButton(name, x, iconFrame, iconSize, text) {
  const node = makeSprite(name, rewards, frames.rewardSquare, { x, y: 0, width: 96, height: 96 });
  const button = addButton(node);
  makeSprite("RewardIcon", node, iconFrame, { y: 9, width: iconSize[0], height: iconSize[1] });
  makeLabel("RewardLabel", node, text, {
    fontSize: 18,
    lineHeight: 23,
    textColor: color(255, 255, 255),
    outlineColor: color(90, 50, 25),
    outlineWidth: 3,
  }, { y: -30, width: 86, height: 27 });
  makeSprite("AdBadge", node, frames.adBadge, { x: 34, y: 35, width: 34, height: 34 });
  return { node, button };
}

const addTime = makeRewardButton("AddTimeButton", 190, frames.clock, [52, 52], "加时间");
const addAmmo = makeRewardButton("AddAmmoButton", 310, frames.bullet, [22, 56], "子弹×5");

const resultOverlay = makeNode("ResultOverlay", canvas, { width: 750, height: 1334, active: false });
const resultOpacity = addOpacity(resultOverlay, 0);
addBlockInput(resultOverlay);
makeSprite("DimBackground", resultOverlay, frames.dim, { width: 750, height: 1334 });
const resultPanel = makeSprite("CuteResultPanel", resultOverlay, frames.cuteModal, { y: 15, width: 680, height: 560 });
const resultTitle = makeLabel("ResultTitleLabel", resultPanel, "挑战成功", {
  fontSize: 50,
  lineHeight: 62,
  textColor: color(220, 87, 29),
  outlineColor: color(255, 244, 176),
  outlineWidth: 4,
}, { y: 150, width: 540, height: 80 });
const resultDetail = makeLabel("ResultDetailLabel", resultPanel, "", {
  fontSize: 29,
  lineHeight: 42,
  textColor: color(78, 48, 25),
  wrap: true,
  outline: false,
}, { y: 25, width: 540, height: 170 });

const resultAction = makeNode("ResultActionButton", resultPanel, { y: -155, width: 360, height: 100 });
const resultActionButton = addButton(resultAction);
const resultSuccessBackground = makeSprite("SuccessButtonBackground", resultAction, frames.successButton, { width: 310, height: 96 });
const resultAdBackground = makeSprite("AdButtonBackground", resultAction, frames.adButton, { width: 360, height: 100, active: false });
const resultAdBadge = makeSprite("AdBadge", resultAction, frames.adBadge, { x: -132, width: 54, height: 54, active: false });
const resultActionLabel = makeLabel("ResultActionLabel", resultAction, "下一关", {
  fontSize: 27,
  lineHeight: 34,
  textColor: color(255, 255, 255),
  outlineColor: color(135, 56, 39),
  outlineWidth: 3,
}, { x: 12, width: 290, height: 65 });

const scriptComponent = addComponent(canvas, {
  __type__: "0944aPYlMNGFKjM3TgiWahY",
  _name: "",
  _objFlags: 0,
  __editorExtras__: {},
  node: ref(canvas),
  _enabled: true,
  __prefab: null,
  shootingFrames: [
    uuidRef(frames.bottle),
    uuidRef(frames.brokenBottle),
    uuidRef(frames.rope),
    uuidRef(frames.bullet),
    uuidRef(frames.hook),
    uuidRef(frames.shard),
    uuidRef(frames.muzzle),
  ],
  shootingLevelConfig: uuidRef("32dd7370-66a3-4885-8a3d-fb2aae6bd35f", "cc.JsonAsset"),
  gameplayRoot: ref(gameplayRoot),
  ropeLayerNode: ref(ropeLayer),
  bottleLayerNode: ref(bottleLayer),
  effectLayerNode: ref(effectLayer),
  gunNode: ref(gun),
  gunMuzzleNode: ref(gunMuzzle),
  crosshairNode: ref(crosshair),
  bottlePivotNode: ref(bottlePivot),
  ammoIconNode: ref(ammoIcon),
  settingButton: ref(settingButton),
  addAmmoRewardButton: ref(addAmmo.button),
  addTimeRewardButton: ref(addTime.button),
  levelTitleLabel: ref(levelTitle.component),
  countdownLabel: ref(countdown.component),
  currentScoreLabel: ref(score.component),
  remainingAmmoLabel: ref(ammoLabel.component),
  resultOverlayNode: ref(resultOverlay),
  resultOverlayOpacity: ref(resultOpacity),
  resultTitleLabel: ref(resultTitle.component),
  resultDetailLabel: ref(resultDetail.component),
  resultActionButton: ref(resultActionButton),
  resultActionLabel: ref(resultActionLabel.component),
  resultSuccessBackground: ref(resultSuccessBackground),
  resultAdBackground: ref(resultAdBackground),
  resultAdBadge: ref(resultAdBadge),
  _id: nextId("shootingGame"),
});

// Reuse the valid Creator 3.8 scene-global payload and remap its object indices.
const oldGlobalsStart = previous.findIndex((item) => item.__type__ === "cc.SceneGlobals");
const newGlobalsStart = objects.length;
const remapGlobals = (value) => {
  if (Array.isArray(value)) return value.map(remapGlobals);
  if (!value || typeof value !== "object") return value;
  if (Object.keys(value).length === 1 && Number.isInteger(value.__id__) && value.__id__ >= oldGlobalsStart) {
    return ref(newGlobalsStart + value.__id__ - oldGlobalsStart);
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, remapGlobals(child)]));
};
for (const globalObject of previous.slice(oldGlobalsStart)) objects.push(remapGlobals(globalObject));
objects[sceneId]._globals = ref(newGlobalsStart);

if (sceneAssetId !== 0 || sceneId !== 1 || scriptComponent < 1) throw new Error("Scene index invariant failed");
fs.writeFileSync(scenePath, `${JSON.stringify(objects, null, 2)}\n`);
console.log(`Wrote ${scenePath} (${objects.length} serialized objects)`);
