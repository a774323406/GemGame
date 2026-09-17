// Offline serialized-scene authoring only. No runtime Graphics or UI construction.
import crypto from 'node:crypto';

export function assetUuid(name) {
  const h = crypto.createHash('sha256').update('GemGame/balloonWheelFeed/' + name).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export const SCENE_UUID = assetUuid('BalloonWheelFeedGameScene');
export const SCRIPT_UUID = assetUuid('balloonWheelFeedGameScene.ts');
export const rgba = (r = 255, g = 255, b = 255, a = 255) => ({ __type__: 'cc.Color', r, g, b, a });
export const ref = id => ({ __id__: id });
export const vec = (x = 0, y = 0, z = 0) => ({ __type__: 'cc.Vec3', x, y, z });
export function compressUuid(uuid) {
  const keys = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const hex = uuid.replace(/-/g, ''); let out = hex.slice(0, 5);
  for (let i = 5; i < hex.length; i += 3) { const n = parseInt(hex.slice(i, i + 3), 16); out += keys[n >> 6] + keys[n & 63]; }
  return out;
}

export class SceneAuthor {
  constructor(objects = [], prefix = 'balloonWheel') { this.objects = objects; this.prefix = prefix; this.serial = 0; }
  id(name) { return `${this.prefix}_${name}_${++this.serial}`; }
  add(object) { this.objects.push(object); return this.objects.length - 1; }
  component(node, type, fields = {}) {
    const id = this.add({ __type__: type, _name: '', _objFlags: 0, __editorExtras__: {}, node: ref(node),
      _enabled: true, __prefab: null, ...fields, _id: this.id(type.replace(/[^a-z0-9]/gi, '')) });
    this.objects[node]._components.push(ref(id)); return id;
  }
  node(name, parent, { x = 0, y = 0, z = 0, w = 100, h = 100, ax = 0.5, ay = 0.5, active = true, rotation = 0 } = {}) {
    if (name.includes('/')) throw new Error('Invalid node name: ' + name);
    const half = rotation * Math.PI / 360;
    const id = this.add({ __type__: 'cc.Node', _name: name, _objFlags: 0, __editorExtras__: {},
      _parent: ref(parent), _children: [], _active: active, _components: [], _prefab: null,
      _lpos: vec(x, y, z), _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) },
      _lscale: vec(1, 1, 1), _mobility: 0, _layer: 33554432, _euler: vec(0, 0, rotation), _id: this.id(name) });
    this.objects[parent]._children.push(ref(id));
    this.component(id, 'cc.UITransform', { _contentSize: { __type__: 'cc.Size', width: w, height: h },
      _anchorPoint: { __type__: 'cc.Vec2', x: ax, y: ay } });
    return id;
  }
  sprite(name, parent, uuid, options = {}) {
    const node = this.node(name, parent, options);
    this.component(node, 'cc.Sprite', { _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4,
      _color: options.color || rgba(), _spriteFrame: { __uuid__: uuid, __expectedType__: 'cc.SpriteFrame' },
      _type: 0, _fillType: 0, _sizeMode: 0, _fillCenter: { __type__: 'cc.Vec2', x: 0, y: 0 },
      _fillStart: 0, _fillRange: 0, _isTrimmedMode: true, _useGrayscale: false, _atlas: null });
    return node;
  }
  label(name, parent, text, options = {}) {
    const node = this.node(name, parent, options), size = options.size || 30;
    const component = this.component(node, 'cc.Label', { _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4,
      _color: options.color || rgba(), _string: text, _horizontalAlign: options.align ?? 1, _verticalAlign: 1,
      _actualFontSize: size, _fontSize: size, _fontFamily: 'Arial', _lineHeight: options.lineHeight || size * 1.25,
      _overflow: 2, _enableWrapText: !!options.wrap, _font: null, _isSystemFontUsed: true, _spacingX: 0,
      _isItalic: false, _isBold: options.bold !== false, _isUnderline: false, _underlineHeight: 2, _cacheMode: 0,
      _enableOutline: options.outline !== false, _outlineColor: options.outlineColor || rgba(65, 40, 25),
      _outlineWidth: options.outlineWidth || 3, _enableShadow: false, _shadowColor: rgba(0, 0, 0, 150),
      _shadowOffset: { __type__: 'cc.Vec2', x: 2, y: -2 }, _shadowBlur: 2 });
    return { node, component };
  }
  button(node) {
    return this.component(node, 'cc.Button', { clickEvents: [], _interactable: true, _transition: 3,
      _normalColor: rgba(), _hoverColor: rgba(), _pressedColor: rgba(230, 230, 230), _disabledColor: rgba(150, 150, 150),
      _normalSprite: null, _hoverSprite: null, _pressedSprite: null, _disabledSprite: null, _duration: 0.1,
      _zoomScale: 0.94, _target: ref(node) });
  }
  opacity(node) { return this.component(node, 'cc.UIOpacity', { _opacity: 255 }); }
  widget(node, flags, fields = {}) {
    return this.component(node, 'cc.Widget', { _alignFlags: flags, _target: null,
      _left: 0, _right: 0, _top: 0, _bottom: 0, _horizontalCenter: 0, _verticalCenter: 0,
      _isAbsLeft: true, _isAbsRight: true, _isAbsTop: true, _isAbsBottom: true,
      _isAbsHorizontalCenter: true, _isAbsVerticalCenter: true, _originalWidth: 0, _originalHeight: 0,
      _alignMode: 2, _lockFlags: 0, ...fields });
  }
}
