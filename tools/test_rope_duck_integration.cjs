const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
const {buildRopeDuckScene,appendRopeDuckCard,SCENE_UUID}=await import('./rope_duck_authoring.mjs');
const scene=JSON.parse(fs.readFileSync('assets/gamescene/RopeDuckFeedGameScene.scene'));
assert.deepEqual(scene,buildRopeDuckScene(),'authoring matches scene');
assert.equal(JSON.parse(fs.readFileSync('assets/gamescene/RopeDuckFeedGameScene.scene.meta')).uuid,SCENE_UUID);
function refs(v){if(!v||typeof v!=='object')return;if(Number.isInteger(v.__id__))assert(scene[v.__id__]);else Object.values(v).forEach(refs);}refs(scene);
const ctrl=scene.find(v=>v.ducks&&v.terrain&&v.reviveButton);assert(ctrl);assert.equal(ctrl.ducks.length,2);
assert(ctrl.restartButton,'pause restart is serialized');const restart=scene[scene[ctrl.restartButton.__id__].node.__id__];assert.equal(restart._name,'RestartButton');assert.equal(restart._parent.__id__,ctrl.exitOverlay.__id__);
const hud=scene[ctrl.hud.__id__];const buttons=hud._children.map(r=>scene[r.__id__]).filter(n=>n._components.some(r=>scene[r.__id__].__type__==='cc.Button'));assert.equal(buttons.length,1);assert.equal(buttons[0]._name,'BackButton');
const audio=scene.filter(v=>v.__type__==='cc.AudioSource');assert.equal(audio.length,4);assert(audio.every(v=>!v._loop&&!v._playOnAwake));
const result=scene[ctrl.resultOverlay.__id__];assert(result._components.some(r=>scene[r.__id__].__type__==='cc.BlockInputEvents'));assert(scene.find(v=>v.gameplayHud)?.gameplayHud.length);
const lobby=JSON.parse(fs.readFileSync('assets/gamescene/NewMainScene.scene')),before=JSON.stringify(lobby);appendRopeDuckCard(lobby);assert.equal(JSON.stringify(lobby),before);assert(lobby.find(v=>v.gameList).ropeDuckButton);
const bytes=fs.readdirSync('assets/res/ropeDuckFeed').filter(n=>!n.endsWith('.meta')).reduce((sum,n)=>sum+fs.statSync('assets/res/ropeDuckFeed/'+n).size,0);assert(bytes<300*1024);console.log('PASS serialized scene, audio, only-back HUD, fullscreen revival and idempotent lobby; media bytes',bytes);
})().catch(e=>{console.error(e);process.exitCode=1});
