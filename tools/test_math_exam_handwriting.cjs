const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const { close28Variations, open4, upright9, longFoot12Variations, writingStyles, phoneVideoSixes } = require('./math_exam_handwriting_fixtures.cjs');
const miniGameTransform = require('./math_exam_minigame_compile.cjs');
const api = {};
vm.runInNewContext(miniGameTransform(ts.transpileModule(fs.readFileSync('assets/scripts/handwrittenDigits.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText), { exports: api, Math, Number, String, Map, Set });
const recognize = api.recognizeHandwriting;

for (const { name, strokes } of phoneVideoSixes) {
  for (const scale of [0.5, 1, 2]) {
    const ink = strokes.map(s => s.map(p => ({ x: (p.x - 450) * scale, y: (p.y - 460) * scale })));
    assert.equal(recognize(ink)?.text, '6', `phone recording: ${name}, scale ${scale}`);
    assert.equal(recognize(ink.map(s => s.slice().reverse()))?.text, '6', `phone recording reversed: ${name}`);
  }
}

assert.equal(recognize(open4)?.text, '4', 'the clear open 4 in the second screenshot must be recognized');
assert.equal(recognize(open4.slice().reverse().map(s => s.slice().reverse()))?.text, '4', 'open 4 in another stroke order');
const variations = [
  ['normal', 1, 0, 0], ['narrow', 0.7, 0, 0], ['wide', 1.4, 0, 0],
  ['right lean', 1, 0.15, 0], ['left lean', 1, -0.15, 0],
  ['rising crossbar', 1, 0, -0.15], ['falling crossbar', 1, 0, 0.15],
];
const failures = [];
for (const { name, strokes } of longFoot12Variations) {
  for (const scale of [1, 2]) {
    const ink = strokes.map(s => s.map(p => ({ x: p.x * scale, y: p.y * scale })));
    for (const sample of [ink, ink.slice().reverse().map(s => s.slice().reverse())]) {
      const result = recognize(sample);
      if (result?.text !== '12') failures.push(`screenshot 12, ${name}, scale ${scale}: ${result?.text ?? 'rejected'}`);
    }
    if (recognize([ink[1]])?.text !== '2') failures.push(`screenshot 2 alone, ${name}`);
  }
}
for (const [variation, width, shearX, shearY] of variations) {
  for (const scale of [0.6, 1, 1.5]) {
    const ink = upright9.map(s => s.map(p => ({
      x: ((p.x - 260) * width + (p.y - 116) * shearX) * scale,
      y: (p.y - 116 + (p.x - 260) * shearY) * scale,
    })));
    for (const strokes of [ink, [ink.flat()], ink.slice().reverse().map(s => s.slice().reverse())]) {
      const result = recognize(strokes);
      if (result?.text !== '9') failures.push(`screenshot 9, ${variation}, scale ${scale}: ${result?.text ?? 'rejected'}`);
    }
  }
}
// The reported 28 must remain readable when written slightly narrower/slanted,
// or when the 2's finishing bar reaches into the 8's horizontal bounds.
for (const { name, strokes } of close28Variations) {
  for (const ink of [strokes, strokes.slice().reverse().map(s => s.slice().reverse())]) {
    const result = recognize(ink);
    if (result?.text !== '28') failures.push(`reported 28, ${name}: ${result?.text ?? 'rejected'}`);
  }
  for (const [index, want] of ['2', '8'].entries()) {
    if (recognize([strokes[index]])?.text !== want) failures.push(`reported ${want} alone, ${name}`);
  }
}
for (const [digit, style, paths] of writingStyles) {
  for (const [variation, width, shearX, shearY] of variations) {
    const ink = paths.map(s => s.map(([x, y]) => ({ x: 70 + x * width + y * shearX, y: 30 + y + x * shearY })));
    const result = recognize(ink);
    if (result?.text !== digit) failures.push(`${digit}, ${style}, ${variation}: ${result?.text ?? 'rejected'}`);
  }
}
// Each independent 2 style must work on both sides of all ten digits, not only
// when the current question happens to expect the screenshot's answer.
for (const [, style, paths] of writingStyles.filter(s => s[0] === '2')) {
  const two = paths.map(s => s.map(([x, y]) => ({ x, y })));
  for (let digit = 0; digit <= 9; digit++) {
    const other = writingStyles.find(s => s[0] === String(digit))[2]
      .map(s => s.map(([x, y]) => ({ x, y })));
    for (const [left, right, want] of [[two, other, `2${digit}`], [other, two, `${digit}2`]]) {
      const dx = Math.max(...left.flat().map(p => p.x)) - Math.min(...right.flat().map(p => p.x)) + 8;
      const ink = [...left, ...right.map(s => s.map(p => ({ x: p.x + dx, y: p.y })))];
      const result = recognize(ink);
      if (result?.text !== want) failures.push(`${style} in ${want}: ${result?.text ?? 'rejected'}`);
    }
  }
}
assert.deepEqual(failures, [], 'common forms and modest width/slant variations must be recognized');
for (const paths of [
  [[[0,0],[80,90]],[[80,0],[0,90]]], // X
  [[[40,0],[40,90]],[[0,45],[80,45]]], // +
  [[[0,15],[70,15]],[[0,70],[70,70]]], // =
  [[[0,0],[25,80],[45,0],[65,80],[85,0]]], // zigzag
]) {
  const ink = paths.map(s => s.map(([x,y]) => ({x,y})));
  assert.equal(recognize(ink), null, 'do not turn arbitrary marks into an answer');
  assert.equal(recognize(ink.slice().reverse().map(s => s.slice().reverse())), null, 'reversing a symbol does not make it a digit');
  const fragments = ink.flatMap(s => s.slice(1).flatMap((p, i) => {
    const middle = { x: (s[i].x + p.x) / 2, y: (s[i].y + p.y) / 2 };
    return [[s[i], middle], [middle, p]];
  }));
  assert.equal(recognize(fragments), null, 'pen lifts do not turn symbols into digits');
}
console.log(`Handwriting robustness: ${longFoot12Variations.length} screenshot-12 variations at two scales and both directions, 100 pairs with five 2 styles, 63 screenshot-9 cases, ${close28Variations.length} reported-28 variations, screenshot 4, phone-video sixes, ${writingStyles.length * variations.length} style/shape cases and non-digit marks passed`);
