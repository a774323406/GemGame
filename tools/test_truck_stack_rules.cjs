const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');

const source = 'assets/scripts/truckStackRules.ts';
assert(fs.existsSync(source), 'truck stack rules must exist before a round can be played');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: exportsObject });
const { TruckStackRound, BOX_WIDTH, BOX_HEIGHT, MAX_VISIBLE_BOXES } = exportsObject;

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function advance(round, seconds, frame = 1 / 120) {
  let remaining = seconds;
  while (remaining > 1e-9) {
    const dt = Math.min(frame, remaining);
    round.tick(dt);
    remaining -= dt;
  }
}
function until(round, predicate, seconds = 6, frame = 1 / 120) {
  for (let elapsed = 0; elapsed < seconds && !predicate(); elapsed += frame) round.tick(frame);
  assert(predicate(), `round did not reach the expected state within ${seconds}s; got ${round.phase}`);
}
function top(round) { return round.boxes[round.boxes.length - 1]; }
function releaseAt(round, x) {
  assert.equal(round.phase, 'swinging');
  // These fixtures isolate support/sway from the separately tested natural throw.
  round.activeBox.x = x;
  assert(round.drop());
  round.activeBox.vx = 0;
  round.activeBox.vy = 0;
}
function landAt(round, x) {
  const height = round.height;
  releaseAt(round, x);
  until(round, () => round.phase === 'settling' || round.phase === 'falling');
  assert.equal(round.phase, 'settling');
  assert.equal(round.height, height + 1);
  until(round, () => round.phase === 'swinging');
}
function roundAtHeight(height, x = 0) {
  const round = new TruckStackRound();
  while (round.height < height) landAt(round, round.height === 1 ? Math.max(-100, Math.min(100, x)) : x);
  return round;
}
function observeSwing(round) {
  const crossings = [];
  let previousX = round.activeBox.x;
  let maximumX = 0, maximumAngle = 0;
  for (let step = 1; step <= 1200 && crossings.length < 3; step++) {
    round.tick(1 / 120);
    const box = round.activeBox;
    if (previousX < 0 && box.x >= 0) crossings.push(step / 120);
    previousX = box.x;
    maximumX = Math.max(maximumX, box.x);
    maximumAngle = Math.max(maximumAngle, box.angle);
  }
  assert.equal(crossings.length, 3, 'the swinging box repeatedly crosses the usable target');
  return { period: (crossings[2] - crossings[0]) / 2, maximumX, maximumAngle };
}

test('rig lift is finite and clamped while following the actual stack top', () => {
  for (const [requested, expected] of [[undefined, 800], [780.3, 780.3], [698, 698], [1, 650], [1500, 1100], [NaN, 800], [Infinity, 800]]) {
    const round = new TruckStackRound(requested);
    assert.equal(round.rigLift, expected);
    assert.equal(round.pivot.y, 124 + expected);
    landAt(round, 0);
    assert.equal(round.pivot.y, 248 + expected);
  }
});

test('the first four metres share an easy swing, then difficulty reaches its late cap', () => {
  const first = observeSwing(roundAtHeight(1));
  const fourth = observeSwing(roundAtHeight(4));
  const fifth = observeSwing(roundAtHeight(5));
  const twentieth = observeSwing(roundAtHeight(20));
  const fortieth = observeSwing(roundAtHeight(40));
  const sixtieth = observeSwing(roundAtHeight(60));
  assert(Math.abs(first.period - 3.2) < 1 / 120);
  assert(Math.abs(fourth.period - first.period) < 1 / 120);
  assert(Math.abs(fourth.maximumAngle - first.maximumAngle) < 0.01);
  assert(fifth.period < fourth.period - 0.08, 'the fifth metre starts accelerating');
  assert(fifth.maximumAngle > fourth.maximumAngle + 0.3);
  assert(Math.abs(twentieth.period - 1.4) < 1 / 120);
  assert(twentieth.maximumX > first.maximumX + 45, 'higher tiers also use a wider swing');
  assert(Math.abs(twentieth.maximumAngle - 18) < 0.01);
  assert(Math.abs(fortieth.period - 1.3) < 1 / 120);
  assert(Math.abs(sixtieth.period - fortieth.period) < 1 / 120);
});

test('release preserves the visible pose and carries a real throw in either direction', () => {
  for (const direction of [-1, 1]) {
    const round = roundAtHeight(20);
    let motion = 0;
    until(round, () => {
      const before = round.activeBox.x;
      round.tick(1 / 120);
      motion = round.activeBox.x - before;
      return motion * direction > 2 && round.activeBox.x * direction < -80
        && round.activeBox.x * direction > -140 && Math.abs(round.activeBox.angle) > 6;
    });
    const pose = { ...round.activeBox };
    assert(round.drop());
    assert.equal(round.activeBox.x, pose.x);
    assert.equal(round.activeBox.y, pose.y);
    assert.equal(round.activeBox.angle, pose.angle, 'the click cannot abruptly rotate the visible box');
    assert(round.activeBox.vx * direction > 50, 'release inherits the visible travel direction');
    round.tick(1 / 120);
    assert(Math.abs(round.activeBox.angle - pose.angle) < 1, 'rotation is continuous on the first falling frame');
    advance(round, 0.09);
    assert((round.activeBox.x - pose.x) * direction > 8, 'the actual falling body travels sideways');
    assert(Math.abs(round.activeBox.angle) > 2, 'the box retains tilt during the visible early arc');
    until(round, () => round.phase !== 'dropping');
    assert.equal(round.phase, 'settling', 'an inward throw can land successfully');
    assert.equal(top(round).angle, 0);
    assert((top(round).x - pose.x) * direction > 20, 'scoring uses the thrown landing position');
  }
});

test('natural falls are brisk and the rotated bottom stays above support until contact', () => {
  for (const rigLift of [650, 698, 780.3, 1100]) {
    for (const time of [0, 0.2, 0.45, 0.8, 1.2]) {
      const round = new TruckStackRound(rigLift);
      advance(round, time);
      const surface = top(round).y + BOX_HEIGHT / 2;
      round.drop();
      let elapsed = 0;
      while (round.phase === 'dropping' && elapsed < 1) {
        const box = round.activeBox, angle = box.angle * Math.PI / 180;
        const bottom = box.y - Math.abs(Math.sin(angle)) * BOX_WIDTH / 2 - Math.abs(Math.cos(angle)) * BOX_HEIGHT / 2;
        assert(bottom >= surface - 0.01, 'tilt cannot put an airborne corner through the support plane');
        round.tick(1 / 120); elapsed += 1 / 120;
      }
      assert(elapsed >= 0.2 && elapsed <= 0.5, `normal release reaches the stack briskly, got ${elapsed}s`);
    }
  }
});

test('late throws stay within the screen and never snap a newly landed box at either rig limit', () => {
  for (const rigLift of [650, 1100]) {
    for (const stackX of [-210, 0, 210]) {
      const source = new TruckStackRound(rigLift);
      while (source.height < 40) landAt(source, source.height === 1 ? Math.max(-100, Math.min(100, stackX)) : stackX);
      for (let sample = 0; sample < 170; sample++) {
        source.tick(1 / 120);
        const round = Object.assign(Object.create(Object.getPrototypeOf(source)), structuredClone({ ...source }));
        const surface = top(round).y + BOX_HEIGHT / 2;
        round.drop();
        while (round.phase === 'dropping') {
          const box = round.activeBox, angle = box.angle * Math.PI / 180;
          const halfWidth = Math.abs(Math.cos(angle)) * BOX_WIDTH / 2 + Math.abs(Math.sin(angle)) * BOX_HEIGHT / 2;
          const halfHeight = Math.abs(Math.sin(angle)) * BOX_WIDTH / 2 + Math.abs(Math.cos(angle)) * BOX_HEIGHT / 2;
          assert(Math.abs(box.x) + halfWidth <= 375, 'the full thrown box remains visible throughout its arc');
          assert(box.y - halfHeight >= surface - 0.01, 'the tilted corner stays above the support until flat contact');
          round.tick(1 / 120);
        }
        if (round.phase === 'settling') {
          const landedX = top(round).x;
          assert(Math.abs(landedX) <= 235, 'a landed box leaves at least two units inside the 750-wide playfield');
          round.tick(1 / 120);
          assert(Math.abs(top(round).x - landedX) < 0.7, 'sway must not clamp a thrown landing to a different x');
        }
      }
    }
  }
});

test('fractional-step contact uses the thrown x at impact, not release or frame end', () => {
  for (const [x, vx, phase] of [[129, 1000, 'falling'], [135, -1000, 'settling'], [140, -1000, 'falling']]) {
    const round = new TruckStackRound();
    releaseAt(round, x);
    round.activeBox.y = 286;
    round.activeBox.vy = -24000;
    round.activeBox.vx = vx;
    round.tick(1 / 120);
    assert.equal(round.phase, phase, `impact-time support for x=${x}, vx=${vx}`);
    const landedX = phase === 'settling' ? top(round).x : round.activeBox.x;
    assert(Math.abs(landedX - x) > 4 && Math.abs(landedX - x) < 4.3, 'only travel up to contact belongs to the impact');
  }
});

test('the same visible pose throws more gently when the pendulum is slowed', () => {
  const normal = roundAtHeight(20), slowed = roundAtHeight(20);
  slowed.slowDown();
  advance(normal, 0.25); advance(slowed, 0.5);
  assert(Math.abs(normal.activeBox.x - slowed.activeBox.x) < 1e-8);
  normal.drop(); slowed.drop();
  assert(Math.abs(normal.activeBox.vx) > 50, 'a normal release has actual horizontal inertia');
  assert(Math.abs(slowed.activeBox.vx * 2 - normal.activeBox.vx) < 1e-8, 'slowdown transfers the actual slower swing velocity');
  const yNormal = normal.activeBox.vy, ySlow = slowed.activeBox.vy;
  advance(normal, 0.1); advance(slowed, 0.1);
  assert(Math.abs((normal.activeBox.vy - yNormal) - (slowed.activeBox.vy - ySlow)) < 1e-8, 'gravity remains independent of the ad reward');
});

test('a centered release lands exactly on the existing top and scores once', () => {
  const round = new TruckStackRound();
  assert.equal(round.height, 1);
  assert.equal(round.boxes.length, 1);
  assert.equal(top(round).y, 62, 'the initial box rests on the truck deck at y=0');
  const id = round.activeBox.id;
  releaseAt(round, 0);
  assert(!round.drop(), 'a fast duplicate tap cannot spawn or release another box');
  until(round, () => round.phase === 'settling');
  assert.equal(round.height, 2);
  assert.equal(round.boxes.length, 2);
  assert.equal(top(round).id, id);
  assert.equal(top(round).x, 0);
  assert.equal(top(round).y, 186, 'two 124-high boxes must touch without penetrating');
  assert(!round.drop(), 'input stays disabled during impact settling');
  const events = round.drainEvents();
  assert.equal(events.filter(event => event.kind === 'land').length, 1);
  assert.equal(events.filter(event => event.kind === 'perfect').length, 1);
  assert.equal(round.drainEvents().length, 0, 'events are consumed once');
  advance(round, 0.1);
  assert.equal(round.phase, 'settling', 'impact is visible before a new suspended box appears');
  advance(round, 0.2);
  assert.equal(round.phase, 'swinging');
  assert.notEqual(round.activeBox.id, id);
  assert.equal(round.height, 2);
});

test('sufficient off-center support retains the player landing x without snapping', () => {
  const round = new TruckStackRound();
  releaseAt(round, 120);
  until(round, () => round.phase === 'settling');
  assert.equal(top(round).x, 120, 'support success must never secretly center the box');
  assert.equal(top(round).y, 186);
  assert.equal(round.drainEvents().filter(event => event.kind === 'perfect').length, 0);
});

test('insufficient edge support visibly tips before failing without increasing height', () => {
  for (const x of [-145, 145]) {
    const round = new TruckStackRound();
    releaseAt(round, x);
    until(round, () => round.phase === 'falling');
    assert.equal(round.height, 1);
    assert.equal(round.boxes.length, 1);
    assert.equal(round.activeBox.x, x, 'edge contact does not rewrite the landing coordinate');
    advance(round, 0.12);
    assert(Math.abs(round.activeBox.angle) > 0, 'an unsupported box rotates before the failure overlay');
    assert.equal(round.phase, 'falling');
    until(round, () => round.phase === 'failure');
    assert(!round.drop());
    const events = round.drainEvents();
    assert.equal(events.filter(event => event.kind === 'failure').length, 1);
    assert.equal(events.filter(event => event.kind === 'land').length, 0);
    advance(round, 2);
    assert.equal(round.drainEvents().length, 0, 'failure is emitted once, not each frame');
  }
});

test('a complete miss continues below the stack and fails', () => {
  const round = new TruckStackRound();
  releaseAt(round, 320);
  until(round, () => round.phase === 'failure');
  assert.equal(round.height, 1);
  assert(round.activeBox.y < top(round).y - 400);
});

test('swept contact catches a box crossing an entire support plane in one physics step', () => {
  const round = new TruckStackRound();
  releaseAt(round, 30);
  round.activeBox.y = 300;
  round.activeBox.vy = -100000;
  round.tick(1 / 120);
  assert.equal(round.phase, 'settling');
  assert.equal(top(round).y, 186);
  assert.equal(top(round).x, 30);
});

test('slowdown halves only the pendulum speed and expires after twenty simulated seconds', () => {
  const slowed = new TruckStackRound();
  const normal = new TruckStackRound();
  assert(slowed.slowDown());
  advance(slowed, 1);
  advance(normal, 0.5);
  assert(Math.abs(slowed.activeBox.x - normal.activeBox.x) < 1e-8);
  assert(Math.abs(slowed.activeBox.y - normal.activeBox.y) < 1e-8);
  assert(Math.abs(slowed.slowRemaining - 19) < 1e-8);
  releaseAt(slowed, 0);
  releaseAt(normal, 0);
  advance(slowed, 0.2);
  advance(normal, 0.2);
  assert(Math.abs(slowed.activeBox.y - normal.activeBox.y) < 1e-8, 'gravity is unchanged');
  assert(Math.abs(slowed.activeBox.vy - normal.activeBox.vy) < 1e-8);
  advance(slowed, 18.8);
  assert.equal(slowed.slowRemaining, 0);
  assert(!slowed.slowDown(0));
  assert(!slowed.slowDown(-2));
  assert(!slowed.slowDown(Infinity));
});

test('slowdown leaves real stack sway running at the same speed', () => {
  const normal = roundAtHeight(20), slowed = roundAtHeight(20);
  const initialX = top(normal).x;
  assert(slowed.slowDown());
  advance(normal, 1);
  advance(slowed, 1);
  assert.equal(JSON.stringify(slowed.boxes), JSON.stringify(normal.boxes));
  assert(Math.abs(top(normal).x - initialX) > 1);
  assert(Math.abs(normal.activeBox.x - slowed.activeBox.x) > 5);
});

test('stable levels sway physically with fixed amplitudes and coherent motion near screen edges', () => {
  const easy = roundAtHeight(4);
  const easyBoxes = JSON.stringify(easy.boxes);
  advance(easy, 3);
  assert.equal(JSON.stringify(easy.boxes), easyBoxes, 'levels one through four stay still');

  for (const [height, expectedSpan] of [[5, 3.5], [20, 56], [40, 72]]) {
    const round = roundAtHeight(height);
    const baseline = round.boxes.map(box => ({ id: box.id, x: box.x }));
    let minimum = Infinity, maximum = -Infinity;
    for (let step = 0; step < 720; step++) {
      round.tick(1 / 120);
      minimum = Math.min(minimum, top(round).x);
      maximum = Math.max(maximum, top(round).x);
      for (let index = 1; index < round.boxes.length; index++) {
        const upperMotion = round.boxes[index].x - baseline[index].x;
        const lowerMotion = round.boxes[index - 1].x - baseline[index - 1].x;
        assert(Math.abs(upperMotion - lowerMotion) < 6, 'adjacent levels cannot sway apart by a support-breaking amount');
      }
    }
    assert(Math.abs(maximum - minimum - expectedSpan) < 0.05, `level ${height} has the intended real sway range`);
  }

  const edge = roundAtHeight(40, 210);
  const baseline = edge.boxes.map(box => box.x);
  for (let step = 0; step < 1000; step++) {
    const before = edge.boxes.map(box => box.x);
    edge.tick(1 / 120);
    for (let index = 0; index < edge.boxes.length; index++) {
        assert(Math.abs(edge.boxes[index].x) <= 235 + 1e-8);
      assert(Math.abs(edge.boxes[index].x - before[index]) < 0.7, 'wall constraints do not make settled boxes jump');
      if (index) {
        const relativeMotion = (edge.boxes[index].x - baseline[index]) - (edge.boxes[index - 1].x - baseline[index - 1]);
        assert(Math.abs(relativeMotion) < 6, 'edge clamping preserves coherent adjacent sway');
      }
    }
  }
});

test('a new landing preserves its exact x and does not jump existing levels when score increases', () => {
  const round = roundAtHeight(20);
  releaseAt(round, 40);
  while (round.phase === 'dropping') {
    const previous = new Map(round.boxes.map(box => [box.id, box.x]));
    round.tick(1 / 120);
    for (const box of round.boxes) {
      if (previous.has(box.id)) assert(Math.abs(box.x - previous.get(box.id)) < 0.7);
    }
  }
  assert.equal(round.phase, 'settling');
  assert.equal(top(round).x, 40, 'rest position compensates the current sway instead of teleporting the landed box');
  const previous = round.boxes.map(box => box.x);
  round.tick(1 / 120);
  assert(round.boxes.every((box, index) => Math.abs(box.x - previous[index]) < 0.7));
});

test('the moving support can turn the same edge aim into a miss or a recovery', () => {
  for (const direction of [-1, 1]) {
    const round = roundAtHeight(20);
    let found = false;
    for (let step = 0; step < 1000; step++) {
      const before = top(round).x;
      round.tick(1 / 120);
      if ((top(round).x - before) * direction > 0.45) { found = true; break; }
    }
    assert(found, 'the top box has measurable horizontal motion');
    const releaseOffset = direction < 0 ? 126 : 140;
    const releaseX = top(round).x + releaseOffset;
    releaseAt(round, releaseX);
    until(round, () => round.phase === 'falling' || round.phase === 'settling');
    assert.equal(round.phase, direction < 0 ? 'falling' : 'settling', 'contact must use the support at landing time');
    if (direction > 0) assert.equal(top(round).x, releaseX);
  }
});

test('preview swings the same box without consuming rewards or progressing released boxes', () => {
  const round = roundAtHeight(20);
  round.drainEvents();
  assert(round.slowDown());
  const id = round.activeBox.id;
  const x = round.activeBox.x;
  const stackX = top(round).x;
  for (let i = 0; i < 60; i++) round.tickPreview(1 / 60);
  assert.equal(round.activeBox.id, id);
  assert.notEqual(round.activeBox.x, x);
  assert.equal(round.slowRemaining, 20);
  assert.equal(round.height, 20);
  assert(Math.abs(top(round).x - stackX) > 1, 'preview renders the same real stack sway');
  assert.equal(round.drainEvents().length, 0);
  const releaseX = round.activeBox.x;
  assert(round.drop());
  assert.equal(round.activeBox.x, releaseX, 'entering play releases the box seen in preview');
  const released = JSON.stringify(round);
  for (let i = 0; i < 180; i++) round.tickPreview(1 / 60);
  assert.equal(JSON.stringify(round), released, 'exiting to preview freezes an airborne box');

  const settling = new TruckStackRound();
  releaseAt(settling, 0);
  until(settling, () => settling.phase === 'settling');
  const impact = JSON.stringify(settling);
  for (let i = 0; i < 180; i++) settling.tickPreview(1 / 60);
  assert.equal(JSON.stringify(settling), impact, 'preview does not create the next box during settling');
});

test('first-touch release from a moving preview inherits the same motion as live play', () => {
  const preview = new TruckStackRound(), live = new TruckStackRound();
  preview.tickPreview(0.3); live.tick(0.3);
  assert.equal(JSON.stringify(preview.activeBox), JSON.stringify(live.activeBox));
  preview.drop(); live.drop();
  assert(Math.abs(preview.activeBox.vx) > 50);
  advance(preview, 0.1); advance(live, 0.1);
  assert.equal(JSON.stringify(preview.activeBox), JSON.stringify(live.activeBox));
});

test('revive preserves the stack and height, removes failure, and accepts a new drop', () => {
  const round = new TruckStackRound();
  assert(!round.revive(), 'a healthy round cannot receive a free reset');
  landAt(round, 100);
  const stable = JSON.stringify(round.boxes);
  const height = round.height;
  releaseAt(round, -170);
  until(round, () => round.phase === 'failure');
  const failedId = round.activeBox.id;
  assert(!round.slowDown(), 'a failed round cannot begin a timed power-up');
  assert(round.revive());
  assert.equal(round.phase, 'swinging');
  assert.equal(round.height, height);
  assert.equal(JSON.stringify(round.boxes), stable);
  assert.notEqual(round.activeBox.id, failedId);
  assert.equal(round.drainEvents().length, 0, 'a stale failure event cannot reopen settlement after revival');
  landAt(round, 100);
  assert.equal(round.height, height + 1);
});

test('fixed step simulation gives the same outcome at 30, 60, 144 and variable frame rates', () => {
  function play(frames, height) {
    const round = roundAtHeight(height);
    let elapsed = 0, index = 0;
    while (elapsed < 0.5 - 1e-10) {
      const dt = Math.min(frames[index++ % frames.length], 0.5 - elapsed);
      round.tick(dt);
      elapsed += dt;
    }
    assert(round.drop());
    assert(Math.abs(round.activeBox.vx) > 1, 'frame-rate comparison includes real throw motion');
    elapsed = 0;
    while (elapsed < 2 - 1e-10) {
      const dt = Math.min(frames[index++ % frames.length], 2 - elapsed);
      round.tick(dt);
      elapsed += dt;
    }
    return JSON.stringify({ phase: round.phase, boxes: round.boxes, active: round.activeBox, height: round.height });
  }
  for (const height of [1, 20]) {
    const expected = play([1 / 120], height);
    for (const frames of [[1 / 30], [1 / 60], [1 / 144], [0.007, 0.023, 0.041, 0.013]]) {
      assert.equal(play(frames, height), expected);
    }
  }
});

test('invalid elapsed times do nothing and repeated long frames still land without tunneling', () => {
  const round = new TruckStackRound();
  const initial = JSON.stringify(round);
  for (const dt of [0, -1, NaN, Infinity]) round.tick(dt);
  assert.equal(JSON.stringify(round), initial);
  releaseAt(round, 0);
  for (let i = 0; i < 8; i++) round.tick(1000000);
  assert.equal(round.height, 2);
  assert.equal(round.phase, 'swinging');
  assert.equal(top(round).y, 186);
});

test('the rope attaches to the rotated top centre while the tilted box stays fully on screen', () => {
  for (const height of [1, 20, 40]) {
    const round = roundAtHeight(height);
    let sawLeftTilt = false, sawRightTilt = false;
    for (let step = 0; step < 720; step++) {
      round.tick(1 / 120);
      const box = round.activeBox;
      const angle = box.angle * Math.PI / 180;
      const attachmentX = box.x - Math.sin(angle) * box.height / 2;
      const attachmentY = box.y + Math.cos(angle) * box.height / 2;
      assert(Math.abs(Math.hypot(attachmentX - round.pivot.x, attachmentY - round.pivot.y) - 275) < 1e-8);
      const halfRotatedWidth = Math.abs(Math.cos(angle)) * box.width / 2 + Math.abs(Math.sin(angle)) * box.height / 2;
      assert(Math.abs(box.x) + halfRotatedWidth <= 375, 'rotated corners stay inside the playfield');
      assert(box.angle * box.x >= 0, 'left swing tilts left and right swing tilts right');
      sawLeftTilt ||= box.angle < -10;
      sawRightTilt ||= box.angle > 10;
      assert.equal(round.pivot.y, top(round).y + 62 + 800);
    }
    assert(sawLeftTilt && sawRightTilt);
  }
});

test('thousands of real drops keep only eighteen boxes while every drifting top stays reachable', () => {
  const round = new TruckStackRound();
  let maximumSavedState = 0;
  const cappedPaths = [];
  for (let index = 0; index < 2200; index++) {
    const target = top(round).x;
    let released = false;
    for (let step = 0; step < 1200; step++) {
      round.tick(1 / 120);
      const limit = Math.min(195, 120 + index);
      const desired = Math.max(-limit, Math.min(limit, target + 48 * Math.sin(index * 0.17)));
      if (Math.abs(round.activeBox.x - desired) < 5) {
        assert(round.drop());
        released = true;
        break;
      }
    }
    assert(released, `the actual pendulum must reach the next usable target at height ${round.height}`);
    until(round, () => round.phase === 'swinging' || round.phase === 'failure', 3);
    assert.equal(round.phase, 'swinging');
    assert.equal(round.height, index + 2);
    assert(round.boxes.length <= MAX_VISIBLE_BOXES);
    assert(Math.abs(top(round).x) <= 235);
    for (const box of round.boxes.concat([round.activeBox])) {
      assert([box.id, box.x, box.y, box.width, box.height, box.angle].every(Number.isFinite));
    }
    assert(Number.isFinite(round.pivot.y));
    const retainedMaps = Object.values(round).filter(value => Object.prototype.toString.call(value) === '[object Map]');
    assert(retainedMaps.length > 0, 'settled rest positions are retained for actual sway');
    assert(retainedMaps.every(map => map.size <= 18), 'discarding old boxes also discards their rest positions');
    maximumSavedState = Math.max(maximumSavedState, JSON.stringify(round).length);
    if (index === 199 || index === 2199) {
      const path = [];
      for (let step = 0; step < 240; step++) {
        round.tick(1 / 120);
        path.push(round.activeBox.x);
      }
      cappedPaths.push(path);
    }
  }
  assert.equal(round.boxes.length, 18);
  assert.equal(top(round).y, 272862, 'cumulative height survives discarding old boxes');
  assert.equal(round.boxes[0].id, top(round).id - 17);
  assert(maximumSavedState < 10000, 'the state does not retain every historical box or feedback event');
  assert(round.drainEvents().length <= 100, 'undrained feedback events also remain bounded');
  assert.deepEqual(cappedPaths[0], cappedPaths[1], 'late-game amplitude and speed stay capped');
  assert.equal(BOX_WIDTH, 276);
  assert.equal(BOX_HEIGHT, 124);
});

let failures = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}\n${error.stack}`); }
}
assert.equal(failures, 0, `${failures} truck stack rule test(s) failed`);
console.log(`PASS ${tests.length} truck stack rule tests`);
