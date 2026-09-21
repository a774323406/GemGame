const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');

function loadRules() {
  const source = fs.readFileSync('assets/scripts/whiteGooseRoundRules.ts', 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const output = {};
  vm.runInNewContext(code, {
    exports: output,
    module: { exports: output },
    Math,
    Set,
    Error,
  });
  return output;
}

const {
  AD_RING_COUNT,
  GOOSE_SLOT_COUNT,
  INITIAL_RING_COUNT,
  TARGET_GOOSE_COUNT,
  WhiteGooseRound,
  isCatchSuccessful,
} = loadRules();

assert.equal(GOOSE_SLOT_COUNT, 10);
assert.equal(TARGET_GOOSE_COUNT, 7);
assert.equal(INITIAL_RING_COUNT, 10);
assert.equal(AD_RING_COUNT, 5);

{
  const round = new WhiteGooseRound(() => 0);
  assert.deepEqual(Array.from(round.snapshot.activeSlots), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(new Set(round.snapshot.activeSlots).size, 7);
  assert.equal(round.snapshot.ringsRemaining, 10);
  assert.equal(round.beginThrow(), true);
  assert.equal(round.beginThrow(), false, 'a throw cannot start while another is in flight');
  assert.equal(round.resolveThrow(false).status, 'playing');
  for (let index = 0; index < 6; index += 1) {
    assert.equal(round.beginThrow(), true);
    round.resolveThrow(true);
  }
  for (let index = 0; index < 2; index += 1) {
    assert.equal(round.beginThrow(), true);
    round.resolveThrow(false);
  }
  assert.equal(round.snapshot.ringsRemaining, 1);
  assert.equal(round.beginThrow(), true);
  assert.equal(round.resolveThrow(true).status, 'won', 'the final ring may catch the seventh goose');
  assert.equal(round.grantRings(5), false, 'won rounds cannot revive');
  assert.equal(round.beginThrow(), false, 'won rounds reject new throws');
}

assert.equal(isCatchSuccessful('s2', false, 0.699999), true);
assert.equal(isCatchSuccessful('s4', false, 0.7), false);
assert.equal(isCatchSuccessful('s1', false, 0), false);
assert.equal(isCatchSuccessful('s3', true, 0), false);
assert.throws(() => isCatchSuccessful('s2', false, NaN), /randomValue/);

{
  const failed = new WhiteGooseRound(() => 0.5);
  for (let index = 0; index < 10; index += 1) {
    assert.equal(failed.beginThrow(), true);
    failed.resolveThrow(false);
  }
  assert.equal(failed.snapshot.status, 'lost');
  assert.equal(failed.grantRings(), true);
  assert.equal(failed.snapshot.status, 'playing');
  assert.equal(failed.snapshot.ringsRemaining, 5);
  assert.equal(failed.snapshot.ringLimit, 15);
  assert.throws(() => failed.grantRings(0), /count/);
}

{
  const round = new WhiteGooseRound(() => 0.5);
  assert.throws(() => round.resolveThrow(false), /in flight/);
  round.beginThrow();
  round.reset();
  assert.equal(round.snapshot.throwInFlight, false);
  assert.equal(round.snapshot.caughtCount, 0);
  assert.equal(round.snapshot.ringsRemaining, 10);
}

console.log('White goose rules tests passed');
