const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');

class NodeStub {
    static EventType = { TOUCH_START: 'touch' };
    active = true;
    isValid = true;
    callbacks = new Map();
    position = { x: 0, y: 0 };
    on(event, callback, owner) { this.callbacks.set(event, callback.bind(owner)); }
    off(event) { this.callbacks.delete(event); }
    emit(event) { return this.callbacks.get(event)?.(); }
    setPosition(x, y) { this.position = { x, y }; }
}
function makeScene(feedActive = true) {
    const f = { music: false, restarts: 0, home: 0, scheduled: 0, cancelled: 0, completed: 0, rewards: [] };
    const state = { active: feedActive, entered: false, exited: false };
    const audio = {
        setSoundEvent() {}, playEffect() {}, playEffectByName() {},
        playMusic() { f.music = true; }, restartMusic() { f.music = true; f.restarts++; },
        pauseBgmForVideo() { f.music = false; },
    };
    const feed = {
        init() {}, isActive: () => feedActive, getState: () => state,
        addListener(fn) { f.listener = fn; fn(state); }, removeListener() { f.listener = null; },
        activateFromFirstTouch() { f.changeFeed(true, false); },
        reportSceneReadyAfterStableRender(options) { f.ready = options; },
        completeSession() { f.completed++; },
    };
    f.changeFeed = (entered, exited) => { Object.assign(state, { entered, exited }); f.listener(state); };
    const cc = {
        _decorator: { ccclass: () => type => type, property: () => () => {} },
        Component: class { node = new NodeStub(); }, Node: NodeStub, Button: { EventType: { CLICK: 'click' } },
        Game: { EVENT_HIDE: 'hide', EVENT_SHOW: 'show' }, game: new NodeStub(),
        view: { setDesignResolutionSize() {} }, ResolutionPolicy: { FIXED_WIDTH: 1 },
    };
    const sdk = { isRewardedVideoBusy: () => false, showRewardedVideo: () => new Promise(resolve => f.rewards.push(resolve)) };
    const adc = {
        onEnterGame() {}, scheduleFeedEntryInterstitial() { f.scheduled++; }, cancelFeedEntryInterstitial() { f.cancelled++; },
    };
    const dependencies = {
        cc, AudioManager: { default: audio }, FeedAcquisitionService: { FeedAcquisitionService: feed },
        EnvTool: { EnvTool: { getMiniGameApi: () => null } }, SdkUtils: { SdkUtils: sdk }, ADController: { adc }, gamePrefabMgr: { soundName: {} },
        GameSceneBundle: { GameSceneName: { Main: 'Main' }, GameSceneBundle: { loadScene: async () => { f.home++; } } },
    };
    function load(name) {
        const exports = {};
        const source = fs.readFileSync('assets/scripts/' + name + '.ts', 'utf8');
        const compiled = ts.transpileModule(source, { compilerOptions: {
            module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true,
        } });
        vm.runInNewContext(compiled.outputText, { exports, console, require: path => dependencies[path.split('/').pop()] });
        return exports;
    }
    dependencies.marbleBottleRules = load('marbleBottleRules');
    const Controller = load('marbleBottleFeedGameScene').marbleBottleFeedGameScene;
    const c = new Controller();
    for (const key of ['surface', 'bottle', 'cue', 'hud', 'resultOverlay', 'exitOverlay']) c[key] = new NodeStub();
    c.balls = Array.from({ length: 18 }, () => new NodeStub());
    for (const key of ['countLabel', 'remainingLabel', 'resultTitle', 'resultDetail']) c[key] = { string: '' };
    for (const key of ['backButton', 'slowdownButton', 'homeButton', 'replayButton', 'exitButton', 'continueButton']) {
        c[key] = { node: new NodeStub(), interactable: true };
    }
    c.onLoad();
    c.start();
    return { c, f, events: cc.game };
}
function advance(c, seconds) {
    for (let i = 0; i < Math.ceil(seconds * 60); i++) c.update(1 / 60);
}
async function main() {
    const { c, f, events } = makeScene();
    const press = key => c[key].node.emit('click');
    const tap = () => c.surface.emit('touch');
    assert(f.ready.isReady());
    assert.deepEqual(Array.from(f.ready.requiredVisibleNodes), [c.surface, c.bottle, c.cue]);
    assert(f.music);
    const initialX = c.balls[0].position.x;
    advance(c, 1 / 60);
    assert(c.balls[0].position.x < initialX);
    advance(c, 12.1);
    assert.equal(c.round.remaining, 18);
    for (let i = 0; i < 60 && !c.balls.some(ball => ball.active && Math.abs(ball.position.x) < 17); i++) {
        c.update(1 / 60);
    }
    const shown = c.balls.findIndex(ball => ball.active && Math.abs(ball.position.x) < 17);
    assert(shown >= 0);
    tap();
    assert.equal(c.round.balls[shown].state, 'flying', 'first touch strikes the marble shown in the preview');
    assert.equal(f.scheduled, 1);
    const restarts = f.restarts;
    tap();
    assert.equal(f.restarts, restarts);
    assert.equal(c.round.remaining, 17);
    press('backButton');
    assert(c.exitOverlay.active && !f.music);
    const beforePause = c.round.balls[shown].flightAge;
    advance(c, 1);
    tap();
    assert.equal(c.round.balls[shown].flightAge, beforePause);
    press('continueButton');
    assert(f.music && !c.exitOverlay.active);
    events.emit('hide');
    assert(!f.music);
    advance(c, .2);
    assert.equal(c.round.balls[shown].flightAge, beforePause);
    events.emit('show');
    advance(c, .7);
    assert.equal(c.round.pocketed, 1);
    assert(c.countLabel.string.includes('1/10'));
    let reward = press('slowdownButton');
    assert(!f.music);
    const x = c.round.balls[0].x;
    advance(c, 1);
    assert.equal(c.round.balls[0].x, x);
    f.rewards.shift()(false);
    await reward;
    assert.equal(c.round.speedMultiplier, 1);
    for (let i = 1; i <= 2; i++) {
        reward = press('slowdownButton');
        f.rewards.shift()(true);
        await reward;
        assert.equal(c.round.speedMultiplier, .72 ** i);
    }
    reward = press('slowdownButton');
    f.changeFeed(false, true);
    f.rewards.shift()(true);
    await reward;
    assert.equal(c.round.speedMultiplier, .72 ** 2, 'exiting invalidates pending reward');
    const positions = c.round.balls.map(ball => ball.x);
    advance(c, 4);
    assert.deepEqual(c.round.balls.map(ball => ball.x), positions);
    f.changeFeed(true, false);
    advance(c, 50);
    assert(c.resultOverlay.active && !c.hud.active);
    assert.equal(c.resultTitle.string, '挑战失败');
    press('replayButton');
    assert(c.hud.active && !c.resultOverlay.active);
    assert.equal(c.round.speedMultiplier, 1);
    assert.equal(c.remainingLabel.string, '剩余弹珠 18');
    for (let i = 0; i < 1200 && !c.resultOverlay.active; i++) {
        if (c.balls.some(ball => ball.active && ball.position.y === -45 && Math.abs(ball.position.x) < 10)) tap();
        c.update(1 / 60);
    }
    assert(c.resultOverlay.active && !c.hud.active);
    assert.equal(c.resultTitle.string, '挑战成功');
    assert.equal(c.balls.filter(ball => ball.active && ball.position.y > 200).length, 10);
    await press('homeButton');
    assert.equal(f.home, 1);
    c.onDestroy();
    assert.equal(c.surface.callbacks.size, 0);
    assert.equal(events.callbacks.size, 0);
    assert.equal(f.listener, null);
    assert.equal(f.completed, 1);

    const normal = makeScene(false);
    advance(normal.c, 2.4);
    normal.c.surface.emit('touch');
    assert.equal(normal.c.round.remaining, 17);
    assert.equal(normal.f.scheduled, 0);
    normal.c.backButton.node.emit('click');
    await normal.c.exitButton.node.emit('click');
    assert.equal(normal.f.home, 1);
    normal.c.onDestroy();
    assert.equal(normal.f.completed, 0);

    const firstAd = makeScene();
    assert(firstAd.c.slowdownButton.interactable);
    reward = firstAd.c.slowdownButton.node.emit('click');
    assert.equal(firstAd.f.scheduled, 1);
    firstAd.f.rewards.shift()(true);
    await reward;
    assert.equal(firstAd.c.round.speedMultiplier, .72);
    firstAd.c.onDestroy();
    console.log('PASS preview/first touch, pause, ads, stale rewards, success/failure, replay/home and listener cleanup');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
