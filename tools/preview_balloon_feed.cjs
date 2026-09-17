// Isolated local Creator browser smoke test. Does not touch the user's browser profile.
const fs = require('node:fs');
const { chromium } = require(process.env.BALLOON_PLAYWRIGHT_PATH ||
  '/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const destination = process.env.BALLOON_PREVIEW_DIR || '/tmp/gem-feed-video-qZKcz3';
const sceneId = '1c6b548c-ff93-5519-a51a-1cc2ed5ccaf4';
(async () => {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.BALLOON_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 1700 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:7456/?scene=${sceneId}`, { waitUntil: 'load' });
    await page.evaluate(async () => { window.cc = await System.import('cc'); });
    try { await page.waitForFunction(() => !!window.cc?.director?.getScene(), { timeout: 30000 }); }
    catch (error) {
      await page.screenshot({ path: `${destination}/balloon-startup-error.png` });
      console.log('STARTUP_ERRORS', JSON.stringify(errors)); throw error;
    }
    const state = await page.evaluate(() => ({ scene: cc.director.getScene().name,
      width: cc.view.getVisibleSize().width, height: cc.view.getVisibleSize().height }));
    console.log('INITIAL', JSON.stringify(state));
    if (state.scene !== 'BalloonWheelFeedGameScene') {
      await page.evaluate(uuid => new Promise((resolve, reject) => {
        cc.assetManager.loadAny(uuid, (error, asset) => {
          if (error) return reject(error.message || error);
          cc.director.runScene(asset); resolve();
        });
      }), sceneId);
    }
    await page.waitForFunction(() => cc.director.getScene()?.getChildByName('Canvas')?.getComponent('balloonWheelFeedGameScene'));
    await page.evaluate(() => {
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('balloonWheelFeedGameScene');
      g.rotationSpeed = 0; g.resetRound(); cc.director.tick(0);
      if (g.round.remainingAmmo !== 8 || g.ammoLabel.string !== '×8') throw new Error('Initial ammo must be eight');
    });
    await page.screenshot({ path: `${destination}/balloon-preview.png` });
    const gameplay = await page.evaluate(() => {
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('balloonWheelFeedGameScene');
      const windows = Array.from({ length: 6 }, () => []); let characterWindows = 0;
      for (let angle = 0; angle < 360; angle += 0.25) {
        g.wheelRoot.angle = angle;
        const target = g.classifyShot(g.crosshair.worldPosition.clone());
        if (typeof target === 'number') windows[target].push(angle);
        else if (target === 'character') characterWindows++;
      }
      if (windows.some(list => !list.length) || !characterWindows) throw new Error('Unreachable balloon or missing character collision');
      const shots = [];
      g.resetRound();
      for (let i = 0; i < 6; i++) {
        g.wheelRoot.angle = windows[i][Math.floor(windows[i].length / 2)];
        g.round.cooldown = 0;
        g.fire(); shots.push({ target: i, hits: g.round.hits, ammo: g.round.remainingAmmo, state: g.round.status });
      }
      if (g.round.status !== 'success' || g.round.score !== 2100) throw new Error('Actual transform-based six-shot test failed');
      g.resetRound();
      return { hitWindowDegrees: windows.map(x => x.length * 0.25), characterWindowDegrees: characterWindows * 0.25, shots };
    });
    console.log('GAMEPLAY', JSON.stringify(gameplay));
    console.log('SCENE', await page.evaluate(() => {
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('balloonWheelFeedGameScene');
      const bounds = node => {
        const t = node.getComponent(cc.UITransform); return { name: node.name, x: node.worldPosition.x, y: node.worldPosition.y,
          width: t?.width, height: t?.height, active: node.activeInHierarchy };
      };
      return { wheel: bounds(g.wheelRoot), gun: bounds(g.gun), ammo: bounds(g.ammoLabel.node), aim: bounds(g.crosshair),
        controls: g.bindings.map(([b]) => bounds(b.node)), scene: cc.director.getScene().name };
    }));
    console.log('FAILURE_UI', await page.evaluate(() => {
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('balloonWheelFeedGameScene');
      g.round.fire('character'); g.showResult(); g.update(0.3); g.update(0.3); g.update(0.3);
      g.resultHomeButton.node.parent.getComponent(cc.Layout)?.updateLayout();
      if (!g.failureTitle.activeInHierarchy || g.failureTitle.parent !== g.resultPanel) throw new Error('Failure title binding is detached');
      if (!g.reviveButton.node.activeInHierarchy || !g.failureRetryButton.node.activeInHierarchy ||
          g.retryButton.node.active || g.nextButton.node.active) throw new Error('Wrong failure actions');
      return { titleVisible: g.failureTitle.activeInHierarchy, revive: g.reviveButtonLabel.string,
        badgeVisible: g.reviveButton.node.getChildByName('AdBadge').activeInHierarchy,
        homeX: g.resultHomeButton.node.position.x, retryX: g.failureRetryButton.node.position.x };
    }));
    await page.screenshot({ path: `${destination}/balloon-failure.png` });
    await page.locator('canvas').first().screenshot({ path: 'marketing/feed/balloon-wheel-failure-preview.png' });
    await page.evaluate(() => {
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('balloonWheelFeedGameScene');
      // Real Cocos button binding, without requesting an actual ad.
      g.failureRetryButton.node.emit(cc.Button.EventType.CLICK);
      if (g.round.remainingAmmo !== 8 || g.resultOverlay.active) throw new Error('Free failure retry did not reset');
    });
    await page.evaluate(() => {
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('balloonWheelFeedGameScene');
      g.resetRound();
      for (let i = 0; i < 6; i++) {
        let hitAngle = null;
        for (let angle = 0; angle < 360; angle += 0.25) {
          g.wheelRoot.angle = angle;
          if (g.classifyShot(g.crosshair.worldPosition.clone()) === i) { hitAngle = angle; break; }
        }
        if (hitAngle === null) throw new Error(`No hit angle for balloon ${i}`);
        g.wheelRoot.angle = hitAngle; g.round.cooldown = 0; g.fire();
      }
      g.showResult();
      g.update(0.3); g.update(0.3); g.update(0.3);
      if (!g.successTitle.activeInHierarchy || !g.nextButton.node.active || !g.retryButton.node.active ||
          g.reviveButton.node.active || g.failureRetryButton.node.active) throw new Error('Success actions changed');
    });
    await page.screenshot({ path: `${destination}/balloon-success.png` });
    console.log('TALL', await page.evaluate(() => {
      cc.view.setFrameSize(750, 1624);
      cc.view.setDesignResolutionSize(750, 1334, cc.ResolutionPolicy.FIXED_WIDTH);
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('balloonWheelFeedGameScene');
      for (const node of [g.node, g.resultOverlay, g.resultOverlay.getChildByName('DimBackground')]) {
        node.getComponent(cc.Widget)?.updateAlignment();
      }
      const transform = g.resultOverlay.getComponent(cc.UITransform);
      return { visible: cc.view.getVisibleSize(), mask: { width: transform.width, height: transform.height } };
    }));
    await page.screenshot({ path: `${destination}/balloon-tall-success.png` });
    await page.evaluate(() => {
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('balloonWheelFeedGameScene');
      g.resetRound();
    });
    await page.screenshot({ path: `${destination}/balloon-tall-preview.png` });
    await page.locator('canvas').first().screenshot({ path: 'marketing/feed/balloon-wheel-preview.png' });
    console.log('SCALED_BUTTON_INPUT', await page.evaluate(() => {
      cc.view.setFrameSize(375, 812);
      cc.view.setDesignResolutionSize(750, 1334, cc.ResolutionPolicy.FIXED_WIDTH);
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('balloonWheelFeedGameScene');
      const camera = g.node.getComponent(cc.Canvas).cameraComponent;
      const nodes = [g.backButton.node, g.timeButton.node, g.ammoButton.node,
        g.timeButton.node.getChildByName('AdBadge'), g.ammoButton.node.getChildByName('AdBadge')];
      for (const node of nodes) {
        const screen = camera.worldToScreen(node.worldPosition);
        const event = { windowId: camera.systemWindowId, getLocation: () => new cc.Vec2(screen.x, screen.y),
          getUILocation: () => { throw new Error('UI coordinates must not be used for hitTest'); } };
        const before = g.round.remainingAmmo;
        g.round.cooldown = 0; g.onTouchStart(event);
        if (g.round.remainingAmmo !== before) throw new Error(`Button/badge touch fired: ${node.name}`);
      }
      return { tested: nodes.map(node => node.name), scaleX: cc.view.getScaleX(), ammo: g.round.remainingAmmo };
    }));
    await page.evaluate(() => cc.director.getScene().getChildByName('Canvas').getComponent('balloonWheelFeedGameScene').returnHome());
    await page.waitForFunction(() => cc.director.getScene()?.name === 'MainScene');
    console.log('HOME', await page.evaluate(() => {
      const home = cc.director.getScene().getChildByName('Canvas').getComponent('mainScene');
      return { entry: home.balloonWheelGameBtn?.node?.name, active: home.balloonWheelGameBtn?.node?.activeInHierarchy };
    }));
    await page.evaluate(() => cc.director.getScene().getChildByName('Canvas').getComponent('mainScene').gotoBalloonWheelGame());
    await page.waitForFunction(() => cc.director.getScene()?.name === 'BalloonWheelFeedGameScene');
    fs.writeFileSync(`${destination}/balloon-browser-errors.json`, JSON.stringify(errors, null, 2));
    console.log('ERRORS', JSON.stringify(errors));
    if (errors.length) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
