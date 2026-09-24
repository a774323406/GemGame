// Run after a Creator build: execute the actual bundled recognizer, not source TS.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { writingStyles, close28, close28Variations, open4, upright9, longFoot12Variations, phoneVideoSixes } = require('./math_exam_handwriting_fixtures.cjs');
const root = process.argv[2] || 'build/bytedance-mini-game';
const records = new Map(), modules = new Map();
const prefix = 'chunks:///_virtual/';
const context = vm.createContext({ System: { register(name, dependencies, declare) {
  if (typeof name !== 'string') { dependencies(() => {}, {}).execute(); return; }
  records.set(name, { dependencies, declare });
} } });
for (const file of ['src/chunks/bundle.js', 'assets/main/index.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
function load(name) {
  if (name === 'cc') return { cclegacy: { _RF: { push() {}, pop() {} } } };
  const id = name.startsWith(prefix) ? name : prefix + name.replace(/^\.\//, '');
  if (modules.has(id)) return modules.get(id);
  const record = records.get(id);
  assert(record, `Missing built module: ${id}`);
  const api = {}; modules.set(id, api);
  const module = record.declare((key, value) => {
    if (typeof key === 'object') Object.assign(api, key);
    else api[key] = value;
    return value;
  }, {});
  record.dependencies.forEach((dependency, index) => module.setters[index]?.(load(dependency)));
  module.execute();
  return api;
}
const recognize = load('handwrittenDigits.ts').recognizeHandwriting;
for (const { name, strokes } of phoneVideoSixes) {
  const result = recognize(strokes);
  assert.equal(result?.text, '6', `built recognizer, phone recording: ${name}`);
  const videoRound = new (load('mathExamRules.ts').MathExamRound)();
  assert(videoRound.submit(result.text), `phone recording must score: ${name}`);
  assert.equal(videoRound.score, 5);
  assert.equal(videoRound.questions[0].answer, 4, `phone recording must advance: ${name}`);
}
for (const [digit, style, paths] of writingStyles) {
  const strokes = paths.map(stroke => stroke.map(([x, y]) => ({ x, y })));
  assert.equal(recognize(strokes)?.text, digit, `built recognizer: ${digit}, ${style}`);
}
assert.equal(recognize(close28)?.text, '28');
for (const { name, strokes } of close28Variations) {
  const result = recognize(strokes);
  assert.equal(result?.text, '28', `built reported-28 variation: ${name}`);
  const pairRound = new (load('mathExamRules.ts').MathExamRound)();
  for (const answer of ['6', '4', '10']) assert(pairRound.submit(answer));
  assert(pairRound.submit(result.text));
  assert.equal(pairRound.score, 20, `built 4×7 progression: ${name}`);
}
assert.equal(recognize(open4)?.text, '4');
for (const { name, strokes } of longFoot12Variations) {
  const result = recognize(strokes);
  assert.equal(result?.text,'12',`built screenshot 12: ${name}`);
  assert.equal(recognize([strokes[1]])?.text,'2',`built screenshot 2 alone: ${name}`);
  const twelveRound = new (load('mathExamRules.ts').MathExamRound)();
  twelveRound.score=25;
  twelveRound.questions[0]={a:3,b:9,operator:'+',answer:12};
  assert(twelveRound.submit(result.text));
  assert.equal(twelveRound.score,30,'built 3+9 progresses from 25 to 30');
  assert.equal(twelveRound.submit(result.text),false,'12 remains incorrect on 3+1');
}
for (const strokes of [upright9, [upright9.flat()], upright9.slice().reverse().map(s=>s.slice().reverse())]) {
  const result = recognize(strokes);
  assert.equal(result?.text, '9', 'built screenshot 9 must not be confused with closed 4');
  const nineRound = new (load('mathExamRules.ts').MathExamRound)();
  nineRound.score = 25;
  nineRound.questions[0] = { a: 6, b: 3, operator: '+', answer: 9 };
  assert(nineRound.submit(result.text));
  assert.equal(nineRound.score, 30, 'built screenshot 6+3 progresses from 25 to 30');
  assert.equal(nineRound.submit(result.text), false, 'the same 9 stays incorrect on 3+1');
}
assert.equal(recognize([[{ x: 0, y: 0 }, { x: 90, y: 0 }]]), null);
const round = new (load('mathExamRules.ts').MathExamRound)();
const six = [[59,9],[33,15],[15,43],[11,74],[25,92],[51,92],[65,74],[57,55],[35,49],[13,64]];
assert(round.submit(recognize([six.map(([x, y]) => ({ x, y }))]).text));
assert.equal(round.score, 5);
assert.equal(round.questions[0].answer, 4, 'built round advances beyond the first question');
assert(round.submit(recognize(open4).text));
assert.equal(round.score, 10);
console.log(`Actual mini-game build: ${longFoot12Variations.length} screenshot-12 variations score on 3+9, screenshot 9 scores on 6+3, ${close28Variations.length} reported-28 variations score on 4×7, both phone-video sixes, ${writingStyles.length} handwriting forms, screenshot 4/28, noise rejection and first-question progression passed`);
