const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const source = fs.readFileSync('assets/scripts/knifeClimbRules.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const exported = {};
vm.runInNewContext(compiled.outputText, { exports: exported });
const { KnifeClimbRound, bladeY, GOAL_Y, KNIFE_COUNT } = exported;
const fresh = () => new KnifeClimbRound();

let r = fresh();
assert.equal(r.foodY, bladeY(0));
r.tick(10);
assert.equal(r.phase, 'ready');
assert(r.foodY > bladeY(0));
assert.equal(r.timeLeft, 8);
assert.equal(r.lockedCount, 1);
assert.equal(r.tap(), false);
assert.equal(r.blades[1].state, 'waiting');

function startRound(round) {
    assert.equal(round.blades[0].x, -295);
    assert.equal(round.landed, 1);
    round.start();
    assert.equal(round.phase, 'playing');
}

function nextLanding(round) {
    const layer = round.landed;
    let guard = 0;
    while (round.phase === 'playing' && round.landed === layer && guard++ < 20000) {
        if (round.foodY >= bladeY(layer) + 20 && round.velocityY > 0 && round.blades[layer].state === 'waiting') {
            assert(round.tap());
        }
        round.tick(1 / 100);
    }
    assert.equal(round.landed, layer + 1);
}

// Three separate presses during one bounce must all start moving immediately.
const volley = fresh();
startRound(volley);
volley.tick(.9);
for (let i = 1; i <= 3; i++) {
    assert(volley.tap());
    volley.tick(.03);
    assert(volley.blades[i].x < -8, 'each tap moves its own blade before touchdown');
    assert.equal(volley.landed, 1);
}
assert(volley.blades[1].x < volley.blades[2].x && volley.blades[2].x < volley.blades[3].x);
volley.tick(1.5);
assert.equal(volley.landed, 4, 'descending feet catch the highest reachable knife');
assert(volley.blades.slice(0, 4).every(blade => blade.x === -295));
while (volley.timeLeft > 0 && volley.phase === 'playing') volley.tick(.1);
assert(volley.revive());
assert.equal(volley.foodY, bladeY(3));
assert(volley.tap());
assert(volley.tap());
volley.tick(.17);
assert.equal(volley.failureReason, 'side', 'a later press cannot cancel another blade hitting the food');
assert(volley.revive());
assert.equal(volley.landed, 4);
assert.equal(volley.blades[4].state, 'waiting');
assert.equal(volley.blades[5].state, 'hidden');

startRound(r);
assert(r.timeLeft > 7.98);
r.tick(6);
assert.equal(r.landed, 1);
assert(r.timeLeft < 2.01 && r.timeLeft > 1.98, 'bouncing on the same knife does not refill time');
r.tick(2.1);
assert.equal(r.failureReason, 'timeout');
assert(r.revive());
assert.equal(r.foodY, bladeY(0));
assert.equal(r.blades[0].state, 'locked');
assert.equal(r.timeLeft, 8);

for (let checkpoint = 1; checkpoint < KNIFE_COUNT; checkpoint++) {
    assert.equal(r.landed, checkpoint);
    assert(r.tap(), 'fire immediately after landing while body crosses next blade height');
    r.tick(.16);
    assert.equal(r.failureReason, 'side');
    assert.equal(r.landed, checkpoint);
    assert(r.revive());
    assert(!r.revive());
    assert.equal(r.foodY, bladeY(checkpoint - 1));
    assert.equal(r.timeLeft, 8);
    assert.equal(r.blades.filter(blade => blade.state === 'locked').length, checkpoint);
    assert.equal(r.blades.filter(blade => blade.state === 'waiting').length, 1);
    nextLanding(r);
}
assert.equal(r.phase, 'finishing');
assert.equal(r.foodX, -155);
assert(!r.tap());
r.tick(.75);
assert(r.foodX < -155 && r.foodY > GOAL_Y, 'final hop crosses leftwards above the actual flag ledge');
r.tick(2);
assert.equal(r.phase, 'success');
assert.equal(r.foodX, -319);
assert.equal(r.foodY, GOAL_Y);
assert(!r.revive());

r = fresh();
for (let i = 0; i < 6; i++) r.slowDown();
const slow = .72 ** 6;
assert(Math.abs(r.speedMultiplier - slow) < 1e-12);
startRound(r);
r.tick(2);
assert(Math.abs(r.foodY - (bladeY(0) + 692 * 2 * slow - .5 * 545 * (2 * slow) ** 2)) < 1e-6);
assert(Math.abs(r.timeLeft - (8 - 2 * slow)) < 1e-7, 'action timer follows scaled motion');
r.tick(8 / slow);
assert.equal(r.failureReason, 'timeout');
r.revive();
assert(Math.abs(r.speedMultiplier - slow) < 1e-12);
while (r.landed < KNIFE_COUNT) nextLanding(r);
r.tick(2 / slow);
assert.equal(r.phase, 'success', 'even after six rewards all platforms and the flag remain reachable');
console.log('PASS opening bounce, pre-inserted knife, side hit, 8-second timer, all 12 catches, all revives, repeated slowdown and final flag hop');

for (const [index, [name, count, width, height]] of [
    ['烤苕皮', 12, 84, 188], ['苹果', 22, 136, 142], ['西瓜', 35, 154, 148],
].entries()) {
    const stageRound = new KnifeClimbRound(index + 1);
    assert.equal(stageRound.stage.name, name);
    assert.equal(stageRound.blades.length, count);
    assert.equal(stageRound.stage.width, width);
    assert.equal(stageRound.stage.height, height);
    assert.equal(stageRound.goalY, bladeY(count - 1) + 96);
    startRound(stageRound);
    while (stageRound.landed < count - 1) nextLanding(stageRound);
    const top = bladeY(count - 1);
    while (stageRound.velocityY >= 0 || stageRound.foodY > top + 55) stageRound.tick(.002);
    assert(stageRound.tap());
    assert(!stageRound.tap(), 'the stage does not issue a knife past its quota');
    while (stageRound.landed < count && stageRound.phase === 'playing') stageRound.tick(.002);
    assert.equal(stageRound.landed, count, 'feet caught the last knife before it finished sliding');
    assert.equal(stageRound.lockedCount, count - 1);
    assert.equal(stageRound.phase, 'playing', 'finish hop waits for the last knife to embed');
    stageRound.tick(.2);
    assert.equal(stageRound.lockedCount, count);
    assert(stageRound.blades.every(blade => blade.state === 'locked' && blade.x === -295));
    stageRound.tick(3);
    assert.equal(stageRound.phase, 'finishing', 'all knives alone do not win the stage');
    stageRound.tick(2);
    assert.equal(stageRound.phase, 'success');
    assert.equal(stageRound.foodY, stageRound.goalY);
    assert(stageRound.foodX - width / 2 >= -367 && stageRound.foodX <= -263);
    assert(Math.abs(stageRound.goalY - stageRound.cameraHeight + 170) < .1);

    // Position each sprite at the same point to distinguish the actual width and height checks.
    const widthCheck = new KnifeClimbRound(index + 1);
    widthCheck.start();
    widthCheck.velocityY = 0;
    widthCheck.foodY = bladeY(1) - 20;
    widthCheck.tap();
    widthCheck.tick(.055);
    assert.equal(widthCheck.failureReason, index === 0 ? null : 'side');
    const heightCheck = new KnifeClimbRound(index + 1);
    heightCheck.start();
    heightCheck.velocityY = 0;
    heightCheck.foodY = bladeY(1) - 155;
    heightCheck.tap();
    heightCheck.tick(.12);
    assert.equal(heightCheck.failureReason, index === 0 ? 'side' : null);
}
assert.throws(() => new KnifeClimbRound(4), /stage/);
console.log('PASS 12/22/35 physical knife locks, per-food collisions, late final volleys, in-bounds flag landings and stage camera heights');
