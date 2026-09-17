// Browser smoke test for an already-built web-mobile preview.
const fs = require('node:fs');
const { chromium } = require(process.env.PENGUIN_PLAYWRIGHT_PATH ||
  '/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const output = process.env.PENGUIN_PREVIEW_OUTPUT || '/private/tmp/gem-penguin-shots';
const url = process.env.PENGUIN_PREVIEW_URL || 'http://127.0.0.1:7457/';
const viewportWidth = Number(process.env.PENGUIN_VIEWPORT_WIDTH || 576);
const viewportHeight = Number(process.env.PENGUIN_VIEWPORT_HEIGHT || 1280);
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PENGUIN_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  try {
    const page = await browser.newPage({
      viewport: { width: viewportWidth, height: viewportHeight },
      deviceScaleFactor: 1,
    });
    const errors = [];
    await page.addInitScript(() => localStorage.setItem('gem_first_direct_game_entry_v1', '1'));
    page.on('pageerror', error => errors.push(error.stack || error.message));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const location = message.location();
      if (location.url?.endsWith('/favicon.ico')) return;
      errors.push(`${message.text()} @ ${JSON.stringify(location)}`);
    });
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(async () => { window.cc = await System.import('cc'); });
    await page.waitForFunction(() => !!window.cc?.director?.getScene(), { timeout: 30000 });
    // Let the project's normal loading scene finish so it cannot replace the manually loaded test scene later.
    await page.waitForFunction(() => ['MainScene', 'GameScene'].includes(cc.director.getScene()?.name), {
      timeout: 30000,
    });
    const homeEntry = await page.evaluate(() => {
      const scene = cc.director.getScene();
      const controller = scene?.getChildByName('Canvas')?.getComponent('mainScene');
      return { scene: scene?.name, entry: controller?.penguinStackGameBtn?.node?.name || '' };
    });
    if (homeEntry.scene !== 'MainScene' || homeEntry.entry !== 'penguinStackGameBtn') {
      throw new Error(`MainScene penguin entry missing: ${JSON.stringify(homeEntry)}`);
    }
    console.log('HOME_ENTRY', JSON.stringify(homeEntry));
    await page.evaluate(() =>
      cc.director.getScene().getChildByName('Canvas').getComponent('mainScene').gotoPenguinStackGame());
    await page.waitForFunction(() =>
      !!cc.director.getScene()?.getChildByName('Canvas')?.getComponent('penguinStackFeedGameScene'));
    await page.screenshot({ path: `${output}/penguin-start.png` });

    const initial = await page.evaluate(() => {
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('penguinStackFeedGameScene');
      return { scene: cc.director.getScene().name, guide: g.guideNode.activeInHierarchy,
        target: g.round.target, caught: g.round.caught, lives: g.round.lives,
        fallingPool: g.fallingPenguins.length, stackSlots: g.stackPenguins.length };
    });
    console.log('INITIAL', JSON.stringify(initial));

    const physics = await page.evaluate(() => {
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('penguinStackFeedGameScene');
      g.startGameplay();
      g.spawnOne();
      const item = g.falling.find(entry => entry.active);
      const catchY = -310;
      item.x = g.whaleX;
      item.y = catchY + 2;
      item.speed = 100;
      g.updateFalling(0.03);
      if (g.round.caught !== 1) throw new Error('actual falling collision did not catch the penguin');
      g.spawnOne();
      const edgeItem = g.falling.find(entry => entry.active);
      edgeItem.x = g.whaleX + g.stackPenguins[0].position.x + 191;
      edgeItem.y = -248;
      edgeItem.speed = 100;
      g.updateFalling(0.03);
      if (g.round.caught !== 2) throw new Error('visible edge contact was incorrectly counted as a miss');
      for (let i = 2; i < 7; i++) g.round.catchPenguin();
      g.renderStack();
      g.refreshHud();
      g.beginDrag(0.5);
      g.continueDrag(0.9);
      for (let i = 0; i < 12; i++) {
        g.updateWhale(1 / 60);
        g.updateTower(1 / 60);
      }
      const bottomX = g.stackPenguins[0].position.x;
      const topX = g.stackPenguins[6].position.x;
      if (!(topX < bottomX - 25)) throw new Error(`stack did not trail the drag enough: ${bottomX}, ${topX}`);
      if (!(g.whale.position.y < -520)) throw new Error(`whale did not sink with the stack: ${g.whale.position.y}`);
      return { caught: g.round.caught, visibleStack: g.stackPenguins.filter(node => node.active).length,
        guide: g.guideNode.active, whaleX: g.whale.position.x, whaleY: g.whale.position.y,
        bottomX, topX };
    });
    console.log('PHYSICS', JSON.stringify(physics));
    await page.screenshot({ path: `${output}/penguin-gameplay.png` });
    await page.locator('canvas').first().screenshot({ path: 'marketing/feed/penguin-stack-preview.png' });

    const stage = await page.evaluate(() => {
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('penguinStackFeedGameScene');
      while (g.round.caught < 10) {
        const outcome = g.round.catchPenguin();
        if (outcome?.stageChanged) {
          g.surgeRemaining = 1.35;
          g.surgeOverlay.active = true;
        }
      }
      g.renderStack(); g.refreshHud();
      for (let i = 0; i < 90; i++) {
        g.updateWhale(1 / 60);
        g.updateTower(1 / 60);
      }
      if (!(g.whale.position.y < -730)) {
        throw new Error(`ten-layer whale did not reach the lower limit: ${g.whale.position.y}`);
      }
      g.animateSurge();
      return { status: g.round.status, stage: g.round.stage, target: g.round.target,
        overlay: g.surgeOverlay.activeInHierarchy, whaleY: g.whale.position.y };
    });
    console.log('STAGE', JSON.stringify(stage));
    await page.screenshot({ path: `${output}/penguin-surge.png` });

    const endless = await page.evaluate(() => {
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('penguinStackFeedGameScene');
      g.finishStageBreak();
      if (g.round.caught !== 0 || g.stackPenguins.some(node => node.active) || !g.guideNode.active) {
        throw new Error('stage two did not restart from an empty guided state');
      }
      g.startGameplay();
      while (g.round.caught < 97) g.round.catchPenguin();
      g.renderStack(); g.refreshHud();
      g.dragging = false;
      for (let i = 0; i < 180; i++) {
        g.updateWhale(1 / 60);
        g.updateTower(1 / 60);
      }
      const halfHeight = cc.view.getVisibleSize().height * 0.5;
      const whaleHalfHeight = g.whale.getComponent(cc.UITransform).height * 0.5;
      const whaleTop = g.whale.position.y + whaleHalfHeight;
      const bottomWorldY = g.towerRoot.position.y + g.stackPenguins[0].position.y;
      const topWorldY = g.towerRoot.position.y + g.stackPenguins[9].position.y;
      const visibleLayerSpacing = g.stackPenguins[1].position.y - g.stackPenguins[0].position.y;
      if (!(whaleTop < -halfHeight)) throw new Error(`whale is still visible at 97: ${whaleTop}`);
      if (!(bottomWorldY > -halfHeight && topWorldY < halfHeight)) {
        throw new Error(`endless visible layers left the screen: ${bottomWorldY}, ${topWorldY}`);
      }
      if (!(bottomWorldY < -650)) {
        throw new Error(`bottom layer left a conspicuous gap above the controls: ${bottomWorldY}`);
      }
      if (Math.abs(visibleLayerSpacing - 52) > 0.01) {
        throw new Error(`visible stack layers are not tightly overlapped: ${visibleLayerSpacing}`);
      }
      return { caught: g.round.caught, visibleStack: g.stackPenguins.filter(node => node.active).length,
        whaleTop, screenBottom: -halfHeight, bottomWorldY, topWorldY, visibleLayerSpacing };
    });
    console.log('ENDLESS', JSON.stringify(endless));
    await page.screenshot({ path: `${output}/penguin-endless.png` });
    await page.locator('canvas').first().screenshot({ path: 'marketing/feed/penguin-stack-preview.png' });

    await page.evaluate(() => {
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('penguinStackFeedGameScene');
      g.resetRound(); g.startGameplay();
      g.round.missPenguin(); g.round.missPenguin(); g.round.missPenguin();
      g.refreshHud(); g.showResult();
    });
    await page.screenshot({ path: `${output}/penguin-failure.png` });
    const failure = await page.evaluate(() => {
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('penguinStackFeedGameScene');
      return { title: g.resultTitle.string, revive: g.reviveButton.node.activeInHierarchy,
        next: g.nextButton.node.activeInHierarchy, failCat: g.failCat.activeInHierarchy };
    });
    console.log('FAILURE', JSON.stringify(failure));

    await page.evaluate(() => {
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('penguinStackFeedGameScene');
      g.resetRound(); g.startGameplay(); g.round.skip(); g.refreshHud(); g.showResult();
    });
    await page.screenshot({ path: `${output}/penguin-success.png` });
    const success = await page.evaluate(() => {
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('penguinStackFeedGameScene');
      return { title: g.resultTitle.string, revive: g.reviveButton.node.activeInHierarchy,
        next: g.nextButton.node.activeInHierarchy, successCat: g.successCat.activeInHierarchy };
    });
    console.log('SUCCESS', JSON.stringify(success));

    await page.setViewportSize({ width: 750, height: 1624 });
    const tall = await page.evaluate(() => {
      cc.view.setFrameSize(750, 1624);
      cc.view.setDesignResolutionSize(750, 1334, cc.ResolutionPolicy.FIXED_WIDTH);
      const g = cc.director.getScene().getChildByName('Canvas').getComponent('penguinStackFeedGameScene');
      for (const node of [g.node, g.sceneBackground, g.resultOverlay,
        g.resultOverlay.getChildByName('DimBackground')]) node.getComponent(cc.Widget)?.updateAlignment();
      const overlay = g.resultOverlay.getComponent(cc.UITransform);
      return { visible: cc.view.getVisibleSize(), overlay: { width: overlay.width, height: overlay.height } };
    });
    console.log('TALL', JSON.stringify(tall));
    await page.screenshot({ path: `${output}/penguin-tall-success.png` });

    fs.writeFileSync(`${output}/penguin-browser-errors.json`, JSON.stringify(errors, null, 2));
    console.log('ERRORS', JSON.stringify(errors));
    if (errors.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
