const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const file = 'assets/scripts/inkEraser.ts';
assert(fs.existsSync(file), 'drag eraser must clip ink locally instead of clearing all answers');
const out = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
} }).outputText, { exports: out, Math, Number });
const erase = out.eraseInkAlongPath;
const p = (x, y) => ({ x, y });
const plain = value => JSON.parse(JSON.stringify(value));

// A narrow swipe must split a sparse line whose endpoints are both outside the eraser.
const original = [[p(-50, 0), p(50, 0)], [p(-50, 60), p(50, 60)]];
const cut = erase(original, p(0, -20), p(0, 20), 10);
assert.deepEqual(plain(cut), [
  [p(-50, 0), p(-10, 0)], [p(10, 0), p(50, 0)], [p(-50, 60), p(50, 60)],
], 'a swipe clips only the crossed part, never a whole stroke or an unrelated digit');
assert.deepEqual(original, [[p(-50, 0), p(50, 0)], [p(-50, 60), p(50, 60)]], 'input ink remains immutable');

const dot = erase([[p(-30, 0), p(30, 0)]], p(0, 0), p(0, 0), 10);
assert.deepEqual(plain(dot), [[p(-30, 0), p(-10, 0)], [p(10, 0), p(30, 0)]], 'stationary nozzle erases a circular patch');
assert.deepEqual(plain(erase([[p(-20, 6), p(20, 6)]], p(0, 0), p(0, 0), 10)),
  [[p(-20, 6), p(-8, 6)], [p(8, 6), p(20, 6)]], 'curved eraser edge clips the correct chord, not a rectangular box');
assert.deepEqual(plain(erase([[p(0, 0)], [p(0, 50)]], p(-100, 0), p(100, 0), 8)), [[p(0, 50)]], 'fast movement erases all the way between input events');
assert.deepEqual(plain(erase([[p(-5, 0), p(5, 0)]], p(0, 0), p(0, 0), 10)), [], 'fully covered ink is removed from recognition data');
assert.deepEqual(plain(erase(cut, p(0, -20), p(0, 20), 10)), plain(cut), 'repeated passes never join erased gaps');
assert.deepEqual(plain(erase(original, p(200, 200), p(220, 200), 10)), original, 'moving away from ink preserves every stroke');
assert.deepEqual(plain(erase(original, p(0, 0), p(0, 0), 0)), original, 'zero-size eraser changes nothing');
console.log('Drag eraser: partial clipping, sparse and fast swipes, dots, full removal, repeat passes and input preservation passed');
