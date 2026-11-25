// Update serialized layout only; this does not invoke the Cocos project builder.
import fs from 'node:fs';
import { fitFeedResultOverlay } from './feed_result_layout.mjs';
import { ensureJugglePauseMenu } from './juggle_ball_scene_authoring.mjs';

const path = 'assets/gamescene/JuggleBallGameScene.scene';
const objects = JSON.parse(fs.readFileSync(path, 'utf8'));
fitFeedResultOverlay(objects, 'JuggleBallGameScene');
ensureJugglePauseMenu(objects);
fs.writeFileSync(path, JSON.stringify(objects, null, 2) + '\n');
console.log('Updated JuggleBallGameScene background, result and pause layout.');
