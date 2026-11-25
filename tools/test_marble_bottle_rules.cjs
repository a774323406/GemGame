const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const source = fs.readFileSync('assets/scripts/marbleBottleRules.ts', 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const exportsObject = {};
vm.runInNewContext(output.outputText, { exports: exportsObject });
const { MarbleBottleRound, LANE_Y } = exportsObject;

const fresh = () => new MarbleBottleRound();
let r = fresh();
assert.equal(r.balls.length, 18);
assert.equal(r.remaining, 18);
assert(r.balls[0].x >= 375, 'first marble enters from the right');
assert(r.balls.slice(1).every(ball => ball.x > 386), 'future marbles start off screen');
assert.equal(r.balls[1].x - r.balls[0].x, 144);
r.tick(r.balls[0].x / 160);
assert(Math.abs(r.balls[0].x) < 1e-6, 'first ball travels left at the reference speed');
assert(r.strike());
assert(!r.strike());
assert.equal(r.remaining, 17);
r.tick(.04);
assert(r.cueExtension > .9);
assert.equal(r.balls[0].y, LANE_Y, 'cue reaches the launch position first');
r.tick(.1);
assert(r.balls[0].y > 20);
assert.equal(r.balls[0].x, 0);
assert.equal(r.pocketed, 0, 'the score follows the visible launch');
r.tick(.5);
assert.equal(r.pocketed, 1);
assert.equal(r.balls[0].state, 'stored');

r = fresh();
r.tick(.2);
assert(!r.strike(), 'an off-center stroke misses');
assert.equal(r.remaining, 18);
assert(!r.strike());
const x = r.balls[0].x;
r.tick(NaN);
r.tick(-1);
assert.equal(r.balls[0].x, x);
r.slowDown();
r.slowDown();
assert.equal(r.speedMultiplier, .72 ** 2);
r.tick(.1);
assert(Math.abs(r.balls[0].x - x + 16 * .72 ** 2) < 1e-8);

function play(previewTime, firstShot, shotCount) {
    const round = fresh();
    round.startAtPreview(previewTime);
    const previous = new Set();
    let shot = 0;
    for (let frame = 0; frame < 3000 && round.phase === 'playing'; frame++) {
        const aligned = round.balls.find(ball => ball.state === 'lane' && Math.abs(ball.x) <= 17);
        if (aligned && !previous.has(aligned)) {
            previous.add(aligned);
            if (previous.size >= firstShot && shot < shotCount) {
                assert(round.strike(), 'every timed stroke hits');
                shot++;
            }
        }
        round.tick(1 / 120);
    }
    return { round, opportunities: previous.size };
}
for (const time of [0, .2, .605, 6.91, 24.1, 1001.123]) {
    let game = play(time, 1, 0);
    assert.equal(game.opportunities, 18, 'all 18 get a chance after any length of preview');
    assert.equal(game.round.phase, 'failure');
    assert.equal(game.round.remaining, 0);
    game = play(time, 9, 10);
    assert.equal(game.round.phase, 'success', 'a tenth pocket on the last marble wins');
    assert.equal(game.round.pocketed, 10);
    assert(!game.round.strike());
    assert.equal(new Set(game.round.balls.filter(b => b.state === 'stored').map(b => b.x + ',' + b.y)).size, 10);
    for (const b of game.round.balls.filter(b => b.state === 'stored')) {
        assert(Math.abs(b.x) + 11 <= 39 && b.y + 11 <= 335, 'stack stays inside the bottle');
    }
}
r = play(.2, 10, 9).round;
assert.equal(r.phase, 'failure');
assert.equal(r.pocketed, 9);
r = play(0, 1, 10).round;
assert.equal(r.phase, 'success');
assert(r.remaining > 0, 'victory ends the stream immediately at ten');
console.log('PASS 18 timed opportunities, hit/miss, flight/stack, slowdown, last-ball win/loss and early victory');
