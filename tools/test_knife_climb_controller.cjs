const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');

class NodeStub {
    static EventType = { TOUCH_START: 'touch' };
    active = true;
    widget = {};
    getComponent() { return this.widget; }
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
    dependencies.knifeClimbRules = load('knifeClimbRules');
    const Controller = load('knifeClimbFeedGameScene').knifeClimbFeedGameScene;
    const c = new Controller();
    for (const key of ['surface', 'food', 'apple', 'watermelon', 'world', 'flag', 'wall', 'startHint', 'hud', 'resultOverlay', 'exitOverlay']) c[key] = new NodeStub();
    c.countdownLabel = { node: new NodeStub(), string: '' };
    c.hitFrames = ['redFood', 'redApple', 'redWatermelon'];
    for (const [i, node] of [c.food, c.apple, c.watermelon].entries()) node.widget.spriteFrame = 'normal' + i;
    c.blades = Array.from({ length: 35 }, () => new NodeStub());
    for (const key of ['progressLabel', 'timerLabel', 'stageLabel', 'resultTitle', 'resultDetail']) c[key] = { string: '' };
    for (const key of ['backButton', 'slowdownButton', 'reviveButton', 'nextButton', 'homeButton', 'replayButton', 'exitButton', 'continueButton']) {
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
    const click = key => c[key].node.emit('click');
    const tap = () => c.surface.emit('touch');
    const reward = async (key, answer) => {
        const pending = click(key);
        assert.equal(f.rewards.length, 1);
        assert(!f.music);
        f.rewards.shift()(answer);
        await pending;
    };

    assert(f.music && f.ready.isReady());
    assert.deepEqual(Array.from(f.ready.requiredVisibleNodes), [c.surface, c.food, c.blades[0]]);
    const initialY = c.food.position.y;
    advance(c, 20);
    assert.notEqual(c.food.position.y, initialY);
    assert.equal(c.round.timeLeft, 8);
    assert(c.startHint.active && !c.countdownLabel.node.active);
    assert.equal(c.blades.filter(b => b.active).length, 2);
    tap(); // First-touch fallback enters the feed without firing a knife.
    assert.equal(f.scheduled, 1);
    assert(c.countdownLabel.node.active && c.countdownLabel.string === '3');
    assert.equal(c.round.blades[1].state, 'waiting');
    advance(c, 1);
    assert.equal(c.countdownLabel.string, '2');
    click('backButton');
    const pausedAt = c.round.foodY;
    advance(c, 1);
    tap();
    assert(c.exitOverlay.active && !f.music);
    assert.equal(c.round.foodY, pausedAt);
    click('continueButton');
    events.emit('hide');
    advance(c, 1);
    assert.equal(c.round.foodY, pausedAt);
    events.emit('show');
    assert(f.music);
    f.changeFeed(false, true);
    advance(c, 3);
    assert.equal(c.round.foodY, pausedAt);
    f.changeFeed(true, false);
    advance(c, 1);
    assert.equal(c.countdownLabel.string, '1');
    tap();
    assert.equal(c.round.blades[1].state, 'waiting');
    assert.equal(c.round.timeLeft, 8);
    advance(c, 1);
    assert.equal(c.round.phase, 'playing');
    assert(!c.startHint.active && !c.countdownLabel.node.active);
    assert(Math.abs(c.round.timeLeft - 8) < 1e-8);
    advance(c, 8.1);
    assert.equal(c.round.failureReason, 'timeout');
    assert(c.resultOverlay.active && !c.hud.active && c.reviveButton.node.active);

    await reward('reviveButton', false);
    assert(c.resultOverlay.active);
    await reward('reviveButton', true);
    assert(!c.startHint.active && c.hud.active && !c.resultOverlay.active);
    assert.equal(c.round.phase, 'playing');
    await reward('slowdownButton', false);
    assert.equal(c.round.speedMultiplier, 1);
    await reward('slowdownButton', true);
    assert.equal(c.round.speedMultiplier, .72);
    const timeBeforeAd = c.round.timeLeft;
    let pending = click('slowdownButton');
    click('slowdownButton');
    assert.equal(f.rewards.length, 1, 'duplicate taps cannot start a second ad');
    advance(c, 3);
    assert.equal(c.round.timeLeft, timeBeforeAd);
    f.changeFeed(false, true);
    f.rewards.shift()(true);
    await pending;
    assert.equal(c.round.speedMultiplier, .72, 'late ad after a feed exit cannot alter the round');
    f.changeFeed(true, false);
    while (c.round.landed < 1 && c.round.phase === 'playing') c.update(1 / 60);
    assert.equal(c.round.landed, 1);
    tap();
    while (c.round.phase === 'playing') c.update(1 / 120);
    const pinnedY = c.round.foodY;
    const impactX = c.blades[1].position.x;
    let flashes = 0, red = false;
    for (let frame = 0; frame < 96; frame++) {
        assert(!c.resultOverlay.active);
        c.update(1 / 120);
        const nowRed = c.food.widget.spriteFrame === c.hitFrames[0];
        if (nowRed && !red) flashes++;
        red = nowRed;
        assert.equal(c.round.foodY, pinnedY);
    }
    assert.equal(flashes, 3);
    assert.equal(c.food.widget.spriteFrame, 'normal0');
    assert(impactX > c.blades[1].position.x && c.blades[1].position.x === -295);
    assert.equal(c.round.lockedCount, 1);
    advance(c, .15);
    assert(c.resultOverlay.active);
    await reward('reviveButton', true);
    assert.equal(c.round.landed, 1);
    assert.equal(c.round.timeLeft, 8);
    assert.equal(c.round.speedMultiplier, .72);
    assert.equal(c.blades.filter(b => b.active).length, 2);
    const firstBladeY = c.blades[0].position.y;
    for (let i = 0; i < 7000 && !c.resultOverlay.active; i++) {
        const next = c.round.blades.findIndex(blade => blade.state === 'waiting');
        const target = c.blades[next];
        if (target?.active && c.round.foodY > target.position.y + 20 && c.round.velocityY > 0) tap();
        c.update(1 / 60);
    }
    assert(c.resultOverlay.active && !c.hud.active && !c.reviveButton.node.active);
    assert.equal(c.round.phase, 'success');
    assert.equal(c.round.landed, 12);
    assert.equal(c.blades[0].position.y, firstBladeY, 'the camera moves the world, leaving knife heights intact');
    assert(c.world.position.y < -1000);
    assert.equal(c.food.position.x, -319);
    assert.equal(c.food.position.y, 1025);
    assert(c.nextButton.node.active && !c.reviveButton.node.active);
    const characters = [c.food, c.apple, c.watermelon];
    for (const stageNumber of [2, 3]) {
        click('nextButton');
        click('nextButton');
        click('replayButton');
        assert.equal(c.round.stageNumber, stageNumber, 'double-clicks and stale button events cannot skip a stage');
        assert.equal(c.character, characters[stageNumber - 1]);
        assert.equal(characters.filter(node => node.active).length, 1);
        assert(c.stageLabel.string.includes(c.round.stage.name));
        assert(!c.nextButton.node.active && !c.reviveButton.node.active);
        assert.equal(c.flag.position.y, c.round.goalY);
        assert.equal(c.wall.position.y, c.round.goalY);
        assert.equal(c.round.lockedCount, 1);
        assert.equal(c.round.speedMultiplier, 1);
        assert.equal(c.blades.filter(b => b.active).length, 2);
        tap();
        assert.equal(c.countdownLabel.string, '3');
        advance(c, 11.1);
        assert.equal(c.round.phase, 'failure');
        assert(c.reviveButton.node.active && !c.nextButton.node.active);
        click('nextButton');
        click('replayButton');
        assert.equal(c.round.stageNumber, stageNumber);
        advance(c, 3);
        assert.equal(c.round.landed, 1);
        assert.equal(c.round.lockedCount, 1);
        assert.equal(c.progressLabel.string, `已插刀 1/${c.round.stage.knifeCount}`);
        // Trigger the side hit just after a real bounce on the starting blade.
        while (c.round.velocityY > 0) c.update(1 / 120);
        while (c.round.velocityY <= 0) c.update(1 / 120);
        {
            tap();
            while (c.round.phase === 'playing') c.update(1 / 120);
            advance(c, .07);
            assert.equal(c.character.widget.spriteFrame, c.hitFrames[stageNumber - 1]);
            events.emit('hide');
            advance(c, 1);
            assert(!c.resultOverlay.active);
            events.emit('show');
            advance(c, .9);
            assert.equal(c.character.widget.spriteFrame, 'normal' + (stageNumber - 1));
            assert.equal(c.round.failureReason, 'side');
            await reward('reviveButton', true);
            assert.equal(c.round.stageNumber, stageNumber);
            assert.equal(c.round.landed, 1);
            assert.equal(c.round.lockedCount, 1);
            assert(c.character.active && c.hud.active);
        }
        for (let frame = 0; frame < 9000 && !c.resultOverlay.active; frame++) {
            const next = c.round.blades.findIndex(b => b.state === 'waiting');
            if (next >= 0 && c.round.foodY > c.blades[next].position.y + 20 && c.round.velocityY > 0) tap();
            c.update(1 / 60);
        }
        assert.equal(c.round.phase, 'success');
        assert.equal(c.round.lockedCount, c.round.stage.knifeCount);
        assert(c.resultOverlay.active && !c.hud.active);
        assert.equal(c.nextButton.node.active, stageNumber === 2);
        assert.equal(c.replayButton.node.widget.verticalCenter, (stageNumber === 2 ? -345 : -270) / 1334);
        assert.equal(c.homeButton.node.widget.verticalCenter, (stageNumber === 2 ? -510 : -445) / 1334);
    }
    assert.equal(c.resultDetail.string, '三关全部通关');
    click('nextButton');
    assert.equal(c.round.stageNumber, 3);
    click('replayButton');
    assert.equal(c.round.stageNumber, 1);
    assert(c.food.active && !c.watermelon.active && !c.apple.active);
    assert.equal(c.round.speedMultiplier, 1);
    assert.equal(c.round.landed, 1);
    assert(c.startHint.active && c.hud.active && !c.resultOverlay.active);
    click('backButton');
    await click('exitButton');
    assert.equal(f.home, 1);
    c.onDestroy();
    assert.equal(c.surface.callbacks.size, 0);
    assert.equal(events.callbacks.size, 0);
    assert.equal(f.listener, null);
    assert.equal(f.completed, 1);

    const normal = makeScene(false);
    normal.c.surface.emit('touch');
    assert.equal(normal.f.scheduled, 0);
    advance(normal.c, 11.1);
    pending = normal.c.reviveButton.node.emit('click');
    normal.c.onDestroy();
    normal.f.rewards.shift()(true);
    await pending;
    assert.equal(normal.c.round.phase, 'failure', 'destroyed scene ignores a late revive callback');
    assert.equal(normal.f.completed, 0);

    const native = makeScene();
    advance(native.c, 5);
    const beforeEnter = native.c.round.foodY;
    native.f.changeFeed(true, false);
    assert.equal(native.c.round.foodY, beforeEnter);
    advance(native.c, 1.2);
    native.f.changeFeed(true, false);
    assert.equal(native.c.countdownLabel.string, '2');
    advance(native.c, 1.8);
    assert.equal(native.c.round.phase, 'playing');
    native.c.onDestroy();

    const firstAd = makeScene();
    pending = firstAd.c.slowdownButton.node.emit('click');
    assert.equal(firstAd.f.scheduled, 1, 'first tap on the reward button enters the feed before requesting the ad');
    firstAd.f.rewards.shift()(true);
    await pending;
    assert.equal(firstAd.c.round.phase, 'ready');
    firstAd.c.onDestroy();
    console.log('PASS feed preview/entry/exit, 3-2-1, automatic bounce, pauses, ads, checkpoints, replay, flag victory, result buttons and cleanup');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
