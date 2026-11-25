// Offline serialized-scene authoring only. Runtime never draws or constructs fixed UI.
export const rgba = (r = 255, g = 255, b = 255, a = 255) => ({ __type__: 'cc.Color', r, g, b, a });
export const ref = id => ({ __id__: id });
export const vec = (x = 0, y = 0, z = 0) => ({ __type__: 'cc.Vec3', x, y, z });

export function compressUuid(uuid) {
  const keys = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const hex = uuid.replace(/-/g, '');
  let out = hex.slice(0, 5);
  for (let i = 5; i < hex.length; i += 3) {
    const n = parseInt(hex.slice(i, i + 3), 16);
    out += keys[n >> 6] + keys[n & 63];
  }
  return out;
}

// Keep the source subtree's button targets, children, components and artwork together.
export function copySubtree(source, author, parent, rootName) {
  const root = source.findIndex(o => o.__type__ === 'cc.Node' && o._name === rootName);
  if (root < 0) throw new Error('Missing source subtree ' + rootName);
  const ids = [];
  function visit(id) {
    ids.push(id, ...source[id]._components.map(r => r.__id__));
    source[id]._children.forEach(r => visit(r.__id__));
  }
  visit(root);
  const mapped = new Map(ids.map((id, i) => [id, author.objects.length + i]));
  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (!value || typeof value !== 'object') return value;
    if (Number.isInteger(value.__id__)) return mapped.has(value.__id__) ? ref(mapped.get(value.__id__)) : null;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, copy(entry)]));
  }
  for (const id of ids) {
    const item = copy(source[id]);
    item._id = author.id(item._name || item.__type__.replace(/[^a-z0-9]/gi, ''));
    author.add(item);
  }
  const node = mapped.get(root);
  author.objects[node]._parent = ref(parent);
  author.objects[parent]._children.push(ref(node));
  return node;
}

export class SceneAuthor {
  constructor(objects = [], prefix = 'feed') {
    this.objects = objects;
    this.prefix = prefix;
    this.serial = 0;
  }

  id(name) { return `${this.prefix}_${name}_${++this.serial}`; }
  add(object) { this.objects.push(object); return this.objects.length - 1; }

  component(node, type, fields = {}) {
    const id = this.add({
      __type__: type,
      _name: '',
      _objFlags: 0,
      __editorExtras__: {},
      node: ref(node),
      _enabled: true,
      __prefab: null,
      ...fields,
      _id: this.id(type.replace(/[^a-z0-9]/gi, '')),
    });
    this.objects[node]._components.push(ref(id));
    return id;
  }

  node(name, parent, {
    x = 0, y = 0, z = 0, w = 100, h = 100, ax = 0.5, ay = 0.5,
    active = true, rotation = 0, sx = 1, sy = 1,
  } = {}) {
    if (name.includes('/')) throw new Error('Invalid node name: ' + name);
    const half = rotation * Math.PI / 360;
    const id = this.add({
      __type__: 'cc.Node',
      _name: name,
      _objFlags: 0,
      __editorExtras__: {},
      _parent: ref(parent),
      _children: [],
      _active: active,
      _components: [],
      _prefab: null,
      _lpos: vec(x, y, z),
      _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) },
      _lscale: vec(sx, sy, 1),
      _mobility: 0,
      _layer: 33554432,
      _euler: vec(0, 0, rotation),
      _id: this.id(name),
    });
    this.objects[parent]._children.push(ref(id));
    this.component(id, 'cc.UITransform', {
      _contentSize: { __type__: 'cc.Size', width: w, height: h },
      _anchorPoint: { __type__: 'cc.Vec2', x: ax, y: ay },
    });
    return id;
  }

  sprite(name, parent, uuid, options = {}) {
    const node = this.node(name, parent, options);
    this.component(node, 'cc.Sprite', {
      _customMaterial: null,
      _srcBlendFactor: 2,
      _dstBlendFactor: 4,
      _color: options.color || rgba(),
      _spriteFrame: { __uuid__: uuid, __expectedType__: 'cc.SpriteFrame' },
      _type: 0,
      _fillType: 0,
      _sizeMode: 0,
      _fillCenter: { __type__: 'cc.Vec2', x: 0, y: 0 },
      _fillStart: 0,
      _fillRange: 0,
      _isTrimmedMode: true,
      _useGrayscale: false,
      _atlas: null,
    });
    return node;
  }

  label(name, parent, text, options = {}) {
    const node = this.node(name, parent, options);
    const size = options.size || 30;
    const component = this.component(node, 'cc.Label', {
      _customMaterial: null,
      _srcBlendFactor: 2,
      _dstBlendFactor: 4,
      _color: options.color || rgba(),
      _string: text,
      _horizontalAlign: options.align ?? 1,
      _verticalAlign: 1,
      _actualFontSize: size,
      _fontSize: size,
      _fontFamily: 'Arial',
      _lineHeight: options.lineHeight || size * 1.25,
      _overflow: 2,
      _enableWrapText: !!options.wrap,
      _font: null,
      _isSystemFontUsed: true,
      _spacingX: 0,
      _isItalic: false,
      _isBold: options.bold !== false,
      _isUnderline: false,
      _underlineHeight: 2,
      _cacheMode: 0,
      _enableOutline: options.outline !== false,
      _outlineColor: options.outlineColor || rgba(67, 42, 31),
      _outlineWidth: options.outlineWidth ?? 3,
      _enableShadow: !!options.shadow,
      _shadowColor: options.shadowColor || rgba(0, 0, 0, 150),
      _shadowOffset: { __type__: 'cc.Vec2', x: 2, y: -2 },
      _shadowBlur: 2,
    });
    return { node, component };
  }

  button(node) {
    return this.component(node, 'cc.Button', {
      clickEvents: [],
      _interactable: true,
      _transition: 3,
      _normalColor: rgba(),
      _hoverColor: rgba(),
      _pressedColor: rgba(230, 230, 230),
      _disabledColor: rgba(150, 150, 150),
      _normalSprite: null,
      _hoverSprite: null,
      _pressedSprite: null,
      _disabledSprite: null,
      _duration: 0.1,
      _zoomScale: 0.94,
      _target: ref(node),
    });
  }

  opacity(node) { return this.component(node, 'cc.UIOpacity', { _opacity: 255 }); }

  widget(node, flags, fields = {}) {
    return this.component(node, 'cc.Widget', {
      _alignFlags: flags,
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
      ...fields,
    });
  }
}
