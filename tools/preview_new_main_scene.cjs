const { chromium } = require(
  '/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);

const url = process.argv[2] || 'http://127.0.0.1:8123/';
const output = process.argv[3] || '/private/tmp/new-main-scene-preview.png';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--no-first-run',
      '--disable-background-networking',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--enable-webgl',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 750, height: 1334 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request =>
    errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
      errors.push(`response: ${response.status()} ${response.url()}`);
    }
  });
  page.on('console', message => {
    if (
      message.type() === 'error' &&
      !message.text().startsWith('Failed to load resource:')
    ) {
      errors.push(`console: ${message.text()}`);
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  let sceneName = '';
  for (let attempt = 0; attempt < 80; attempt++) {
    sceneName = await page.evaluate(async () => {
      try {
        const cc = await System.import('cc');
        return cc.director.getScene()?.name || '';
      } catch {
        return '';
      }
    });
    if (sceneName === 'NewMainScene') break;
    await page.waitForTimeout(250);
  }

  await page.waitForTimeout(700);
  const initialContentY = await page.evaluate(async () => {
    const cc = await System.import('cc');
    return cc.find('Canvas/GameList/View/Content')?.position.y ?? null;
  });
  await page.screenshot({ path: output });

  const canvas = page.locator('#GameCanvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('GameCanvas has no bounds');
  const x = bounds.x + bounds.width * 0.67;
  const fromY = bounds.y + bounds.height * 0.76;
  const toY = bounds.y + bounds.height * 0.38;
  const client = await context.newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y: fromY, radiusX: 3, radiusY: 3, force: 1 }],
  });
  for (let step = 1; step <= 10; step++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x,
        y: fromY + (toY - fromY) * step / 10,
        radiusX: 3,
        radiusY: 3,
        force: 1,
      }],
    });
    await page.waitForTimeout(20);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(350);

  const scrolledContentY = await page.evaluate(async () => {
    const cc = await System.import('cc');
    return cc.find('Canvas/GameList/View/Content')?.position.y ?? null;
  });
  const extensionIndex = output.lastIndexOf('.');
  const scrolledOutput = extensionIndex >= 0
    ? `${output.slice(0, extensionIndex)}-scrolled${output.slice(extensionIndex)}`
    : `${output}-scrolled.png`;
  await page.screenshot({ path: scrolledOutput });
  await browser.close();

  const touchScrollDelta = initialContentY === null || scrolledContentY === null
    ? null
    : scrolledContentY - initialContentY;
  console.log(JSON.stringify({
    sceneName,
    initialContentY,
    scrolledContentY,
    touchScrollDelta,
    output,
    scrolledOutput,
    errors,
  }, null, 2));
  if (sceneName !== 'NewMainScene') process.exitCode = 2;
  if (!(touchScrollDelta > 50)) process.exitCode = 3;
  if (errors.length) process.exitCode = 4;
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
