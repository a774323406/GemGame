const assert = require('node:assert/strict');
const fs = require('node:fs');
const scene = 'assets/gamescene/MathExamFeedGameScene.scene';
assert(fs.existsSync(scene), 'a playable math exam scene must be authored');
const objects = JSON.parse(fs.readFileSync(scene));
const controller = objects.find(o => o.inkArea && o.questionLabels && o.resultOverlay);
assert(controller, 'scene must bind the math controller');
for (const key of ['layoutRoot', 'paper', 'questionRoot', 'inkArea', 'ink', 'clock', 'scoreLabel', 'timeLabel', 'hintLabel', 'inkHint', 'feedbackLabel', 'resultOverlay', 'resultTitle', 'resultScore', 'resultDetail', 'bestLabel', 'correctionBottle', 'eraserTip', 'backButton', 'replayButton', 'homeButton', 'addTimeButton', 'reviveButton']) {
  assert(objects[controller[key]?.__id__], `${key} must reference a serialized object`);
}
assert.equal(controller.questionLabels.length, 4);
const broken = [];
function walk(value) {
  if (!value || typeof value !== 'object') return;
  if (Number.isInteger(value.__id__) && !objects[value.__id__]) broken.push(value.__id__);
  Object.values(value).forEach(walk);
}
objects.forEach(walk);
assert.equal(broken.length, 0);
assert.equal(objects[controller.resultOverlay.__id__]._active, false);
assert.equal(objects[controller.ink.__id__].__type__, 'cc.Graphics');
assert.equal(objects[controller.clock.__id__].__type__, 'cc.Graphics');
assert.equal(objects[controller.eraserTip.__id__]._parent.__id__, controller.correctionBottle.__id__, 'nozzle must move with the draggable bottle');
assert(objects[controller.correctionBottle.__id__]._components.some(ref => objects[ref.__id__].__type__ === 'cc.Sprite'), 'dragged bottle must be an independent visible sprite');
for (const label of controller.questionLabels.map(ref => objects[ref.__id__])) {
  assert.equal(label._isSystemFontUsed, false, 'equations use the original video bitmap glyphs');
  assert.equal(label._font?.__expectedType__, 'cc.BitmapFont');
}
assert(objects.some(o => o.__type__ === 'cc.BlockInputEvents' && o.node.__id__ === controller.resultOverlay.__id__), 'result must block handwriting');
const lobby = JSON.parse(fs.readFileSync('assets/gamescene/NewMainScene.scene'));
const main = lobby.find(o => o.mathExamButton);
assert(main && lobby[main.mathExamButton.__id__].__type__ === 'cc.Button');
assert.equal(lobby.filter(o => o.__type__ === 'cc.Node' && o._name === 'MathExamCard').length, 1);
console.log('Math exam scene: bindings, references, ink, result input shield and lobby card passed');
