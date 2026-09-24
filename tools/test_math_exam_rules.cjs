const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');

function load(file) {
  assert(fs.existsSync(file), `${file} must implement the math exam`);
  const out = {};
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { exports: out, Math, Number, String, Set, Map });
  return out;
}
const { MathExamRound, makeQuestion, EXAM_AD_SECONDS } = load('assets/scripts/mathExamRules.ts');
assert.equal(EXAM_AD_SECONDS, 30, 'each completed ad rewards the latest requested 30 seconds');
let seed = 17;
const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const operators = new Set();
for (let i = 0; i < 300; i++) {
  const q = makeQuestion(i, random);
  operators.add(q.operator);
  assert(q.a >= 0 && q.a <= 9 && q.b >= 0 && q.b <= 9);
  const answer = q.operator === '+' ? q.a + q.b : q.operator === '−' ? q.a - q.b : q.a * q.b;
  assert.equal(q.answer, answer);
  assert(answer >= 0 && answer <= 81);
}
assert.equal(operators.size, 3);
const round = new MathExamRound(random);
assert.equal(round.score, 0);
assert.equal(round.remaining, 60);
assert.equal(round.questions.length, 4);
assert.equal(round.questions.map(q => `${q.a}${q.operator}${q.b}=`).join(','), '9−3=,3+1=,8+2=,4×7=', 'opening paper matches the reference video');
assert.equal(round.submit(''), false, 'empty input must not answer a zero question');
assert.equal(round.submit(' '), false);
assert.equal(round.submit('0x10'), false);
const first = round.questions[0];
assert.equal(round.submit(String(first.answer + 1)), false);
assert.equal(round.score, 0);
assert.equal(round.questions[0], first, 'wrong answer must stay on same question');
assert.equal(round.submit(String(first.answer)), true);
assert.equal(round.score, 5);
assert.equal(round.correct, 1);
assert.notEqual(round.questions[0], first);
assert.equal(round.questions.length, 4);
round.tick(59.5);
assert.equal(round.remaining, 0.5);
round.tick(1);
assert.equal(round.remaining, 0);
assert.equal(round.submit(String(round.questions[0].answer)), false, 'time over locks answers');
const remainingQuestions = round.questions;
round.grantTime(EXAM_AD_SECONDS);
assert.equal(round.remaining, 30, 'revive restores 30 seconds');
assert.equal(round.score, 5);
assert.equal(round.correct, 1);
assert.equal(round.questions, remainingQuestions, 'reward preserves the current paper');
round.grantTime(EXAM_AD_SECONDS);
round.grantTime(EXAM_AD_SECONDS);
assert.equal(round.remaining, 90, 'add-time is not capped to the initial minute');
for (const invalid of [NaN, Infinity, -30, 0]) round.grantTime(invalid);
assert.equal(round.remaining, 90);
round.reset();
assert.equal(round.remaining, 60);
assert.equal(round.correct, 0);
round.tick(NaN); round.tick(-5); round.tick(Infinity);
assert.equal(round.remaining, 60);
console.log('Math exam rules: generation, scoring, invalid input, expiry and reset passed');

const { recognizeHandwriting } = load('assets/scripts/handwrittenDigits.ts');
const { close28 } = require('./math_exam_handwriting_fixtures.cjs');
// Hand-entered samples independent of the recognizer's internal templates.
const samples = {
  0: [[[49,8],[25,10],[12,31],[10,69],[25,90],[51,94],[69,74],[73,43],[64,16],[49,8]]],
  1: [[[26,23],[44,9],[41,49],[40,92]]],
  2: [[[12,26],[26,9],[47,9],[62,19],[64,36],[50,57],[17,89],[66,92]]],
  3: [[[13,14],[43,8],[65,19],[62,37],[39,49],[60,54],[69,73],[57,91],[28,94],[12,83]]],
  4: [[[55,9],[12,61],[74,62]],[[58,13],[57,94]]],
  5: [[[65,9],[17,12],[13,48],[40,42],[60,50],[67,72],[54,91],[27,94],[12,83]]],
  6: [[[59,9],[33,15],[15,43],[11,74],[25,92],[51,92],[65,74],[57,55],[35,49],[13,64]]],
  7: [[[11,13],[70,10],[48,51],[30,93]]],
  8: [[[35,48],[15,31],[20,13],[47,8],[63,20],[57,36],[35,48],[13,66],[14,84],[40,97],[65,83],[61,64],[35,48]]],
  9: [[[64,48],[42,54],[19,44],[15,25],[30,10],[57,11],[68,32],[60,69],[43,95]]],
};
function strokes(points, dx = 0, sx = 1, sy = 1) {
  return points.map(stroke => stroke.map(([x, y]) => ({ x: x * sx + dx, y: y * sy + 30 })));
}
for (const [digit, points] of Object.entries(samples)) {
  assert.equal(recognizeHandwriting(strokes(points))?.text, digit, `recognize held-out ${digit}`);
  assert.equal(recognizeHandwriting(strokes(points, 183, 1.4, 1.4))?.text, digit, `scale/translate ${digit}`);
  assert.equal(recognizeHandwriting(strokes(points).map(s => s.slice().reverse()))?.text, digit, `reverse writing direction ${digit}`);
}
for (const [text, digits] of [['24', [2, 4]], ['81', [8, 1]], ['10', [1, 0]]]) {
  const ink = [...strokes(samples[digits[0]]), ...strokes(samples[digits[1]], 105)];
  assert.equal(recognizeHandwriting(ink)?.text, text, `two digit ${text}`);
}
assert.equal(recognizeHandwriting(close28)?.text, '28', 'user screenshot: close 28 must not merge into 4');
for (const gapShift of [-4, -2, 0, 2, 8, 20]) {
  for (const scale of [1, 1.8, 2.4]) {
    const ink = close28.map((stroke, i) => stroke.map(p => ({
      x: (p.x + (i ? gapShift : 0)) * scale - 300,
      y: p.y * scale - 160,
    })));
    assert.equal(recognizeHandwriting(ink)?.text, '28', `28 gap shift ${gapShift}, scale ${scale}`);
    assert.equal(recognizeHandwriting(ink.slice().reverse().map(s => s.slice().reverse()))?.text, '28', 'stroke order and direction do not change the digits');
  }
}
// Pen lifts and erasing can leave many short strokes belonging to one digit.
for (const digit of [0, 2, 4, 8]) {
  const fragments = strokes(samples[digit]).flatMap(stroke => stroke.slice(1).map((p, i) => [stroke[i], p]));
  assert.equal(recognizeHandwriting(fragments)?.text, String(digit), `fragmented ${digit} must stay one digit`);
}
const twoLoop8 = [samples[8][0].slice(0, 7), samples[8][0].slice(6)];
assert.equal(recognizeHandwriting(strokes(twoLoop8))?.text, '8', 'vertically stacked loops are one 8, not 00');
const fragmented28 = close28.flatMap(stroke => stroke.slice(1).map((p, i) => [stroke[i], p]));
assert.equal(recognizeHandwriting(fragmented28)?.text, '28', 'pen lifts must not recreate the close-digit merge');
for (let a = 0; a <= 9; a++) for (let b = 0; b <= 9; b++) {
  const left = strokes(samples[a]);
  const leftMax = Math.max(...left.flat().map(p => p.x));
  const rightMin = Math.min(...samples[b].flat().map(p => p[0]));
  const ink = [...left, ...strokes(samples[b], leftMax - rightMin + 2)];
  assert.equal(recognizeHandwriting(ink)?.text, `${a}${b}`, `adjacent digits ${a}${b}`);
}
assert.equal(recognizeHandwriting([]), null);
assert.equal(recognizeHandwriting([[{ x: 0, y: 0 }, { x: 1, y: 1 }]]), null, 'ignore accidental taps');
assert.equal(recognizeHandwriting([[{ x: 0, y: 0 }, { x: 100, y: 0 }]]), null, 'horizontal scribble is not 1');
assert.equal(recognizeHandwriting([[{ x: NaN, y: 1 }]]), null);
assert.equal(recognizeHandwriting([...strokes(samples[2]), ...strokes(samples[4], 100), ...strokes(samples[7], 200)]), null, 'three digits are outside answer range');
console.log('Handwriting: 10 held-out digits, screenshot 28, spacing/overlap/scale, 100 adjacent pairs, fragmented strokes and noise passed');
