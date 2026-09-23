// Real Cocos web build, mobile touch input, and simulated Douyin launch/status APIs.
// No real advertising, analytics or platform reports are sent.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PENGUIN_PLAYWRIGHT_PATH ||
  '/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.PENGUIN_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
    const errors = [], warnings = [];
    page.on('pageerror', e => errors.push(e.stack || e.message));
    page.on('console', m => {
      if (m.type() === 'error' && !m.location().url?.endsWith('/favicon.ico')) errors.push(m.text());
      if (m.type() === 'warning' && /FeedAcquisition|penguinStack/.test(m.text())) warnings.push(m.text());
    });
    await page.addInitScript(() => localStorage.setItem('gem_first_direct_game_entry_v1', '1'));
    await page.goto(process.env.PENGUIN_PREVIEW_URL || 'http://127.0.0.1:7457/');
    await page.evaluate(async () => { window.cc = await System.import('cc'); });
    await page.waitForFunction(() => cc.director.getScene()?.name === 'NewMainScene', { timeout: 30000 });
    await page.evaluate(async () => {
      const { GameConfig } = await System.import('chunks:///_virtual/GameConfig.ts');
      GameConfig.showAd = false;
      await cc.director.getScene().getChildByName('Canvas').getComponent('newMainScene').openPenguin();
    });
    await page.waitForFunction(() => cc.director.getScene()?.name === 'PenguinStackFeedGameScene');
    await page.waitForFunction(() => cc.director.getScene().getChildByName('Canvas')
      .getComponent('penguinStackFeedGameScene').guideNode.activeInHierarchy);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 130, y: 560 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 250, y: 560 }] });
    await page.waitForFunction(() => cc.director.getScene().getChildByName('Canvas')
      .getComponent('penguinStackFeedGameScene').whale.position.x > 100);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    console.log('PASS main entry initializes and browser mobile touch moves the whale');

    await page.evaluate(async () => {
      const { GameSceneBundle, GameSceneName } = await System.import('chunks:///_virtual/GameSceneBundle.ts');
      await GameSceneBundle.loadScene(GameSceneName.Main);
    });
    await page.waitForFunction(() => cc.director.getScene()?.name === 'NewMainScene');
    const route = await page.evaluate(async () => {
      const { EnvTool } = await System.import('chunks:///_virtual/EnvTool.ts');
      const { FeedAcquisitionService: feed } = await System.import('chunks:///_virtual/FeedAcquisitionService.ts');
      const { loadScene } = await System.import('chunks:///_virtual/loadScene.ts');
      const { GameSceneBundle } = await System.import('chunks:///_virtual/GameSceneBundle.ts');
      window.feedReports = [];
      window.nativeListeners = {};
      const on = (key, fn) => (nativeListeners[key] ||= new Set()).add(fn);
      const off = (key, fn) => nativeListeners[key]?.delete(fn);
      window.tt = {
        getLaunchOptionsSync: () => ({ scene: '103041', query: { feed_game_scene: 0,
          feed_game_channel: 2, feed_game_content_id: 'CONTENT14860954626' } }),
        getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812 }),
        reportScene: options => { feedReports.push(options.sceneId); options.success?.(); },
        onFeedStatusChange: fn => on('feed', fn), offFeedStatusChange: fn => off('feed', fn),
      };
      for (const kind of ['Start', 'Move', 'End', 'Cancel']) {
        tt['onTouch' + kind] = fn => on(kind, fn);
        tt['offTouch' + kind] = fn => off(kind, fn);
      }
      EnvTool.isByteDanceMiniGame = () => true;
      EnvTool.getMiniGameApi = () => tt;
      feed.initialized = false;
      feed.init();
      const entry = new loadScene().resolveFeedEntry();
      await GameSceneBundle.loadScene(entry.sceneName);
      return entry.sceneName;
    });
    assert.equal(route, 'PenguinStackFeedGameScene');
    await page.waitForFunction(() => window.feedReports.includes(7001), { timeout: 10000 });
    const ready = await page.evaluate(() => {
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('penguinStackFeedGameScene');
      return { reports: feedReports, entered: g.feedEntered, started: g.gameStarted,
        visiblePenguins: g.fallingPenguins.filter(n => n.activeInHierarchy).length };
    });
    assert.deepEqual(ready, { reports: [7001], entered: false, started: false, visiblePenguins: 1 });
    console.log('PASS feed preview is ready before user entry', JSON.stringify(ready));
    await page.evaluate(() => {
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('penguinStackFeedGameScene');
      const positions = () => JSON.stringify([g.fallingPenguins[0].position, g.whale.position]);
      const before = positions();
      for (let i = 0; i < 600; i++) g.update(1 / 60);
      if (positions() !== before || g.stackPenguins.some(n => n.active)) {
        throw new Error('feed card moved or displayed a prebuilt stack');
      }
    });
    await page.evaluate(() => {
      for (const fn of nativeListeners.feed) fn({ type: 'feedEnter' });
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('penguinStackFeedGameScene');
      if (g.round.caught !== 0 || g.catcherSink !== 0 || g.fallingPenguins.some(n => n.active)) {
        throw new Error('entering did not clear the static preview and reset the round');
      }
      for (const fn of nativeListeners.Start) fn({ touches: [{ clientX: 100 }] });
      for (const fn of nativeListeners.Move) fn({ touches: [{ clientX: 200 }] });
    });
    await page.waitForFunction(() => {
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('penguinStackFeedGameScene');
      return g.gameStarted && g.whale.position.x > 100;
    });
    console.log('PASS static card resets on feedEnter and native swipe starts gameplay');
    assert.deepEqual(warnings, []);
    assert.deepEqual(errors, []);
    console.log('ERRORS []');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
