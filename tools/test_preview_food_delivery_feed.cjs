const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const tool = path.join(__dirname, 'preview_food_delivery_feed.cjs');
for (const args of [[], ['http://127.0.0.1:8123/']]) {
  const result = spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, 'missing required arguments must fail before launching a browser');
  assert.match(`${result.stdout}\n${result.stderr}`, /Usage:.*build-url.*output-directory/i);
}

console.log('Food delivery preview CLI contract passed');
