// Exercise the real built loader, scene and FeedAcquisitionService from a fresh page.
// Only the native Feed API boundary is substituted; this is not phone-host validation.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('/Users/skyhand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url = process.argv[2] || 'http://127.0.0.1:8768/';
const feedConfig = fs.readFileSync('assets/scripts/framework/Platform/FeedRevisitConfig.ts', 'utf8');
function contentId(name) {
  const match = feedConfig.match(new RegExp(`export const ${name}(?:\\s*:\\s*string)?\\s*=\\s*"([^"]*)"`));
  assert(match && match[1], `Configure this branch's ${name} before feed preview`);
  return match[1];
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const out = '/tmp/rope-duck-feed-cold-start'; fs.mkdirSync(out, { recursive: true });
  try {
    for (const [id, scene, activation] of [
      [contentId('FEED_ROPE_DUCK_CONTENT_ID'), 'RopeDuckFeedGameScene', 'touch'],
      [contentId('FEED_ROPE_DUCK_CONTENT_ID'), 'RopeDuckFeedGameScene', 'event'],
      [contentId('FEED_ROPE_DUCK_CONTENT_ID'), 'RopeDuckFeedGameScene', 'early'],
      [contentId('FEED_ROPE_DUCK_CONTENT_ID'), 'RopeDuckFeedGameScene', 'exit-during-load'],
      [contentId('FEED_ROPE_DUCK_CONTENT_ID'), 'RopeDuckFeedGameScene', 'exit-touch'],
      [contentId('FEED_ROPE_DUCK_CONTENT_ID'), 'RopeDuckFeedGameScene', 'return-touch'],
      [contentId('FEED_DUCK_GRAB_CONTENT_ID'), 'DuckGrabFeedGameScene', 'event'],
      [contentId('FEED_BRICK_CHOP_CONTENT_ID'), 'BrickChopFeedGameScene', 'event'],
    ]) {
      if (process.env.FEED_CASE && process.env.FEED_CASE !== activation) continue;
      const page = await browser.newPage({ viewport: { width: 750, height: 1334 }, hasTouch: true });
      const logs = [], errors = [];
      page.on('console', m => logs.push(m.type() + ': ' + m.text()));
      page.on('pageerror', e => errors.push(e.stack));
      await page.addInitScript(({ id, activation }) => {
        window.feedReports = [];
        window.__feedApi = {
          getLaunchOptionsSync: () => ({ scene: '103041', query: { feed_game_scene: 0, feed_game_channel: 2, feed_game_content_id: id } }),
          onFeedStatusChange: fn => { window.feedStatus = fn; if (activation === 'early') fn({ type: 'feedEnter' }); if (activation.startsWith('exit-')) fn({ type: 'feedExit' }); },
          reportScene: options => { window.feedReports.push(options.sceneId); options.success?.(); },
        };
      }, { id, activation });
      await page.route('**/assets/start-scene/index.js', async route => {
        const response = await route.fetch(), source = await response.text();
        const marker = 'FeedAcquisitionService.getDouyinApi = function getDouyinApi() {';
        assert(source.includes(marker), 'native API boundary must exist in the debug build');
        await route.fulfill({ response, body: source.replace(marker, marker + ' if(window.__feedApi) return window.__feedApi;') });
      });
      try {
        await page.goto(url);
        await page.waitForFunction(scene => window.cc && cc.director.getScene()?.name === scene, scene, { timeout: 60000 });
        await page.waitForFunction(() => window.feedReports.includes(7001), null, { timeout: 5000 });
        await page.evaluate(scene => { window.controller = cc.director.getScene().getChildByName('Canvas').getComponent(scene[0].toLowerCase() + scene.slice(1)); }, scene);
        assert.deepEqual(await page.evaluate(() => feedReports), [7001]);
        if (scene === 'RopeDuckFeedGameScene') {
          assert.equal(await page.evaluate(() => controller.entered), activation === 'early');
          const clock = await page.evaluate(() => controller.clock);
          await page.waitForFunction(clock => controller.clock > clock + .1, clock);
          await page.waitForFunction(() => cc.director.getScene().getChildByName('AudioManager')?.getComponent('cc.AudioSource')?.playing);
          if (activation === 'event' || activation === 'exit-during-load') await page.evaluate(() => feedStatus({ type: 'feedEnter' }));
          if (activation === 'return-touch') await page.evaluate(() => feedStatus({ type: 'feedExit' }));
          const touch = await page.context().newCDPSession(page);
          await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 390, y: 560, id: 1 }] });
          assert(await page.evaluate(() => controller.entered && controller.round.charging), 'first real touch activates and charges');
          await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          assert(await page.evaluate(() => !controller.round.ducks[0].grounded), 'release launches duck');
          await page.evaluate(() => feedStatus({ type: 'feedExit' }));
          assert(await page.evaluate(() => controller.blocked()));
          await page.evaluate(() => feedStatus({ type: 'feedEnter' }));
          assert(await page.evaluate(() => !controller.blocked()));
        }
        await page.screenshot({ path: `${out}/${scene}-${activation}.png` });
        assert.deepEqual(errors, []);
        assert(!logs.some(line => line.includes('场景尚未达到可渲染状态')), 'readiness must not abort');
        console.log(`PASS ${scene}: cold-start / ready 7001 / ${activation}`);
      } finally {
        fs.writeFileSync(`${out}/${scene}-${activation}.log`, [...logs, ...errors].join('\n'));
        await page.close();
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
