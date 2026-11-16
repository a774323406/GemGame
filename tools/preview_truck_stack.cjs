// Source-driven visual QA only: no Cocos build, engine runtime, or copied gameplay.
// Run: node tools/preview_truck_stack.cjs [/tmp/truck-stack-source-preview]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const sharp = require('/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const { fixture, advance, land, fail } = require('./truck_stack_test_helpers.cjs');

const root = path.resolve(__dirname, '..');
process.chdir(root);
const out = path.resolve(process.argv[2] || '/tmp/truck-stack-source-preview');
const sourcePath = 'assets/gamescene/TruckStackFeedGameScene.scene';
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const controllerIndex = source.findIndex(v => v.boxNodes && v.slowdownButton && v.heldBox);
assert(controllerIndex >= 0, 'Serialized truck controller must exist');
const canvasIndex = source.findIndex(v => v.__type__ === 'cc.Node' && v._name === 'Canvas');
const frames = new Map();
const uuidPattern = [...new Set(source.flatMap(v => [v._spriteFrame?.__uuid__, v.failureFrame?.__uuid__].filter(Boolean).map(v => v.split('@')[0])))].join('|');
const metaPaths = execFileSync('rg', ['-l', '--glob', '*.meta', uuidPattern, 'assets/res'], { encoding: 'utf8' }).trim().split('\n');
for (const metaPath of metaPaths) {
  const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const file = metaPath.slice(0, -5);
  if (!fs.existsSync(file) || !/\.(png|jpe?g)$/i.test(file)) continue;
  const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const asset = { file, data: `data:${mime};base64,${fs.readFileSync(file).toString('base64')}` };
  frames.set(metadata.uuid, asset);
  for (const sub of Object.values(metadata.subMetas || {})) if (sub.uuid) frames.set(sub.uuid, asset);
}

const esc = v => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const color = (v = { r: 255, g: 255, b: 255, a: 255 }) => `rgba(${v.r},${v.g},${v.b},${(v.a ?? 255) / 255})`;
const number = n => Number(n.toFixed(3));

function sceneFromController(c) {
  const objects = structuredClone(source);
  const descriptor = objects[controllerIndex];
  const applyNode = (ref, actual, transform = false) => {
    const n = objects[ref.__id__];
    n._active = actual.active;
    if (transform) {
      n._lpos = { ...n._lpos, ...actual.position };
      n._lscale = { ...n._lscale, ...actual.scale };
      n._euler.z = actual.angle;
    }
  };
  for (const key of ['surface', 'hud', 'resultOverlay', 'exitOverlay']) applyNode(descriptor[key], c[key]);
  for (const key of ['truck', 'heldBox']) applyNode(descriptor[key], c[key], true);
  for (const key of ['boxNodes', 'clouds']) descriptor[key].forEach((ref, i) => applyNode(ref, c[key][i], true));
  for (const key of ['heightLabel', 'bestLabel', 'hintLabel', 'slowdownLabel', 'resultTitle', 'resultDetail']) {
    objects[descriptor[key].__id__]._string = c[key].string;
  }
  for (const key of ['scenery', 'rope', 'effects']) objects[descriptor[key].__id__].previewCommands = c[key].commands;

  // Exact presentation-only mapping from FeedResultPresentation.syncTitle.
  // The helper runs the real game controller; it does not instantiate this UI component.
  for (const presentation of objects.filter(v => v.titles && v.artworks && v.failureFrame)) {
    if (!objects[presentation.node.__id__]._active) continue;
    for (const ref of presentation.gameplayHud) objects[ref.__id__]._active = false;
    presentation.titles.forEach((ref, i) => {
      const title = objects[ref.__id__], artwork = objects[presentation.artworks[i].__id__];
      const frame = title._string.includes('成功') ? presentation.successFrame
        : title._string.includes('失败') ? presentation.failureFrame : null;
      objects[artwork.node.__id__]._active = !!frame;
      title._enabled = !frame;
      if (frame) artwork._spriteFrame = frame;
    });
  }
  return objects;
}

function graphicsSvg(commands) {
  let current = '', drawn = false, result = '';
  const start = () => { if (drawn) { current = ''; drawn = false; } };
  for (const cmd of commands || []) {
    const a = cmd.args || [];
    switch (cmd.name) {
      case 'moveTo': start(); current += `M${a[0]} ${-a[1]}`; break;
      case 'lineTo': current += `L${a[0]} ${-a[1]}`; break;
      case 'bezierCurveTo': current += `C${a[0]} ${-a[1]} ${a[2]} ${-a[3]} ${a[4]} ${-a[5]}`; break;
      case 'quadraticCurveTo': current += `Q${a[0]} ${-a[1]} ${a[2]} ${-a[3]}`; break;
      case 'close': current += 'Z'; break;
      case 'rect': start(); current += `M${a[0]} ${-a[1]}h${a[2]}v${-a[3]}h${-a[2]}Z`; break;
      case 'circle': start(); current += `M${a[0] - a[2]} ${-a[1]}a${a[2]} ${a[2]} 0 1 0 ${a[2] * 2} 0a${a[2]} ${a[2]} 0 1 0 ${-a[2] * 2} 0Z`; break;
      case 'fill': result += `<path d="${current}" fill="${color(cmd.color)}"/>`; drawn = true; break;
      case 'stroke': result += `<path d="${current}" fill="none" stroke="${color(cmd.color)}" stroke-width="${cmd.width}" stroke-linecap="round" stroke-linejoin="round"/>`; drawn = true; break;
      default: throw Error(`Unsupported Graphics command ${cmd.name}`);
    }
  }
  return result;
}

function renderScene(objects, height) {
  const bounds = [];
  const parts = n => n._components.map(r => objects[r.__id__]);
  const comp = (n, name) => parts(n).find(p => p.__type__ === name && p._enabled !== false);
  const visit = (id, parent, parentWorld) => {
    const node = objects[id];
    if (!node._active) return '';
    const ui = comp(node, 'cc.UITransform');
    const ax = ui?._anchorPoint.x ?? .5, ay = ui?._anchorPoint.y ?? .5;
    let width = ui?._contentSize.width ?? 0, h = ui?._contentSize.height ?? 0;
    let x = node._lpos.x, y = node._lpos.y;
    const sx = node._lscale.x, sy = node._lscale.y, rotation = node._euler?.z || 0;
    if (id === canvasIndex) { width = 750; h = height; x = 0; y = 0; }
    else {
      const widget = comp(node, 'cc.Widget');
      if (widget) {
        assert(!widget._target, 'Source preview currently expects parent-target Widgets');
        assert(parent, 'Widget parent must have a UITransform');
        const f = widget._alignFlags;
        const offset = (key, span) => widget['_' + key] * (widget['_isAbs' + key[0].toUpperCase() + key.slice(1)] ? 1 : span);
        const left = offset('left', parent.width), right = offset('right', parent.width);
        const top = offset('top', parent.height), bottom = offset('bottom', parent.height);
        const pLeft = -parent.width * parent.ax, pBottom = -parent.height * parent.ay;
        if ((f & 8) && (f & 32)) { width = (parent.width - left - right) / Math.abs(sx); x = pLeft + left + width * ax * Math.abs(sx); }
        else if (f & 8) x = pLeft + left + width * ax * Math.abs(sx);
        else if (f & 32) x = pLeft + parent.width - right - width * (1 - ax) * Math.abs(sx);
        else if (f & 16) x = pLeft + parent.width / 2 + offset('horizontalCenter', parent.width) + (ax - .5) * width * Math.abs(sx);
        if ((f & 1) && (f & 4)) { h = (parent.height - top - bottom) / Math.abs(sy); y = pBottom + bottom + h * ay * Math.abs(sy); }
        else if (f & 1) y = pBottom + parent.height - top - h * (1 - ay) * Math.abs(sy);
        else if (f & 4) y = pBottom + bottom + h * ay * Math.abs(sy);
        else if (f & 2) y = pBottom + parent.height / 2 + offset('verticalCenter', parent.height) + (ay - .5) * h * Math.abs(sy);
      }
    }
    const world = { x: parentWorld.x + x * parentWorld.sx, y: parentWorld.y + y * parentWorld.sy,
      sx: parentWorld.sx * sx, sy: parentWorld.sy * sy };
    const b = { id, name: node._name, parent: node._parent?.__id__, x: number(world.x), y: number(world.y),
      width: number(width * Math.abs(world.sx)), height: number(h * Math.abs(world.sy)), rotation,
      left: number(375 + world.x - width * ax * Math.abs(world.sx)),
      top: number(height / 2 - world.y - h * (1 - ay) * Math.abs(world.sy)),
      bottomMargin: number(height / 2 + world.y - h * ay * Math.abs(world.sy)) };
    bounds.push(b);
    let result = '';
    for (const c of parts(node)) {
      if (c._enabled === false) continue;
      if (c.__type__ === 'cc.Sprite') {
        assert.equal(c._type, 0, 'Only serialized simple sprites are present in this scene');
        const asset = frames.get(c._spriteFrame.__uuid__);
        assert(asset, `Missing source asset for ${node._name}: ${c._spriteFrame.__uuid__}`);
        const left = -width * ax, top = -h * (1 - ay);
        if (asset.file.endsWith('/white.png')) result += `<rect x="${left}" y="${top}" width="${width}" height="${h}" fill="${color(c._color)}"/>`;
        else {
          assert(c._color.r === 255 && c._color.g === 255 && c._color.b === 255, 'Preview cannot silently omit sprite tint');
          result += `<image x="${left}" y="${top}" width="${width}" height="${h}" href="${asset.data}" opacity="${c._color.a / 255}" preserveAspectRatio="none"/>`;
        }
      } else if (c.__type__ === 'cc.Label') {
        // This scene's labels fit their boxes without wrapping/shrink. Font glyph
        // metrics use librsvg's system font fallback, not a phone's Cocos renderer.
        const lines = c._string.split('\n'), size = c._fontSize, lineHeight = c._lineHeight;
        const centerY = (ay - .5) * h;
        const anchor = ['start', 'middle', 'end'][c._horizontalAlign];
        const tx = c._horizontalAlign === 0 ? -width * ax : c._horizontalAlign === 2 ? width * (1 - ax) : width * (.5 - ax);
        const outline = c._enableOutline ? `stroke="${color(c._outlineColor)}" stroke-width="${c._outlineWidth * 2}" stroke-linejoin="round" paint-order="stroke fill"` : '';
        result += `<text x="${tx}" font-family="Arial, PingFang SC, sans-serif" font-size="${size}" font-weight="${c._isBold ? 700 : 400}" text-anchor="${anchor}" dominant-baseline="central" fill="${color(c._color)}" ${outline}>`;
        lines.forEach((line, i) => { result += `<tspan x="${tx}" y="${centerY + (i - (lines.length - 1) / 2) * lineHeight}">${esc(line)}</tspan>`; });
        result += '</text>';
      } else if (c.__type__ === 'cc.Graphics') result += graphicsSvg(c.previewCommands);
    }
    for (const child of node._children) result += visit(child.__id__, { width, height: h, ax, ay }, world);
    const opacity = comp(node, 'cc.UIOpacity')?._opacity ?? 255;
    return `<g data-node="${esc(node._name)}" transform="translate(${x} ${-y}) rotate(${-rotation}) scale(${sx} ${sy})" opacity="${opacity / 255}">${result}</g>`;
  };
  const content = visit(canvasIndex, null, { x: 0, y: 0, sx: 1, sy: 1 });
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="750" height="${height}" viewBox="0 0 750 ${height}"><g transform="translate(375 ${height / 2})">${content}</g></svg>`, bounds };
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const summaries = [];
  const states = ['opening', 'six-boxes', 'twenty-boxes', 'left-swing', 'right-swing', 'release', 'throw-120ms', 'throw-280ms', 'failure', 'pause'];
  for (const height of [1334, 1624]) {
    for (const state of states) {
      const { c } = fixture({ height, entered: true });
      advance(c, .4);
      const isThrow = ['release', 'throw-120ms', 'throw-280ms'].includes(state);
      const target = isThrow || ['twenty-boxes', 'left-swing', 'right-swing'].includes(state) ? 20 : ['six-boxes', 'failure'].includes(state) ? 6 : 1;
      while (c.round.height < target) land(c);
      if (target > 1) advance(c, .25);
      if (state === 'left-swing' || state === 'right-swing') {
        const side = state === 'left-swing' ? -1 : 1;
        for (let i = 0; i < 360 && c.round.activeBox.angle * side < 17.5; i++) c.update(1 / 120);
        assert(c.round.activeBox.angle * side >= 17.5, 'source reaches the requested extreme swing');
      }
      if (isThrow) {
        let ready = false;
        for (let i = 0; i < 720; i++) {
          const box = c.round.activeBox;
          if (box.x > 110 && box.x < 145 && box.vx < -350) {ready = true; break;}
          c.update(1 / 120);
        }
        assert(ready, 'source reaches a tilted inward throw');
        c.onTouchStart(); c.update(0);
        if (state === 'throw-120ms') advance(c, .12);
        if (state === 'throw-280ms') advance(c, .28);
        assert.equal(c.round.phase, 'dropping');
      }
      if (state === 'failure') fail(c);
      if (state === 'pause') c.requestExit();
      assert.equal(c.round.height, target);
      if (state === 'failure') assert(c.resultOverlay.active && !c.hud.active);
      if (state === 'pause') assert(c.exitOverlay.active);
      const { svg, bounds } = renderScene(sceneFromController(c), height);
      const name = `${state}-750x${height}`;
      fs.writeFileSync(path.join(out, name + '.svg'), svg);
      await sharp(Buffer.from(svg)).png().toFile(path.join(out, name + '.png'));
      summaries.push({ name, width: 750, height, state, gameHeight: c.round.height, phase: c.round.phase,
        cameraY: c.cameraY, pivot: c.round.pivot, active: c.round.activeBox,
        graphics: { scenery: c.scenery.commands, rope: c.rope.commands }, bounds });
      console.log(path.join(out, name + '.png'));
    }
  }
  const hashes = Object.fromEntries([sourcePath, 'assets/scripts/truckStackFeedGameScene.ts', 'assets/scripts/truckStackRules.ts']
    .map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
  fs.writeFileSync(path.join(out, 'source-preview-metrics.json'), JSON.stringify({
    kind: 'source preview, not Cocos engine or device validation',
    rendering: 'Actual controller fixture transforms/Graphics commands + serialized scene hierarchy, Sprite/Label and Widget data. FeedResultPresentation title mapping reproduced. System text metrics are approximate.',
    hashes, summaries,
  }, null, 2) + '\n');
  // A contact sheet retains readable full-scene proportions, with explicit QA labels.
  const tileWidth = 300, titleHeight = 34, tileHeight = 684;
  const tiles = [];
  for (let i = 0; i < summaries.length; i++) {
    const s = summaries[i], x = i % states.length * tileWidth, y = Math.floor(i / states.length) * tileHeight;
    const label = `<svg width="300" height="34"><rect width="300" height="34" fill="#17232d"/><text x="150" y="23" text-anchor="middle" font-family="Arial" font-size="16" fill="white">SOURCE ${s.name}</text></svg>`;
    tiles.push({ input: Buffer.from(label), left: x, top: y });
    tiles.push({ input: await sharp(path.join(out, s.name + '.png')).resize({ width: tileWidth }).toBuffer(), left: x, top: y + titleHeight });
  }
  await sharp({ create: { width: tileWidth * states.length, height: tileHeight * 2, channels: 3, background: '#e1e6e8' } })
    .composite(tiles).png().toFile(path.join(out, 'contact-sheet.png'));
  console.log(`Source previews complete: ${out}; no Cocos build performed.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
