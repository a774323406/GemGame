// Offline scene-authoring helper only. Runtime UI stays serialized in Creator.
export function appendSceneGlobals(source, destination) {
  const start = source.findIndex(o => o.__type__ === "cc.SceneGlobals");
  if (start < 0) throw new Error("SceneGlobals is missing");
  const ids = new Map();
  const copy = id => {
    if (ids.has(id)) return ids.get(id);
    const newId = destination.length;
    ids.set(id, newId);
    destination.push(null);
    const remap = value => {
      if (Array.isArray(value)) return value.map(remap);
      if (!value || typeof value !== "object") return value;
      if (Number.isInteger(value.__id__)) return { __id__: copy(value.__id__) };
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, remap(child)]));
    };
    destination[newId] = remap(source[id]);
    return newId;
  };
  // Widgets may follow SceneGlobals in editor-saved files; copy only the
  // referenced globals, never unrelated components from the rest of the file.
  return copy(start);
}

export function fitFeedResultOverlay(objects, sceneName) {
  const nodeId = name => objects.findIndex(o => o.__type__ === "cc.Node" && o._name === name);
  const overlayId = nodeId("ResultOverlay");
  if (overlayId < 0) throw new Error(`${sceneName}: ResultOverlay is missing`);
  const component = (id, type) => objects[id]._components
    .map(ref => objects[ref.__id__]).find(o => o.__type__ === type);
  const addComponent = (id, type, suffix, fields) => {
    const result = {
      __type__: type, _name: "", _objFlags: 0, __editorExtras__: {},
      node: { __id__: id }, _enabled: true, __prefab: null,
      ...fields, _id: `feedResult_${sceneName}_${suffix}`,
    };
    objects[id]._components.push({ __id__: objects.length });
    objects.push(result);
    return result;
  };
  const stretch = id => {
    const fields = {
      _enabled: true, _alignFlags: 45, _target: null,
      _left: 0, _right: 0, _top: 0, _bottom: 0,
      _horizontalCenter: 0, _verticalCenter: 0,
      _isAbsLeft: true, _isAbsRight: true, _isAbsTop: true, _isAbsBottom: true,
      _isAbsHorizontalCenter: true, _isAbsVerticalCenter: true,
      _originalWidth: 0, _originalHeight: 0,
      _alignMode: 2, _lockFlags: 0,
    };
    const widget = component(id, "cc.Widget");
    if (widget) Object.assign(widget, fields);
    else addComponent(id, "cc.Widget", `${objects[id]._name}_Widget`, fields);
  };
  stretch(overlayId);
  for (const child of objects[overlayId]._children) {
    if (["ResultDim", "ResultDimBackground", "DimBackground"].includes(objects[child.__id__]._name)) {
      stretch(child.__id__);
    }
  }
  if (!component(overlayId, "cc.BlockInputEvents")) {
    addComponent(overlayId, "cc.BlockInputEvents", "BlockInput", {});
  }
  if (sceneName === "JuggleBallGameScene") {
    // Replace its runtime fixed rectangle with the existing single-color sprite.
    if (!component(overlayId, "cc.Sprite")) {
      addComponent(overlayId, "cc.Sprite", "DimSprite", {
        _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4,
        _color: { __type__: "cc.Color", r: 13, g: 50, b: 78, a: 175 },
        _spriteFrame: {
          __uuid__: "b900cef1-182a-4426-a80e-8a842d396eec@f9941",
          __expectedType__: "cc.SpriteFrame",
        },
        _type: 0, _fillType: 0, _sizeMode: 0,
        _fillCenter: { __type__: "cc.Vec2", x: 0, y: 0 },
        _fillStart: 0, _fillRange: 0, _isTrimmedMode: true,
        _useGrayscale: false, _atlas: null,
      });
    }
    const graphics = component(overlayId, "cc.Graphics");
    if (graphics) graphics._enabled = false;
  }
}
