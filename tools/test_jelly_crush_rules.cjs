const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');

const exportsObject = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync('assets/scripts/jellyCrushRules.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
  { exports: exportsObject, Math, Number },
);
const { JellyCrushRound } = exportsObject;
const advance = round => { round.tick(0.1); round.tick(0.1); };
const advanceSeconds = (round, seconds) => {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += 0.1) round.tick(0.1);
};

let round = new JellyCrushRound();
assert.equal(round.lives, 5);
assert(Math.abs(round.targetSpeed - 114.4) < 1e-6, 'initial jelly speed should be 30% faster');
assert(round.start());
assert.equal(round.phase, 'countdown');
advanceSeconds(round, 2.9);
assert.equal(round.phase, 'countdown');
advanceSeconds(round, 0.2);
assert.equal(round.phase, 'playing');

round = new JellyCrushRound();
round.start();
advanceSeconds(round, 3.1);
advanceSeconds(round, 5);
assert(round.activeTargetCount >= 3, 'difficulty waves should introduce multiple simultaneous jellies');
assert(round.targets.filter(target => target.active).length >= 3, 'multiple-jelly wave should replenish active targets');

round = new JellyCrushRound();
round.start();
advanceSeconds(round, 3.1);
advanceSeconds(round, 7);
assert(round.speedSurgeMultiplier > 1, 'difficulty curve should trigger a sudden speed surge');

round = new JellyCrushRound(1);
round.waveTargetCount = 6;
round.targets.forEach(target => { target.active = false; });
round.ensureTargets();
const spawnedDirections = round.targets.filter(target => target.active).map(target => target.direction);
assert(spawnedDirections.every(direction => direction === 1) || spawnedDirections.every(direction => direction === -1), 'a wave can be heavily biased to one side');
const spawnedTargets = round.targets.filter(target => target.active);
assert(spawnedTargets.every(target => target.x < -390 || target.x > 390), 'new jellies should begin outside the playfield');

round = new JellyCrushRound(7919);
round.start();
advanceSeconds(round, 3.1);
let maxBurstTargets = 0;
let sawTargetBurst = false;
let sawTargetMultiplier = false;
for (let elapsed = 0; elapsed < 8; elapsed += 0.1) {
  round.tick(0.1);
  const activeBursts = round.targets.filter(target => target.speedBurstRemaining > 0);
  maxBurstTargets = Math.max(maxBurstTargets, activeBursts.length);
  sawTargetBurst ||= activeBursts.length > 0;
  sawTargetMultiplier ||= activeBursts.some(target => target.speedBurstMultiplier > 1);
}
assert(sawTargetBurst, 'a sudden speed burst should affect at least one jelly');
assert(maxBurstTargets <= 3, 'a sudden burst should affect at most three jellies');
assert(sawTargetMultiplier, 'a target burst should increase a jelly speed');

round = new JellyCrushRound();
round.start();
advanceSeconds(round, 3.1);
round.targets[0].x = 388;
round.targets[0].direction = 1;
advance(round);
assert.equal(round.lastEvent, 'escape');
assert.equal(round.escaped, 1);
assert.equal(round.lives, 4);

round = new JellyCrushRound();
round.start();
advanceSeconds(round, 3.1);
round.targets[0].x = 0;
round.targets[0].direction = 1;
round.press();
advance(round);
assert.equal(round.lastEvent, 'hit');
assert.equal(round.score, 1);
assert.equal(round.lives, 5);
assert.equal(round.lastEventTargetId, 0);

round = new JellyCrushRound();
round.start();
advanceSeconds(round, 3.1);
round.targets[0].x = -100;
round.targets[1].x = 100;
round.press();
advance(round);
assert.equal(round.lastEvent, 'hit');
assert.equal(round.score, 2);
assert.equal(round.lastEventTargetIds.length, 2);
assert.equal(round.lastEventTargetPositions.length, 2);

round = new JellyCrushRound();
round.start();
advanceSeconds(round, 3.1);
round.targets[0].x = 260;
round.targets[0].direction = 1;
round.press();
advance(round);
assert.equal(round.lastEvent, 'miss');
assert.equal(round.lives, 5);

round = new JellyCrushRound();
round.start();
advanceSeconds(round, 3.1);
round.score = 3;
round.elapsed = 7;
round.heartCooldown = 0;
round.tick(0.1);
assert(round.heart.active, 'life item should spawn after the first difficulty beat');
const heartX = round.heart.x;
round.tick(0.1);
assert.notEqual(round.heart.x, heartX, 'life item should move across the field');

round = new JellyCrushRound();
round.start();
advanceSeconds(round, 3.1);
round.targets.forEach(target => { target.active = false; });
round.tick(0.1);
assert.equal(round.remaining, Infinity, 'endless mode should not count down');
assert.equal(round.phase, 'playing', 'endless mode should not fail when time elapses');

round = new JellyCrushRound();
round.start();
advanceSeconds(round, 3.1);
round.targets.forEach(target => { target.active = false; });
round.clock.active = true;
round.clock.x = 0;
round.clock.y = -275;
round.clock.direction = 1;
const baseSpeed = round.targetSpeed;
round.press();
advance(round);
assert.equal(round.lastEvent, 'slow');
assert.deepEqual(Array.from(round.lastCollectedItems), ['slow']);
assert(round.targetSpeed < baseSpeed, 'slow item should reduce jelly speed');
advanceSeconds(round, 8.2);
assert.equal(round.slowRemaining, 0);
assert.equal(round.speedMultiplier, 1, 'slow effect should expire');

round = new JellyCrushRound();
round.start();
advanceSeconds(round, 3.1);
round.targets.forEach(target => { target.active = false; });
round.targets[0].active = true;
round.targets[0].x = 0;
round.heart.active = true;
round.heart.x = 0;
round.clock.active = true;
round.clock.x = 0;
round.lives = 4;
round.press();
advance(round);
assert.equal(round.lastEvent, 'hit', 'jelly hit should win over item-only event');
assert.equal(round.score, 1);
assert.deepEqual(Array.from(round.lastCollectedItems), ['heart', 'slow']);
assert.equal(round.lives, 5);

console.log('PASS jelly escape life loss, squash hit, and empty press does not cost life');
