import fs from "node:fs";
import path from "node:path";
import { appendSceneGlobals, fitFeedResultOverlay } from "./feed_result_layout.mjs";

const root = process.cwd();
const scenePath = path.join(root, "assets/gamescene/NailHammerFeedGameScene.scene");
const globalsSourcePath = path.join(root, "assets/gamescene/PenRefillFeedGameScene.scene");
const mainScenePath = path.join(root, "assets/gamescene/MainScene.scene");
const sourceScene = JSON.parse(fs.readFileSync(globalsSourcePath, "utf8"));
const objects = [];
let serial = 0;

const ref = (id) => ({ __id__: id });
const uuidRef = (uuid, type = "cc.SpriteFrame") => ({ __uuid__: uuid, __expectedType__: type });
const vec3 = (x = 0, y = 0, z = 0) => ({ __type__: "cc.Vec3", x, y, z });
const quat = () => ({ __type__: "cc.Quat", x: 0, y: 0, z: 0, w: 1 });
const quatZ = (degrees = 0) => {
  const halfRadians = degrees * Math.PI / 360;
  return { __type__: "cc.Quat", x: 0, y: 0, z: Math.sin(halfRadians), w: Math.cos(halfRadians) };
};
const color = (r, g, b, a = 255) => ({ __type__: "cc.Color", r, g, b, a });
const nextId = (prefix) => `nailHammer_${prefix}_${String(++serial).padStart(3, "0")}`;

function add(object) {
  const id = objects.length;
  objects.push(object);
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
    _id: nextId("Transform"),
  });
}

function makeNode(name, parentId, {
  x = 0,
  y = 0,
  z = 0,
  scaleX = 1,
  scaleY = 1,
  width = 100,
  height = 100,
  active = true,
  anchorX = 0.5,
  anchorY = 0.5,
  rotation = 0,
} = {}) {
  const nodeId = add({
    __type__: "cc.Node",
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _parent: parentId === null ? ref(1) : ref(parentId),
    _children: [],
    _active: active,
    _components: [],
    _prefab: null,
    _lpos: vec3(x, y, z),
    _lrot: quatZ(rotation),
    _lscale: vec3(scaleX, scaleY, 1),
    _mobility: 0,
    _layer: 33554432,
    _euler: vec3(0, 0, rotation),
    _id: nextId(name.replace(/[^a-zA-Z0-9]/g, "Node")),
  });
  const parent = parentId === null ? objects[1] : objects[parentId];
  parent._children.push(ref(nodeId));
  addUITransform(nodeId, width, height, anchorX, anchorY);
  return nodeId;
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
    _id: nextId("Sprite"),
  });
}

function makeSprite(name, parentId, frameUuid, options = {}) {
  const nodeId = makeNode(name, parentId, options);
  addSprite(nodeId, frameUuid, options.tint);
  return nodeId;
}

function makeVerticalFilledSprite(name, parentId, frameUuid, options = {}) {
  const nodeId = makeNode(name, parentId, options);
  const componentId = addSprite(nodeId, frameUuid, options.tint);
  objects[componentId]._type = 3;
  objects[componentId]._fillType = 1;
  objects[componentId]._fillStart = options.fillStart ?? 0;
  objects[componentId]._fillRange = options.fillRange ?? 1;
  return { node: nodeId, component: componentId };
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
  outlineColor = color(80, 45, 25),
  outlineWidth = 3,
} = {}) {
  const componentId = addComponent(nodeId, {
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
    _shadowColor: color(0, 0, 0, 150),
    _shadowOffset: { __type__: "cc.Vec2", x: 2, y: -2 },
    _shadowBlur: 2,
    _id: nextId("Label"),
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
      _id: nextId("LabelOutline"),
    });
  }
  return componentId;
}

function makeLabel(name, parentId, text, labelOptions = {}, nodeOptions = {}) {
  const nodeId = makeNode(name, parentId, nodeOptions);
  return { node: nodeId, component: addLabel(nodeId, text, labelOptions) };
}

function addButton(nodeId, withSound = true) {
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
    _zoomScale: 0.94,
    _target: ref(nodeId),
    _id: nextId("Button"),
  });
  if (withSound) {
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
      _id: nextId("ButtonSound"),
    });
  }
  return buttonId;
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
    _id: nextId("BlockInput"),
  });
}

const frames = {
  background: "2edea84d-d28b-43ef-885e-ee11bb12ac03@f9941",
  boss: "66a977c0-eb64-4cf5-8855-0fb12c51e34b@f9941",
  woodBack: "f519a5d5-66ce-4263-8429-e0e24d7fbf4d@f9941",
  woodFront: "cbed5051-729e-4d72-814b-707cd2f5d487@f9941",
  hammerReady: "3cd0ce1e-6016-49ec-a2d8-0779737d37c6@f9941",
  hammerStrike: "d091860f-c3b2-4cb8-ab8e-d3d88499bd19@f9941",
  nailStraight: "854f4eda-040f-458c-bd98-81377998f53a@f9941",
  nailBent: "0193b84d-8a0e-4e4d-b338-0387ba9ee035@f9941",
  targetOuter: "cc87d7e5-4cfb-4d35-bf6b-b83ce0fbc30d@f9941",
  targetInner: "f7177d87-8597-4750-bbdb-c86bc5b3bc67@f9941",
  targetArrow: "1e93f988-c760-4a42-9b43-8f0256f78374@f9941",
  targetArrowSuccess: "63e8317d-a868-4ce2-98e9-d16d8fc8e6a4@f9941",
  targetSuccess: "bbd7bb8a-bdb8-411b-a3e7-23761e93406b@f9941",
  speechBubble: "3fd64846-3577-4347-b4ea-78c27250bc42@f9941",
  hammerCounter: "0f34b56d-c0fd-4e50-82c8-bb862debf89f@f9941",
  addHammers: "63da5499-4a06-4875-a085-dd3ac15ef1eb@f9941",
  tapInstruction: "b0362c07-6ada-4736-9c5d-3d580394ef6d@f9941",
  back: "8f6b54c1-3b72-4cf3-8a36-a5d9f6e4c721@f9941",
  woodTitle: "4da1d5f0-714b-4a3e-8bf2-d3667160f7dc@f9941",
  dim: "41d81ce5-66b4-5e09-ba6d-e2b9a72fb370@f9941",
  modal: "34944704-ec90-57b8-9b0c-129b4793ae54@f9941",
  successButton: "0dff928c-f9de-5357-ace4-2b810fc35af8@f9941",
  adButton: "cb706d47-db4b-5f33-8cde-a6299daad9f5@f9941",
  adBadge: "cf633ac8-e94b-4433-a837-05cc338157cd@f9941",
};

add({
  __type__: "cc.SceneAsset",
  _name: "NailHammerFeedGameScene",
  _objFlags: 0,
  __editorExtras__: {},
  _native: "",
  scene: ref(1),
});
add({
  __type__: "cc.Scene",
  _name: "NailHammerFeedGameScene",
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
  _id: "cd1d5a38-5c59-4e1a-aa6e-f9ed1d66512b",
});

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
  _id: nextId("Camera"),
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
  _id: nextId("Canvas"),
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
  _id: nextId("Widget"),
});

const background = makeSprite("NailBackground", canvas, frames.background, { width: 750, height: 1750 });
const boss = makeSprite("Boss", canvas, frames.boss, {
  x: 0,
  y: -426,
  width: 569,
  height: 1039,
  anchorX: 0.5,
  anchorY: 0.02,
});
const woodBack = makeSprite("WoodBack", canvas, frames.woodBack, { y: -10, width: 1500, height: 65 });
// The full nail is rendered before WoodFront, allowing the board to hide the
// part that has already been hammered below its surface.
const nailRoot = makeNode("NailRoot", canvas, { y: 16, width: 70, height: 120 });
const straightNail = makeSprite("StraightNail", nailRoot, frames.nailStraight, { width: 42, height: 113 });
const bentNail = makeSprite("BentNail", nailRoot, frames.nailBent, { width: 54, height: 116, active: false });
const woodFront = makeSprite("WoodFront", canvas, frames.woodFront, { y: -144, width: 1500, height: 225 });

// The original game's sight lies flat on the wooden base. Keep the perspective
// compression on its own editor-visible parent so the animated child can still
// scale uniformly without turning the sight back into a floating circle.
const sightPerspective = makeNode("SightPerspective", canvas, {
  y: -31,
  scaleY: 0.512,
  width: 190,
  height: 190,
});
const sightScaleNode = makeNode("SightScale", sightPerspective, { width: 190, height: 190 });
makeSprite("TargetOuter", sightScaleNode, frames.targetOuter, { width: 184, height: 184 });
const targetNormal = makeNode("TargetNormal", sightScaleNode, { width: 190, height: 190 });
makeSprite("TargetInner", targetNormal, frames.targetInner, { width: 128, height: 128 });
makeSprite("ArrowTop", targetNormal, frames.targetArrow, { x: 0, y: 54, width: 31, height: 66, rotation: 180 });
makeSprite("ArrowLeft", targetNormal, frames.targetArrow, { x: -52, y: 0, width: 31, height: 66, rotation: -90 });
makeSprite("ArrowBottom", targetNormal, frames.targetArrow, { x: 0, y: -52, width: 31, height: 66 });
makeSprite("ArrowRight", targetNormal, frames.targetArrow, { x: 52, y: 0, width: 31, height: 66, rotation: 90 });

// Keep the green hit-window art as a separate editor-visible layer, just like
// the source game. Runtime logic only switches the yellow/green layer active.
const targetSuccess = makeNode("TargetGreen", sightScaleNode, {
  width: 190,
  height: 190,
  active: false,
});
makeSprite("TargetInnerGreen", targetSuccess, frames.targetSuccess, { width: 128, height: 128 });
makeSprite("ArrowTopGreen", targetSuccess, frames.targetArrowSuccess, { x: 0, y: 54, width: 31, height: 66, rotation: 180 });
makeSprite("ArrowLeftGreen", targetSuccess, frames.targetArrowSuccess, { x: -52, y: 0, width: 31, height: 66, rotation: -90 });
makeSprite("ArrowBottomGreen", targetSuccess, frames.targetArrowSuccess, { x: 0, y: -52, width: 31, height: 66 });
makeSprite("ArrowRightGreen", targetSuccess, frames.targetArrowSuccess, { x: 52, y: 0, width: 31, height: 66, rotation: 90 });

// A vertically filled duplicate is rendered after the sight. The controller
// clips it at the board surface every frame, so only the above-board part can
// cover the sight while the buried part remains hidden by WoodFront.
const nailFrontRoot = makeNode("NailFrontRoot", canvas, { y: 16, width: 70, height: 120 });
const straightNailFront = makeVerticalFilledSprite(
  "StraightNailFront",
  nailFrontRoot,
  frames.nailStraight,
  { width: 42, height: 113, fillStart: 0.08, fillRange: 0.92 },
);
const bentNailFront = makeVerticalFilledSprite(
  "BentNailFront",
  nailFrontRoot,
  frames.nailBent,
  { width: 54, height: 116, active: false, fillStart: 0.09, fillRange: 0.91 },
);

const hammerRoot = makeNode("HammerRoot", canvas, { x: 170, y: 35, width: 280, height: 380 });
const hammerReady = makeSprite("HammerReady", hammerRoot, frames.hammerReady, { x: -60, y: 39, width: 155, height: 349 });
const hammerStrike = makeSprite("HammerStrike", hammerRoot, frames.hammerStrike, { x: -123, y: -25, width: 113, height: 219, active: false });

const topHud = makeNode("TopHUD", canvas, { width: 750, height: 1334 });
const backNode = makeSprite("BackButton", topHud, frames.back, { x: -320, y: 574, width: 80, height: 80 });
const backButton = addButton(backNode);
const progressPanel = makeSprite("NailProgressPanel", topHud, frames.woodTitle, { x: 265, y: 490, width: 206, height: 54 });
makeLabel("NailProgressCaption", progressPanel, "钉入", {
  fontSize: 24,
  lineHeight: 32,
  textColor: color(255, 255, 255),
  outlineColor: color(117, 58, 32),
  outlineWidth: 2,
}, { x: -45, width: 80, height: 38 });
const completedNailsLabel = makeLabel("CompletedNailsLabel", progressPanel, "0/5", {
  fontSize: 26,
  lineHeight: 34,
  textColor: color(255, 255, 255),
  outlineColor: color(117, 58, 32),
  outlineWidth: 2,
}, { x: 45, width: 88, height: 40 });

const counterPanel = makeSprite("HammerCounterPanel", topHud, frames.hammerCounter, { x: 265, y: 428, width: 206, height: 59 });
const hammerCountLabel = makeLabel("HammerCountLabel", counterPanel, "剩余20锤", {
  fontSize: 23,
  lineHeight: 34,
  textColor: color(68, 68, 68),
  outline: false,
}, { x: 31, width: 140, height: 42 });
makeSprite("TapInstruction", topHud, frames.tapInstruction, { y: -476, width: 339, height: 54 });
// Keep the artwork and corner badge editable, with a button hit area that also
// covers the protruding badge so tapping it never falls through to a hammer strike.
const addHammersNode = makeNode("AddHammersButton", topHud, { y: -578, width: 168, height: 144 });
makeSprite("ButtonBackground", addHammersNode, frames.addHammers, { y: -7, width: 128, height: 128 });
const addHammersButton = addButton(addHammersNode);
makeLabel("AddHammersButtonLabel", addHammersNode, "锤子 +5", {
  fontSize: 25,
  lineHeight: 34,
  textColor: color(255, 255, 255),
  outlineColor: color(125, 55, 35),
  outlineWidth: 3,
}, { y: -46, width: 120, height: 36 });
makeSprite("AdBadge", addHammersNode, frames.adBadge, {
  x: 53, y: 43, width: 60, height: 56,
});

const speechBubble = makeNode("SpeechBubble", canvas, { x: 278, y: 112, width: 190, height: 385, active: false });
makeSprite("BubbleArt", speechBubble, frames.speechBubble, { width: 190, height: 385 });
const speechLabel = makeLabel("SpeechLabel", speechBubble, "命\n中\n了", {
  fontSize: 25,
  lineHeight: 34,
  textColor: color(35, 35, 35),
  wrap: true,
  outline: false,
}, { x: 8, y: 10, width: 90, height: 260 });

const resultOverlay = makeNode("ResultOverlay", canvas, { width: 750, height: 1334, active: false });
addBlockInput(resultOverlay);
makeSprite("DimBackground", resultOverlay, frames.dim, { width: 750, height: 1334 });
const resultPanel = makeSprite("ResultPanel", resultOverlay, frames.modal, { y: 20, width: 680, height: 680 });
const resultSuccessTitle = makeLabel("SuccessTitle", resultPanel, "挑战成功", {
  fontSize: 52,
  lineHeight: 64,
  textColor: color(43, 128, 67),
  outlineColor: color(255, 244, 176),
  outlineWidth: 4,
}, { y: 240, width: 520, height: 80 });
const resultFailureTitle = makeLabel("FailureTitle", resultPanel, "挑战失败", {
  fontSize: 52,
  lineHeight: 64,
  textColor: color(190, 65, 46),
  outlineColor: color(255, 244, 176),
  outlineWidth: 4,
}, { y: 240, width: 520, height: 80, active: false });
const resultProgress = makeLabel("ResultProgress", resultPanel, "完整钉入 5/5 枚", {
  fontSize: 40,
  lineHeight: 50,
  textColor: color(78, 48, 25),
  outline: false,
}, { y: 145, width: 540, height: 64 });
const resultDetail = makeLabel("ResultDetail", resultPanel, "使用 15 锤，剩余 5 锤\n5 枚钉子全部钉入！", {
  fontSize: 28,
  lineHeight: 42,
  textColor: color(78, 48, 25),
  wrap: true,
  outline: false,
}, { y: 55, width: 550, height: 92 });

// Separate action groups keep success/failure layout fully editable in Creator.
const successActions = makeNode("SuccessActions", resultPanel, { y: -190, width: 640, height: 110 });
const failureActions = makeNode("FailureActions", resultPanel, { y: -158, width: 640, height: 260, active: false });

function makeResultButton(name, parent, text, x, { y = 0, width = 290 } = {}) {
  const node = makeSprite(name, parent, frames.successButton, { x, y, width, height: 92 });
  const button = addButton(node);
  makeLabel(`${name}Label`, node, text, {
    fontSize: 31,
    lineHeight: 40,
    textColor: color(255, 255, 255),
    outlineColor: color(125, 55, 35),
    outlineWidth: 3,
  }, { width: width - 50, height: 58 });
  return button;
}
const replayButton = makeResultButton("ReplayButton", successActions, "再玩一次", -165);
const nextButton = makeResultButton("NextButton", successActions, "下一关", 165);
// Match the milk-tea result action: orange/pink video button with a separate
// red clapperboard badge over its left play icon, and a reward-only caption.
const reviveNode = makeSprite("ReviveButton", failureActions, frames.adButton, {
  y: 60, width: 420, height: 114,
});
const reviveButton = addButton(reviveNode);
makeSprite("AdBadge", reviveNode, frames.adBadge, {
  x: -154, width: 63, height: 63,
});
makeLabel("ReviveButtonLabel", reviveNode, "+10 锤复活", {
  fontSize: 31,
  lineHeight: 40,
  textColor: color(255, 255, 255),
  outlineColor: color(164, 58, 47),
  outlineWidth: 2,
}, { x: 30, width: 280, height: 58 });
const restartButton = makeResultButton("RestartButton", failureActions, "重新挑战", -165, { y: -80 });
const resultHomeButton = makeResultButton("ResultHomeButton", failureActions, "返回首页", 165, { y: -80 });

function compressUuid(uuid) {
  const keys = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const hex = uuid.replace(/-/g, "");
  let output = hex.slice(0, 5);
  for (let i = 5; i < hex.length; i += 3) {
    const value = Number.parseInt(hex.slice(i, i + 3), 16);
    output += keys[value >> 6] + keys[value & 63];
  }
  return output;
}

addComponent(canvas, {
  __type__: compressUuid("14806460-b2d6-4399-a0b1-d969ec276427"),
  _name: "",
  _objFlags: 0,
  __editorExtras__: {},
  node: ref(canvas),
  _enabled: true,
  __prefab: null,
  sceneBackground: ref(background),
  sceneBackButton: ref(backButton),
  sceneAddHammersButton: ref(addHammersButton),
  sceneCompletedNailsLabel: ref(completedNailsLabel.component),
  sceneHammerCountLabel: ref(hammerCountLabel.component),
  sceneBoss: ref(boss),
  sceneWoodBack: ref(woodBack),
  sceneWoodFront: ref(woodFront),
  sceneNailRoot: ref(nailRoot),
  sceneStraightNail: ref(straightNail),
  sceneBentNail: ref(bentNail),
  sceneNailFrontRoot: ref(nailFrontRoot),
  sceneStraightNailFront: ref(straightNailFront.component),
  sceneBentNailFront: ref(bentNailFront.component),
  sceneHammerRoot: ref(hammerRoot),
  sceneHammerReady: ref(hammerReady),
  sceneHammerStrike: ref(hammerStrike),
  sceneSightScaleNode: ref(sightScaleNode),
  sceneTargetNormal: ref(targetNormal),
  sceneTargetSuccess: ref(targetSuccess),
  sceneSpeechBubble: ref(speechBubble),
  sceneSpeechLabel: ref(speechLabel.component),
  sceneResultOverlay: ref(resultOverlay),
  sceneResultPanel: ref(resultPanel),
  sceneResultSuccessTitle: ref(resultSuccessTitle.component),
  sceneResultFailureTitle: ref(resultFailureTitle.component),
  sceneResultProgress: ref(resultProgress.component),
  sceneResultDetail: ref(resultDetail.component),
  sceneSuccessActions: ref(successActions),
  sceneFailureActions: ref(failureActions),
  sceneReplayButton: ref(replayButton),
  sceneNextButton: ref(nextButton),
  sceneRestartButton: ref(restartButton),
  sceneResultHomeButton: ref(resultHomeButton),
  sceneReviveButton: ref(reviveButton),
  _id: nextId("NailHammerGame"),
});

objects[1]._globals = ref(appendSceneGlobals(sourceScene, objects));
fitFeedResultOverlay(objects, "NailHammerFeedGameScene");
fs.writeFileSync(scenePath, `${JSON.stringify(objects, null, 2)}\n`);

function addEntryToMainScene() {
  const main = JSON.parse(fs.readFileSync(mainScenePath, "utf8"));
  const canvasId = main.findIndex((item) => item?.__type__ === "cc.Node" && item._name === "Canvas");
  const controllerId = main.findIndex((item) => item && Object.prototype.hasOwnProperty.call(item, "startBtn"));
  if (canvasId < 0 || controllerId < 0) throw new Error("MainScene Canvas/controller not found");

  if (main[controllerId].nailHammerGameBtn) {
    console.log("MainScene already contains nailHammerGameBtn");
    return;
  }

  let idSerial = 0;
  const addMain = (item) => {
    const id = main.length;
    main.push(item);
    return id;
  };
  const mainId = (prefix) => `nailEntry_${prefix}_${++idSerial}`;
  const addMainComponent = (nodeId, component) => {
    const componentId = addMain(component);
    main[nodeId]._components.push(ref(componentId));
    return componentId;
  };
  const makeMainNode = (name, parentId, x, y, width, height) => {
    const nodeId = addMain({
      __type__: "cc.Node",
      _name: name,
      _objFlags: 0,
      __editorExtras__: {},
      _parent: ref(parentId),
      _children: [],
      _active: true,
      _components: [],
      _prefab: null,
      _lpos: vec3(x, y, 0),
      _lrot: quat(),
      _lscale: vec3(1, 1, 1),
      _mobility: 0,
      _layer: 33554432,
      _euler: vec3(),
      _id: mainId(name),
    });
    main[parentId]._children.push(ref(nodeId));
    addMainComponent(nodeId, {
      __type__: "cc.UITransform",
      _name: "",
      _objFlags: 0,
      __editorExtras__: {},
      node: ref(nodeId),
      _enabled: true,
      __prefab: null,
      _contentSize: { __type__: "cc.Size", width, height },
      _anchorPoint: { __type__: "cc.Vec2", x: 0.5, y: 0.5 },
      _id: mainId("Transform"),
    });
    return nodeId;
  };

  const entry = makeMainNode("nailHammerGameBtn", canvasId, 306, -420, 128, 192);
  const art = makeMainNode("HammerArt", entry, 0, 20, 84, 190);
  addMainComponent(art, {
    __type__: "cc.Sprite",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: ref(art),
    _enabled: true,
    __prefab: null,
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: color(255, 255, 255),
    _spriteFrame: uuidRef(frames.hammerReady),
    _type: 0,
    _fillType: 0,
    _sizeMode: 0,
    _fillCenter: { __type__: "cc.Vec2", x: 0, y: 0 },
    _fillStart: 0,
    _fillRange: 0,
    _isTrimmedMode: true,
    _useGrayscale: false,
    _atlas: null,
    _id: mainId("HammerSprite"),
  });
  const labelNode = makeMainNode("Label", entry, 0, -82, 128, 48);
  addMainComponent(labelNode, {
    __type__: "cc.Label",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: ref(labelNode),
    _enabled: true,
    __prefab: null,
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: color(255, 255, 255),
    _string: "砸钉子",
    _horizontalAlign: 1,
    _verticalAlign: 1,
    _actualFontSize: 30,
    _fontSize: 30,
    _fontFamily: "Arial",
    _lineHeight: 38,
    _overflow: 2,
    _enableWrapText: false,
    _font: null,
    _isSystemFontUsed: true,
    _spacingX: 0,
    _isItalic: false,
    _isBold: true,
    _isUnderline: false,
    _underlineHeight: 2,
    _cacheMode: 0,
    _enableOutline: true,
    _outlineColor: color(79, 48, 28),
    _outlineWidth: 3,
    _enableShadow: false,
    _shadowColor: color(0, 0, 0, 150),
    _shadowOffset: { __type__: "cc.Vec2", x: 2, y: -2 },
    _shadowBlur: 2,
    _id: mainId("Label"),
  });
  addMainComponent(labelNode, {
    __type__: "cc.LabelOutline",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: ref(labelNode),
    _enabled: true,
    __prefab: null,
    _id: mainId("LabelOutline"),
  });
  const buttonId = addMainComponent(entry, {
    __type__: "cc.Button",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: ref(entry),
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
    _zoomScale: 1.08,
    _target: ref(entry),
    _id: mainId("Button"),
  });
  addMainComponent(entry, {
    __type__: "7a1a5iVpkNPsYcjs1PU1SS/",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: ref(entry),
    _enabled: true,
    __prefab: null,
    enableClickSound: true,
    onlyPlayWhenInteractable: true,
    _id: mainId("ButtonSound"),
  });
  main[controllerId].nailHammerGameBtn = ref(buttonId);
  fs.writeFileSync(mainScenePath, `${JSON.stringify(main, null, 2)}\n`);
}

addEntryToMainScene();
console.log(`Wrote ${scenePath} (${objects.length} serialized objects)`);
