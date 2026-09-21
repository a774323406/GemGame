const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');

function loadRules() {
  const source = fs.readFileSync('assets/scripts/foodDeliveryRules.ts', 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const output = {};
  vm.runInNewContext(code, { exports: output, module: { exports: output }, Math, Set, Error });
  return output;
}

const {
  FOOD_KINDS,
  FoodDeliveryRound,
  segmentRectHit,
  shuffledFoods,
} = loadRules();

const kinds = ['lime', 'icecream', 'cake', 'burger', 'cola'];
const world = {
  targets: kinds.map((food, index) => ({
    food,
    x: 153,
    y: 366 - index * 120,
    width: 72,
    height: 68,
  })),
  guard: { x: 100, y: -340, width: 82, height: 156 },
  wall: { x: 260, y: -350, width: 115, height: 1150 },
  bounds: { x: -375, y: -812, width: 750, height: 1624 },
  groundY: -350,
};
const tuning = { speed: 1750, gravity: 1600, radius: 8, maxFlightSeconds: 4 };
const origin = { x: -210, y: -230 };

function runUntilSettled(model, fps = 60, seconds = 5) {
  const events = [];
  for (let frame = 0; frame < fps * seconds && model.phase === 'flying'; frame += 1) {
    events.push(...model.tick(1 / fps));
  }
  return events;
}

function simulate(food, angle, fps = 60) {
  const order = [food, ...kinds.filter((entry) => entry !== food)];
  const model = new FoodDeliveryRound(world, tuning, order);
  assert.equal(model.shoot(angle, origin), true);
  assert.equal(model.shoot(angle, origin), false, 'only one projectile may fly at a time');
  const events = runUntilSettled(model, fps);
  return { model, events };
}

function findHitAngle(food) {
  for (let angle = 0; angle <= 180; angle += 0.25) {
    if (simulate(food, angle, 60).model.score === 1) return angle;
  }
  return null;
}

function assertThrowsField(fn, field) {
  assert.throws(fn, (error) => error instanceof Error && error.message.includes(field));
}

assert.deepEqual(Array.from(FOOD_KINDS), kinds);
assert.equal(new Set(shuffledFoods(() => 0.5)).size, 5);
assert.deepEqual([...shuffledFoods(() => 0)], ['icecream', 'cake', 'burger', 'cola', 'lime']);

assert.equal(
  segmentRectHit(
    { x: 0, y: 10 },
    { x: 1000, y: 10 },
    { x: 100, y: 0, width: 10, height: 20 },
    0,
  ),
  0.1,
);
assert.equal(segmentRectHit({ x: 0, y: 30 }, { x: 1000, y: 30 }, { x: 100, y: 0, width: 10, height: 20 }), null);
assert.equal(segmentRectHit({ x: 0, y: 21 }, { x: 1000, y: 21 }, { x: 100, y: 0, width: 10, height: 20 }, 1), 0.099);
assert.equal(segmentRectHit({ x: 105, y: 10 }, { x: 105, y: 10 }, { x: 100, y: 0, width: 10, height: 20 }), 0);
assertThrowsField(() => segmentRectHit({ x: NaN, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0, width: 1, height: 1 }), 'from.x');
assertThrowsField(() => segmentRectHit({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0, width: 0, height: 1 }), 'rect.width');
assertThrowsField(() => segmentRectHit({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0, width: 1, height: 1 }, -1), 'radius');

const hitAngles = new Map();
for (const food of kinds) {
  const angle = findHitAngle(food);
  assert.notEqual(angle, null, `${food} must be reachable`);
  hitAngles.set(food, angle);

  const at60 = simulate(food, angle, 60);
  const at30 = simulate(food, angle, 30);
  assert.equal(at60.model.score, 1, `${food} should score at 60 fps`);
  assert.equal(at30.model.score, 1, `${food} should score at 30 fps`);
  assert.equal(at60.model.phase, 'delivered');
  assert.equal(at30.model.phase, 'delivered');
  assert.equal(at60.events.filter((event) => event.type === 'delivered').length, 1);
  assert.equal(at30.events.filter((event) => event.type === 'delivered').length, 1);
}

{
  const round = new FoodDeliveryRound(world, tuning, kinds);
  const allEvents = [];
  for (const food of kinds) {
    assert.equal(round.currentFood, food);
    assert.equal(round.shoot(hitAngles.get(food), origin), true);
    allEvents.push(...runUntilSettled(round));
    if (food !== kinds.at(-1)) round.advanceOrder();
  }
  assert.equal(round.score, 5);
  assert.equal(round.phase, 'won');
  assert.deepEqual(Array.from(round.completed), kinds);
  assert.equal(allEvents.filter((event) => event.type === 'delivered').length, 5);
  assert.equal(allEvents.filter((event) => event.type === 'won').length, 1);
  assert.equal(round.tick(1).length, 0);
}

{
  const wrongOrder = ['cola', 'lime', 'icecream', 'cake', 'burger'];
  const round = new FoodDeliveryRound(world, tuning, wrongOrder);
  assert.equal(round.shoot(hitAngles.get('lime'), origin), true);
  const events = runUntilSettled(round);
  assert.equal(round.score, 0);
  assert.equal(round.completed.size, 0);
  assert(events.some((event) => event.type === 'deflected'));
  assert(events.some((event) => event.type === 'failed'));
}

{
  const guardWorld = {
    ...world,
    targets: world.targets.map((target) => ({ ...target, x: 3000 })),
    wall: { x: 3000, y: -350, width: 100, height: 1000 },
    guard: { x: -5, y: -20, width: 10, height: 40 },
    groundY: -1000,
  };
  const round = new FoodDeliveryRound(guardWorld, { ...tuning, gravity: 1 }, kinds);
  round.shoot(0, { x: -100, y: 0 });
  const events = round.tick(0.25);
  assert(events.some((event) => event.type === 'failed' && event.reason === 'guard'));
}

{
  const groundWorld = {
    ...world,
    targets: world.targets.map((target) => ({ ...target, x: 3000 })),
    wall: { x: 3000, y: -350, width: 100, height: 1000 },
    guard: { x: 3000, y: -350, width: 100, height: 100 },
    groundY: -5,
  };
  const round = new FoodDeliveryRound(groundWorld, tuning, kinds);
  round.shoot(-90, { x: 0, y: 50 });
  const events = runUntilSettled(round);
  assert(events.some((event) => event.type === 'failed' && event.reason === 'ground'));
}

{
  const outsideWorld = {
    ...world,
    targets: world.targets.map((target) => ({ ...target, x: 3000 })),
    wall: { x: 3000, y: -350, width: 100, height: 1000 },
    guard: { x: 3000, y: -350, width: 100, height: 100 },
    groundY: -3000,
    bounds: { x: -50, y: -50, width: 100, height: 100 },
  };
  const round = new FoodDeliveryRound(outsideWorld, tuning, kinds);
  round.shoot(0, { x: 0, y: 0 });
  const events = runUntilSettled(round);
  assert(events.some((event) => event.type === 'failed' && event.reason === 'outside'));
}

{
  const timeoutWorld = {
    ...world,
    targets: world.targets.map((target) => ({ ...target, x: 3000 })),
    wall: { x: 3000, y: -350, width: 100, height: 1000 },
    guard: { x: 3000, y: -350, width: 100, height: 100 },
    bounds: { x: -100000, y: -100000, width: 200000, height: 200000 },
    groundY: -100000,
  };
  const round = new FoodDeliveryRound(timeoutWorld, { ...tuning, gravity: 1, maxFlightSeconds: 0.05 }, kinds);
  round.shoot(90, { x: 0, y: 0 });
  const events = runUntilSettled(round);
  assert(events.some((event) => event.type === 'failed' && event.reason === 'timeout'));
}

{
  const round = new FoodDeliveryRound(world, tuning, kinds);
  const originalOrder = [...round.order];
  round.shoot(15, origin);
  round.tick(0.1);
  round.reset(true, () => 0);
  assert.deepEqual([...round.order], originalOrder);
  assert.equal(round.phase, 'aiming');
  assert.equal(round.score, 0);
  assert.equal(round.projectile, null);
  round.reset(false, () => 0);
  assert.deepEqual([...round.order], ['icecream', 'cake', 'burger', 'cola', 'lime']);
  assert.equal(new Set(round.order).size, 5);
}

assertThrowsField(() => new FoodDeliveryRound(world, tuning, ['lime', 'lime', 'cake', 'burger', 'cola']), 'order');
assertThrowsField(() => new FoodDeliveryRound(world, tuning, ['lime']), 'order');
assertThrowsField(() => new FoodDeliveryRound({ ...world, groundY: Infinity }, tuning, kinds), 'world.groundY');
assertThrowsField(() => new FoodDeliveryRound({ ...world, targets: [{ ...world.targets[0], width: -1 }, ...world.targets.slice(1)] }, tuning, kinds), 'world.targets[0].width');
assertThrowsField(() => new FoodDeliveryRound(world, { ...tuning, speed: NaN }, kinds), 'tuning.speed');
assertThrowsField(() => new FoodDeliveryRound(world, { ...tuning, gravity: 0 }, kinds), 'tuning.gravity');
assertThrowsField(() => new FoodDeliveryRound(world, { ...tuning, radius: -1 }, kinds), 'tuning.radius');
assertThrowsField(() => new FoodDeliveryRound(world, { ...tuning, maxFlightSeconds: Infinity }, kinds), 'tuning.maxFlightSeconds');
assertThrowsField(() => new FoodDeliveryRound(world, tuning, kinds).shoot(NaN, origin), 'angleDegrees');
assertThrowsField(() => new FoodDeliveryRound(world, tuning, kinds).shoot(0, { x: Infinity, y: 0 }), 'origin.x');

console.log('Food delivery rules tests passed');
