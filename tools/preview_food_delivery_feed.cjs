// Real Cocos web-mobile rendering, CDP touch input, and simulated Douyin feed lifecycle.
// No real advertising, analytics, or platform reports are sent.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const buildUrl = process.argv[2];
const outputDirectory = process.argv[3];
if (!buildUrl || !outputDirectory) {
  console.error('Usage: node tools/preview_food_delivery_feed.cjs <build-url> <output-directory>');
  process.exit(2);
}
if (!/^https?:\/\//i.test(buildUrl)) {
  console.error('build-url must be an http(s) URL served from the fresh Cocos build');
  process.exit(2);
}

const { chromium } = require(process.env.FOOD_DELIVERY_PLAYWRIGHT_PATH ||
  '/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
fs.mkdirSync(outputDirectory, { recursive: true });
const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gem-food-delivery-profile-'));
const screenshots = {
  gameplay: path.join(outputDirectory, 'gameplay-750x1624.png'),
  short: path.join(outputDirectory, 'gameplay-short.png'),
  tall: path.join(outputDirectory, 'gameplay-tall.png'),
  success: path.join(outputDirectory, 'success.png'),
  failure: path.join(outputDirectory, 'failure.png'),
};
const reportPath = path.join(outputDirectory, 'food-delivery-browser-verification.json');

async function setViewport(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.evaluate(({ width: nextWidth, height: nextHeight }) => {
    cc.view.setFrameSize(nextWidth, nextHeight);
    cc.view.setDesignResolutionSize(750, 1624, cc.ResolutionPolicy.FIXED_WIDTH);
    const scene = cc.director.getScene();
    const canvas = scene?.getChildByName('Canvas');
    for (const node of [canvas, canvas?.getChildByName('Background'),
      canvas?.getChildByName('SafeArea'), canvas?.getChildByName('ResultOverlay')]) {
      node?.getComponent(cc.Widget)?.updateAlignment();
    }
  }, { width, height });
  await page.waitForTimeout(120);
}

async function sceneLayout(page) {
  return page.evaluate(() => {
    const scene = cc.director.getScene();
    const canvas = scene.getChildByName('Canvas');
    const game = canvas.getComponent('foodDeliveryFeedGameScene');
    const camera = canvas.getComponent(cc.Canvas).cameraComponent;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const bounds = node => {
      const transform = node.getComponent(cc.UITransform);
      const corners = [
        new cc.Vec3(-transform.width * transform.anchorX, -transform.height * transform.anchorY),
        new cc.Vec3(transform.width * (1 - transform.anchorX), -transform.height * transform.anchorY),
        new cc.Vec3(-transform.width * transform.anchorX, transform.height * (1 - transform.anchorY)),
        new cc.Vec3(transform.width * (1 - transform.anchorX), transform.height * (1 - transform.anchorY)),
      ].map(point => camera.worldToScreen(transform.convertToWorldSpaceAR(point)));
      const xs = corners.map(point => point.x);
      const ys = corners.map(point => viewport.height - point.y);
      return {
        name: node.name,
        left: Math.min(...xs), right: Math.max(...xs),
        top: Math.min(...ys), bottom: Math.max(...ys),
        active: node.activeInHierarchy,
      };
    };
    const backgroundTransform = game.background.getComponent(cc.UITransform);
    const backgroundBounds = bounds(game.background);
    if (backgroundBounds.left > 0 || backgroundBounds.right < viewport.width ||
        backgroundBounds.top > 0 || backgroundBounds.bottom < viewport.height) {
      throw new Error(`background does not cover viewport: ${JSON.stringify(backgroundBounds)}`);
    }
    const fixed = [game.backButton.node, game.courier, game.guard, ...game.orderSprites].map(bounds);
    const title = bounds(canvas.getChildByName('SafeArea').getChildByName('Title'));
    const starRow = Array.from({ length: 5 }, (_, index) =>
      bounds(game.gameplayRoot.getChildByName(`StarOff${index}`)));
    for (const item of fixed) {
      if (!item.active || item.right <= 0 || item.left >= viewport.width ||
          item.bottom <= 0 || item.top >= viewport.height) {
        throw new Error(`fixed gameplay node left the viewport: ${JSON.stringify(item)}`);
      }
    }
    const starTop = Math.min(...starRow.map(item => item.top));
    if (starTop < title.bottom + 12) {
      throw new Error(`star row overlaps safe-area title: ${JSON.stringify({ title, starRow })}`);
    }
    return {
      viewport,
      visible: { width: cc.view.getVisibleSize().width, height: cc.view.getVisibleSize().height },
      background: {
        width: backgroundTransform.width,
        height: backgroundTransform.height,
        scale: { x: game.background.scale.x, y: game.background.scale.y },
        bounds: backgroundBounds,
      },
      gameplayScale: { x: game.gameplayRoot.scale.x, y: game.gameplayRoot.scale.y },
      title,
      starRow,
      fixed,
    };
  });
}

async function tap(client, x, y) {
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, radiusX: 3, radiusY: 3, force: 1 }],
  });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function findHitAngle(page) {
  return page.evaluate(async () => {
    const { FoodDeliveryRound, FOOD_KINDS } = await System.import('chunks:///_virtual/foodDeliveryRules.ts');
    const game = cc.director.getScene().getChildByName('Canvas')
      .getComponent('foodDeliveryFeedGameScene');
    const gameplayTransform = game.gameplayRoot.getComponent(cc.UITransform);
    const tuning = { speed: game.speed, gravity: game.gravity,
      radius: game.radius, maxFlightSeconds: game.maxFlightSeconds };
    for (let angle = 0; angle < 360; angle += 0.5) {
      game.armPivot.angle = angle;
      game.armPivot.updateWorldTransform();
      const origin = gameplayTransform.convertToNodeSpaceAR(game.muzzle.worldPosition);
      const shoulder = gameplayTransform.convertToNodeSpaceAR(game.armPivot.worldPosition);
      const shotAngle = Math.atan2(origin.y - shoulder.y, origin.x - shoulder.x) * 180 / Math.PI;
      const order = [game.round.currentFood, ...FOOD_KINDS.filter(food => food !== game.round.currentFood)];
      const trial = new FoodDeliveryRound(game.round.worldValue, tuning, order);
      trial.shoot(shotAngle, { x: origin.x, y: origin.y });
      for (let frame = 0; frame < 300 && trial.phase === 'flying'; frame++) trial.tick(1 / 60);
      if (trial.phase === 'delivered') return { angle, shotAngle, food: game.round.currentFood };
    }
    throw new Error(`no real collision angle found for ${game.round.currentFood}`);
  });
}

(async () => {
  const errors = [];
  const blockedRequests = [];
  const report = {
    buildUrl,
    outputDirectory,
    profileDirectory,
    screenshots,
    normalEntry: {},
    layouts: {},
    feedLifecycle: {},
    blockedRequests,
    errors,
  };
  const context = await chromium.launchPersistentContext(profileDirectory, {
    headless: true,
    executablePath: process.env.FOOD_DELIVERY_CHROME_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    viewport: { width: 750, height: 1624 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    args: ['--no-first-run', '--disable-background-networking', '--use-gl=angle',
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl'],
  });
  try {
    const page = context.pages()[0] || await context.newPage();
    const allowedOrigin = new URL(buildUrl).origin;
    await context.route('**/*', route => {
      const requestUrl = route.request().url();
      if (requestUrl.startsWith(allowedOrigin) || /^(?:data|blob):/.test(requestUrl)) {
        return route.continue();
      }
      blockedRequests.push(requestUrl);
      return route.abort('blockedbyclient');
    });
    page.on('pageerror', error => errors.push(`pageerror: ${error.stack || error.message}`));
    page.on('requestfailed', request => {
      if (!blockedRequests.includes(request.url())) {
        errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`);
      }
    });
    page.on('response', response => {
      if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
        errors.push(`response: ${response.status()} ${response.url()}`);
      }
    });
    page.on('console', message => {
      const text = message.text();
      if (message.type() === 'error' && !text.startsWith('Failed to load resource:')) {
        errors.push(`console: ${text}`);
      }
      if (/missing (?:component|asset)|图片加载失败|资源加载失败/i.test(text)) {
        errors.push(`asset: ${text}`);
      }
    });
    await page.addInitScript(() => localStorage.setItem('gem_first_direct_game_entry_v1', '1'));
    await page.goto(buildUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(async () => { window.cc = await System.import('cc'); });
    await page.waitForFunction(() => cc.director.getScene()?.name === 'NewMainScene', { timeout: 30000 });
    const home = await page.evaluate(async () => {
      const { GameConfig } = await System.import('chunks:///_virtual/GameConfig.ts');
      GameConfig.showAd = false;
      const controller = cc.director.getScene().getChildByName('Canvas').getComponent('newMainScene');
      const entry = controller.foodDeliveryButton?.node;
      if (!entry?.activeInHierarchy) throw new Error('FoodDeliveryCard homepage entry is unavailable');
      entry.emit(cc.Button.EventType.CLICK);
      return { entry: entry.name };
    });
    await page.waitForFunction(() => cc.director.getScene()?.name === 'FoodDeliveryFeedGameScene',
      { timeout: 30000 });
    await page.waitForTimeout(450);
    report.normalEntry.home = home;

    report.layouts.base = await sceneLayout(page);
    await page.screenshot({ path: screenshots.gameplay });
    await setViewport(page, 750, 1334);
    report.layouts.short = await sceneLayout(page);
    await page.screenshot({ path: screenshots.short });
    await setViewport(page, 750, 1800);
    report.layouts.tall = await sceneLayout(page);
    await page.screenshot({ path: screenshots.tall });
    await setViewport(page, 750, 1624);

    const client = await context.newCDPSession(page);
    await page.evaluate(() => {
      const game = cc.director.getScene().getChildByName('Canvas')
        .getComponent('foodDeliveryFeedGameScene');
      game.rotationSpeed = 0;
    });
    const hits = [];
    for (let index = 0; index < 5; index++) {
      const target = await findHitAngle(page);
      await page.evaluate(angle => {
        const game = cc.director.getScene().getChildByName('Canvas')
          .getComponent('foodDeliveryFeedGameScene');
        game.armPivot.angle = angle;
        game.armPivot.updateWorldTransform();
      }, target.angle);
      await tap(client, 375, 900);
      await page.waitForFunction(() => {
        const game = cc.director.getScene().getChildByName('Canvas')
          .getComponent('foodDeliveryFeedGameScene');
        return game.round.phase !== 'flying';
      });
      const outcome = await page.evaluate(() => {
        const game = cc.director.getScene().getChildByName('Canvas')
          .getComponent('foodDeliveryFeedGameScene');
        return { phase: game.round.phase, score: game.round.score, food: game.round.currentFood };
      });
      if (!['delivered', 'won'].includes(outcome.phase)) {
        throw new Error(`real CDP touch missed target: ${JSON.stringify({ target, outcome })}`);
      }
      hits.push({ ...target, ...outcome });
      if (outcome.phase === 'delivered') {
        await page.waitForFunction(() => cc.director.getScene().getChildByName('Canvas')
          .getComponent('foodDeliveryFeedGameScene').round.phase === 'aiming');
      }
    }
    await page.waitForFunction(() => cc.director.getScene().getChildByName('Canvas')
      .getComponent('foodDeliveryFeedGameScene').resultOverlay.activeInHierarchy);
    await page.screenshot({ path: screenshots.success });
    report.normalEntry.hits = hits;
    report.normalEntry.success = await page.evaluate(() => {
      const game = cc.director.getScene().getChildByName('Canvas')
        .getComponent('foodDeliveryFeedGameScene');
      return { phase: game.round.phase, score: game.round.score,
        successTitle: game.successTitle.activeInHierarchy,
        successContent: game.successContent.activeInHierarchy,
        failureContent: game.failureContent.activeInHierarchy,
        nextButton: game.nextButton.node.activeInHierarchy };
    });
    assert.deepEqual(report.normalEntry.success,
      { phase: 'won', score: 5, successTitle: true,
        successContent: true, failureContent: false, nextButton: true });

    report.normalEntry.nextRound = await page.evaluate(() => {
      const game = cc.director.getScene().getChildByName('Canvas')
        .getComponent('foodDeliveryFeedGameScene');
      game.nextButton.node.emit(cc.Button.EventType.CLICK);
      return { phase: game.round.phase, score: game.round.score, overlay: game.resultOverlay.active };
    });
    assert.deepEqual(report.normalEntry.nextRound, { phase: 'aiming', score: 0, overlay: false });
    await page.evaluate(() => {
      const game = cc.director.getScene().getChildByName('Canvas')
        .getComponent('foodDeliveryFeedGameScene');
      game.armPivot.angle = 180;
      game.armPivot.updateWorldTransform();
    });
    await tap(client, 375, 900);
    await page.waitForFunction(() => cc.director.getScene().getChildByName('Canvas')
      .getComponent('foodDeliveryFeedGameScene').resultOverlay.activeInHierarchy);
    await page.screenshot({ path: screenshots.failure });
    report.normalEntry.failure = await page.evaluate(() => {
      const game = cc.director.getScene().getChildByName('Canvas')
        .getComponent('foodDeliveryFeedGameScene');
      const order = [...game.round.order];
      const failedPhase = game.round.phase;
      const successContent = game.successContent.activeInHierarchy;
      const failureContent = game.failureContent.activeInHierarchy;
      game.retryButton.node.emit(cc.Button.EventType.CLICK);
      return { failedPhase, retryPhase: game.round.phase, score: game.round.score,
        sameOrder: JSON.stringify(order) === JSON.stringify(game.round.order),
        successContent, failureContent, overlay: game.resultOverlay.active };
    });
    assert.deepEqual(report.normalEntry.failure,
      { failedPhase: 'failed', retryPhase: 'aiming', score: 0, sameOrder: true,
        successContent: false, failureContent: true, overlay: false });
    await page.evaluate(() => cc.director.getScene().getChildByName('Canvas')
      .getComponent('foodDeliveryFeedGameScene').backButton.node.emit(cc.Button.EventType.CLICK));
    await page.waitForFunction(() => cc.director.getScene()?.name === 'NewMainScene');
    await page.evaluate(() => cc.director.getScene().getChildByName('Canvas')
      .getComponent('newMainScene').foodDeliveryButton.node.emit(cc.Button.EventType.CLICK));
    await page.waitForFunction(() => cc.director.getScene()?.name === 'FoodDeliveryFeedGameScene');
    report.normalEntry.reopened = true;
    await page.evaluate(() => cc.director.getScene().getChildByName('Canvas')
      .getComponent('foodDeliveryFeedGameScene').returnHome());
    await page.waitForFunction(() => cc.director.getScene()?.name === 'NewMainScene');

    report.feedLifecycle = await page.evaluate(async () => {
      const { EnvTool } = await System.import('chunks:///_virtual/EnvTool.ts');
      const { FeedAcquisitionService: feed } = await System.import(
        'chunks:///_virtual/FeedAcquisitionService.ts');
      const { GameSceneBundle, GameSceneName } = await System.import(
        'chunks:///_virtual/GameSceneBundle.ts');
      const { adc } = await System.import('chunks:///_virtual/ADController.ts');
      const audioModule = await System.import('chunks:///_virtual/AudioManager.ts');
      const audio = audioModule.default;
      window.foodDeliveryFeedHarness = { listeners: {}, reports: [], ads: [], audio: [] };
      const harness = window.foodDeliveryFeedHarness;
      const on = (name, callback) => (harness.listeners[name] ||= new Set()).add(callback);
      const off = (name, callback) => harness.listeners[name]?.delete(callback);
      window.tt = {
        getLaunchOptionsSync: () => ({ scene: '103041', query: {
          feed_game_scene: 0, feed_game_channel: 2, feed_game_content_id: 'TEST_FOOD_DELIVERY',
        } }),
        getSystemInfoSync: () => ({ windowWidth: 750, windowHeight: 1624 }),
        reportScene: options => { harness.reports.push(options.sceneId); options.success?.(); },
        onFeedStatusChange: callback => on('feed', callback),
        offFeedStatusChange: callback => off('feed', callback),
        onTouchStart: callback => on('Start', callback),
        offTouchStart: callback => off('Start', callback),
      };
      EnvTool.isByteDanceMiniGame = () => true;
      EnvTool.isByteDance = () => true;
      EnvTool.getMiniGameApi = () => window.tt;
      for (const key of ['initialized', 'active', 'entered', 'exited', 'statusApiSupported',
        'sceneReadyReported']) feed[key] = false;
      feed.mode = 'none'; feed.feedScene = -1; feed.contentId = ''; feed.extra = '';
      feed.statusChangeHandler = null; feed.listeners.clear();
      const originalSchedule = adc.scheduleFeedEntryInterstitial.bind(adc);
      const originalCancel = adc.cancelFeedEntryInterstitial.bind(adc);
      adc.scheduleFeedEntryInterstitial = validity => {
        harness.ads.push({ type: 'schedule', validity: typeof validity === 'function' });
      };
      adc.cancelFeedEntryInterstitial = () => harness.ads.push({ type: 'cancel' });
      for (const name of ['setSoundEvent', 'playMusic', 'restartMusic', 'pauseBgmForVideo',
        'playEffect', 'playDefaultBgm']) {
        audio[name] = (...args) => harness.audio.push([name, ...args]);
      }
      feed.init();
      await GameSceneBundle.loadScene(GameSceneName.FoodDeliveryFeedGame);
      harness.restore = () => {
        adc.scheduleFeedEntryInterstitial = originalSchedule;
        adc.cancelFeedEntryInterstitial = originalCancel;
      };
      return { state: feed.getState() };
    });
    await page.waitForFunction(() => cc.director.getScene()?.name === 'FoodDeliveryFeedGameScene');
    const previewBefore = await page.evaluate(() => {
      const game = cc.director.getScene().getChildByName('Canvas')
        .getComponent('foodDeliveryFeedGameScene');
      return { angle: game.armPivot.angle, phase: game.round.phase, score: game.round.score,
        schedules: foodDeliveryFeedHarness.ads.filter(item => item.type === 'schedule').length,
        cancels: foodDeliveryFeedHarness.ads.filter(item => item.type === 'cancel').length,
        audio: foodDeliveryFeedHarness.audio.length };
    });
    await page.waitForTimeout(350);
    const previewAfter = await page.evaluate(() => {
      const game = cc.director.getScene().getChildByName('Canvas')
        .getComponent('foodDeliveryFeedGameScene');
      return { angle: game.armPivot.angle, phase: game.round.phase, score: game.round.score,
        schedules: foodDeliveryFeedHarness.ads.filter(item => item.type === 'schedule').length,
        cancels: foodDeliveryFeedHarness.ads.filter(item => item.type === 'cancel').length,
        audio: foodDeliveryFeedHarness.audio.length };
    });
    assert.notEqual(previewAfter.angle, previewBefore.angle);
    assert.equal(previewBefore.schedules, 0);
    assert.equal(previewAfter.schedules, 0);
    assert.equal(previewAfter.phase, previewBefore.phase);
    assert.equal(previewAfter.score, previewBefore.score);
    assert.equal(previewAfter.audio, previewBefore.audio);
    await page.evaluate(() => {
      for (const callback of foodDeliveryFeedHarness.listeners.feed || []) callback({ type: 'feedEnter' });
      const game = cc.director.getScene().getChildByName('Canvas')
        .getComponent('foodDeliveryFeedGameScene');
      game.rotationSpeed = 0;
      for (const callback of foodDeliveryFeedHarness.listeners.Start || []) {
        callback({ touches: [{ clientX: 375, clientY: 900 }] });
      }
    });
    await tap(client, 375, 900);
    const entered = await page.evaluate(() => {
      const game = cc.director.getScene().getChildByName('Canvas')
        .getComponent('foodDeliveryFeedGameScene');
      return { phase: game.round.phase,
        shootSounds: foodDeliveryFeedHarness.audio
          .filter(item => item[0] === 'playEffect' && item[1] === 'archeryShoot').length,
        schedules: foodDeliveryFeedHarness.ads.filter(item => item.type === 'schedule').length };
    });
    assert.notEqual(entered.phase, 'aiming', 'native touch must launch the single projectile');
    assert.equal(entered.shootSounds, 1);
    assert.equal(entered.schedules, 1);
    await page.evaluate(() => {
      for (const callback of foodDeliveryFeedHarness.listeners.feed || []) callback({ type: 'feedExit' });
    });
    const frozenBefore = await page.evaluate(() => {
      const game = cc.director.getScene().getChildByName('Canvas')
        .getComponent('foodDeliveryFeedGameScene');
      return JSON.stringify(game.round.projectile);
    });
    await page.waitForTimeout(250);
    const frozenAfter = await page.evaluate(() => {
      const game = cc.director.getScene().getChildByName('Canvas')
        .getComponent('foodDeliveryFeedGameScene');
      cc.game.emit(cc.Game.EVENT_HIDE);
      cc.game.emit(cc.Game.EVENT_SHOW);
      return JSON.stringify(game.round.projectile);
    });
    assert.equal(frozenAfter, frozenBefore);
    await page.evaluate(async () => {
      const game = cc.director.getScene().getChildByName('Canvas')
        .getComponent('foodDeliveryFeedGameScene');
      foodDeliveryFeedHarness.lateHandlers = [...(foodDeliveryFeedHarness.listeners.Start || [])];
      await game.returnHome();
    });
    await page.waitForFunction(() => cc.director.getScene()?.name === 'NewMainScene');
    await page.waitForTimeout(50);
    const destroyed = await page.evaluate(() => {
      for (const callback of foodDeliveryFeedHarness.lateHandlers || []) {
        callback({ touches: [{ clientX: 375, clientY: 900 }] });
      }
      foodDeliveryFeedHarness.restore();
      return { nativeHandlers: foodDeliveryFeedHarness.listeners.Start?.size || 0,
        reports: [...foodDeliveryFeedHarness.reports], ads: [...foodDeliveryFeedHarness.ads],
        audio: [...foodDeliveryFeedHarness.audio] };
    });
    assert.equal(destroyed.nativeHandlers, 0, 'destroyed scene must unregister native touch');
    report.feedLifecycle = {
      ...report.feedLifecycle,
      previewBefore, previewAfter, entered,
      frozen: frozenAfter === frozenBefore,
      destroyed,
    };

    await page.waitForTimeout(250);
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    if (errors.length) process.exitCode = 1;
  } finally {
    await context.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
