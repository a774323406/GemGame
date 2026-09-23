// Offline checks only: no real ads, storage, network or platform service calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require(process.env.PENGUIN_TEST_TYPESCRIPT_PATH ||
  '/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');

function loadRules() {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('assets/scripts/penguinStackRules.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports });
  return exports;
}

function validateScene() {
  const scene = JSON.parse(fs.readFileSync('assets/gamescene/PenguinStackFeedGameScene.scene', 'utf8'));
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (Number.isInteger(value.__id__)) assert(scene[value.__id__], `dangling reference ${value.__id__}`);
    for (const child of Object.values(value)) walk(child);
  }
  walk(scene);
  const ids = scene.filter(item => item?._id).map(item => item._id);
  assert.equal(ids.length, new Set(ids).size, 'serialized ids must be unique');
  assert.equal(scene.some(item => item?.__type__ === 'cc.Graphics'), false, 'runtime Graphics are forbidden');

  const script = scene.find(item => item?.finalTarget === 200 && item?.stageOneTarget === 10);
  assert(script, 'controller component is missing');
  assert(script.stageTwoFallSpeed >= 420,
    'penguins must fall noticeably faster after the difficulty surge');
  assert(script.stageTwoFallSpeed > script.stageOneFallSpeed,
    'stage two fall speed must exceed stage one');
  assert.equal(script.stackPenguins.length, 10);
  assert.equal(script.fallingPenguins.length, 7);
  assert.equal(script.heartNodes.length, 3);
  for (const key of ['sceneBackground', 'playfield', 'whale', 'towerRoot', 'guideNode', 'surgeOverlay',
    'resultOverlay', 'lifeButton', 'slowButton', 'retryButton', 'nextButton',
    'reviveButton']) assert(scene[script[key].__id__], `missing scene binding ${key}`);
  for (const key of ['lifeButton', 'slowButton', 'retryButton', 'nextButton', 'reviveButton']) {
    const component = scene[script[key].__id__];
    assert(component.node && scene[component.node.__id__], `${key} must reference a live scene node`);
  }

  const node = name => scene.find(item => item?.__type__ === 'cc.Node' && item._name === name);
  const components = item => item._components.map(reference => scene[reference.__id__]);
  for (const name of ['StageOneDot', 'StageTwoDot', 'LivesBacking']) {
    assert(node(name), `${name} must be authored in the scene`);
  }
  assert.equal(node('SkipButton'), undefined, 'the skip reward button must stay removed');
  const lifeButton = node('AddLifeButton');
  const slowButton = node('SlowDownButton');
  assert.equal(lifeButton._lpos.x, -slowButton._lpos.x, 'the two reward buttons must be centered');
  assert.equal(lifeButton._lpos.y, slowButton._lpos.y, 'the two reward buttons must share one row');
  assert.equal(scene.filter(item => item?._name === 'VideoBadge').length, 3,
    'all rewarded buttons must use the reference gray video badge');
  for (const name of ['ResultOverlay', 'DimBackground']) {
    const item = node(name);
    const widget = components(item).find(component => component.__type__ === 'cc.Widget');
    assert(widget, `${name} must stretch to the visible screen`);
    assert.equal(widget._alignFlags, 45);
    for (const edge of ['_top', '_bottom', '_left', '_right']) assert.equal(widget[edge], 0);
  }
  assert(components(node('ResultOverlay')).some(component => component.__type__ === 'cc.BlockInputEvents'));
  assert(components(node('SurgeOverlay')).some(component => component.__type__ === 'cc.BlockInputEvents'));

  const main = JSON.parse(fs.readFileSync('assets/gamescene/NewMainScene.scene', 'utf8'));
  const controller = main.find(item => item?.penguinButton);
  assert(controller?.penguinButton, 'NewMainScene penguin entry is missing');
  const button = main[controller.penguinButton.__id__];
  assert.equal(main[button.node.__id__]._name, 'PenguinStackCard',
    'NewMainScene penguin button must bind the PenguinStackCard');

  const code = fs.readFileSync('assets/scripts/penguinStackFeedGameScene.ts', 'utf8');
  assert(!/new Node\s*\(|addComponent\s*\(|\bGraphics\b/.test(code), 'fixed UI must remain scene-authored');
  assert(code.includes('beginDrag(this.normalizedTouchX(event))'), 'dragging must preserve the grab offset');
  assert(code.includes('this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this, true)'),
    'mobile UI dispatch needs a Canvas capture fallback');
  assert(code.includes('this.bindNativeTouchFallback()'),
    'normal and feed entry both need the native Douyin touch fallback');
  assert(code.includes('this.targetWhaleX = recoveredX'),
    'a move event must recover immediately when touch start is missing');
  assert(code.includes('stackOffsetVelocities'), 'each stack layer needs independent drag inertia');
  assert(code.includes('sweptPenguinContact'), 'visual edge contact must use swept collision');
  assert(!code.includes('Math.abs(item.x - catchX) <= 88'), 'the old narrow one-frame catch test must stay removed');
  assert(code.includes('reportSceneReadyAfterStableRender'));
  assert(code.includes('activateFromFirstTouch'));
  assert(code.includes('completeSession'));
  assert(code.includes('showRewardedVideo'));
  assert(code.includes('soundName.buttonClick'));
}

async function main() {
  const tests = [];
  const test = (name, run) => tests.push([name, run]);
  const { PenguinStackRound, penguinStackSink, sweptPenguinContact } = loadRules();

  test('visible edge contact and fast swept contact both attach', () => {
    assert.equal(sweptPenguinContact(192, 10, 20, 98, 49, 0, 0, 94, 47), true,
      'an exact horizontal edge touch must count');
    assert.equal(sweptPenguinContact(193, 10, 20, 98, 49, 0, 0, 94, 47), false,
      'a real horizontal gap must not count');
    assert.equal(sweptPenguinContact(0, -120, 150, 98, 49, 0, 0, 94, 47), true,
      'a fast frame that crosses the full target must not tunnel through');
  });

  test('the catcher sinks progressively as the visible tower grows', () => {
    const atOne = penguinStackSink(1, 500);
    const atFive = penguinStackSink(5, 500);
    const atTen = penguinStackSink(10, 500);
    const atFourteen = penguinStackSink(14, 500);
    assert.equal(penguinStackSink(0, 500), 0);
    assert(atOne > 0 && atOne < atFive);
    assert(atFive < atTen);
    assert(atTen < atFourteen);
    assert.equal(atFourteen, 500);
    assert.equal(penguinStackSink(15, 500), 570,
      'after the whale disappears, every new catch must advance one complete layer');
    assert.equal(penguinStackSink(97, 500, 14, 52) - penguinStackSink(96, 500, 14, 52), 52,
      'the virtual stack must keep advancing at high counts');
  });

  test('first 10 catches pause on difficulty surge and switch target to 200', () => {
    const round = new PenguinStackRound();
    round.reset();
    for (let i = 0; i < 9; i++) assert.equal(round.catchPenguin().stageChanged, false);
    const tenth = round.catchPenguin();
    assert.equal(tenth.stageChanged, true);
    assert.equal(round.status, 'stage-break');
    assert.equal(round.stage, 2);
    assert.equal(round.target, 200);
    assert.equal(round.catchPenguin(), null);
    round.continueAfterStageBreak();
    assert.equal(round.caught, 0, 'stage two must restart its stack and counter at zero');
    assert.equal(round.status, 'playing');
  });

  test('second stage reaches exactly 200 and succeeds', () => {
    const round = new PenguinStackRound();
    round.reset();
    for (let i = 0; i < 10; i++) round.catchPenguin();
    round.continueAfterStageBreak();
    assert.equal(round.caught, 0);
    for (let i = 0; i < 199; i++) round.catchPenguin();
    assert.equal(round.status, 'playing');
    const last = round.catchPenguin();
    assert.equal(last.completed, true);
    assert.equal(round.caught, 200);
    assert.equal(round.status, 'success');
  });

  test('three misses fail and rewarded revive preserves progress', () => {
    const round = new PenguinStackRound();
    round.reset();
    for (let i = 0; i < 4; i++) round.catchPenguin();
    assert(round.missPenguin());
    assert(round.missPenguin());
    assert(round.missPenguin());
    assert.equal(round.status, 'failed');
    assert.equal(round.lives, 0);
    assert.equal(round.caught, 4);
    assert.equal(round.missPenguin(), false);
    assert.equal(round.revive(), true);
    assert.equal(round.status, 'playing');
    assert.equal(round.lives, 1);
    assert.equal(round.caught, 4);
  });

  test('life reward caps at three and skip completes without fake over-count', () => {
    const round = new PenguinStackRound();
    round.reset();
    assert.equal(round.addLife(), false);
    round.missPenguin();
    assert.equal(round.addLife(), true);
    assert.equal(round.lives, 3);
    round.skip();
    assert.equal(round.status, 'success');
    assert.equal(round.caught, 200);
    assert.equal(round.skipped, true);
  });

  test('serialized scene, entry, recommendation lifecycle and image-only UI are valid', validateScene);

  for (const [name, run] of tests) {
    await run();
    console.log('PASS ' + name);
  }
  console.log(`\n${tests.length} penguin stack feed checks passed.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
