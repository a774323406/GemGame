const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');

const source = 'assets/scripts/airdropRescueRules.ts';
assert(fs.existsSync(source), 'airdrop rescue rules must exist before a round can be played');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: exportsObject });

const { AirdropRescueRound } = exportsObject;
assert.equal(typeof AirdropRescueRound, 'function');

function advance(round, seconds, frame = 1 / 120) {
  let remaining = seconds;
  while (remaining > 1e-9) {
    const dt = Math.min(frame, remaining);
    round.step(dt);
    remaining -= dt;
  }
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('starts with the video counters and a playable phase', () => {
  const round = new AirdropRescueRound({ random: () => 0.2 });
  assert.equal(round.timeRemaining, 300);
  assert.equal(round.food, 0);
  assert.equal(round.chances, 25);
  assert.equal(round.phase, 'ready');
  round.start();
  assert.equal(round.phase, 'playing');
});

test('release preserves horizontal inertia and enters falling state', () => {
  const round = new AirdropRescueRound({ random: () => 0.2 });
  round.start();
  const id = round.spawnTarget({ x: 20, y: 420, vx: 180, state: 'suspended' });
  assert(round.releaseTarget(id));
  const target = round.targets.find(item => item.id === id);
  assert.equal(target.state, 'falling');
  assert.equal(target.vx, 180);
  assert(target.vy > 0, 'release starts a downward fall');
});

test('a vegetable crossing the bottle mouth scores once', () => {
  const round = new AirdropRescueRound({ random: () => 0.2 });
  round.start();
  const id = round.spawnTarget({ x: 0, y: 360, vx: 0, state: 'suspended' });
  round.releaseTarget(id);
  advance(round, 0.8);
  assert.equal(round.food, 1);
  assert.equal(round.chances, 25);
  assert.equal(round.targets.filter(item => item.id === id).length, 0);
  assert.equal(round.drainEvents().filter(event => event.kind === 'caught').length, 1);
});

test('a vegetable outside the bottle costs one chance once', () => {
  const round = new AirdropRescueRound({ random: () => 0.2 });
  round.start();
  const id = round.spawnTarget({ x: 220, y: 360, vx: 0, state: 'suspended' });
  round.releaseTarget(id);
  advance(round, 1.2);
  assert.equal(round.food, 0);
  assert.equal(round.chances, 24);
  assert.equal(round.targets.filter(item => item.id === id).length, 0);
  assert.equal(round.drainEvents().filter(event => event.kind === 'miss').length, 1);
});

test('unreleased helicopters can leave the screen without costing a chance and multiple targets coexist', () => {
  const round = new AirdropRescueRound({ random: () => 0.2 });
  round.start();
  const first = round.spawnTarget({ x: 330, y: 560, vx: 280, state: 'suspended' });
  const second = round.spawnTarget({ x: -120, y: 600, vx: -80, state: 'suspended' });
  assert.notEqual(first, second);
  assert(round.targets.length >= 2, 'manual targets coexist with the initial spawn');
  advance(round, 1.2);
  assert.equal(round.chances, 25);
  assert(round.targets.length < 3, 'at least one off-screen target is recycled');
});

test('food target, chance exhaustion and timeout end the round', () => {
  const success = new AirdropRescueRound({ random: () => 0.2 });
  success.start();
  for (let i = 0; i < 5; i++) {
    const id = success.spawnTarget({ x: 0, y: 360, vx: 0, state: 'suspended' });
    success.releaseTarget(id);
    advance(success, 0.8);
  }
  assert.equal(success.food, 5);
  assert.equal(success.phase, 'success');

  const failure = new AirdropRescueRound({ random: () => 0.2 });
  failure.start();
  for (let i = 0; i < 25; i++) {
    const id = failure.spawnTarget({ x: 220, y: 360, vx: 0, state: 'suspended' });
    failure.releaseTarget(id);
    advance(failure, 1.2);
  }
  assert.equal(failure.chances, 0);
  assert.equal(failure.phase, 'failure');

  const timeout = new AirdropRescueRound({ random: () => 0.2 });
  timeout.start();
  advance(timeout, 300.1);
  assert.equal(timeout.phase, 'failure');
});

test('revive is repeatable, preserves food and restores five chances', () => {
  const round = new AirdropRescueRound({ random: () => 0.2 });
  round.start();
  round.food = 3;
  round.chances = 0;
  round.phase = 'failure';
  assert(round.revive());
  assert.equal(round.food, 3);
  assert.equal(round.chances, 5);
  round.chances = 0;
  round.phase = 'failure';
  assert(round.revive(), 'a second completed ad can revive the same session');
  assert.equal(round.chances, 5);
});

for (const { name, fn } of tests) {
  fn();
  console.log(`PASS ${name}`);
}
console.log(`PASS ${tests.length} airdrop rescue rule checks`);
