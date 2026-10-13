const fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
const {buildClayScene,appendClayPigeonCard,uuid}=await import('./clay_pigeon_authoring.mjs');const o=buildClayScene();
const node=name=>o.findIndex(v=>v.__type__==='cc.Node'&&v._name===name);const comp=(id,t)=>o[id]._components.map(r=>o[r.__id__]).find(c=>c.__type__===t);
const walk=v=>{if(!v||typeof v!=='object')return;if(Number.isInteger(v.__id__))assert.ok(v.__id__>=0&&v.__id__<o.length);else Object.values(v).forEach(walk)};o.forEach(walk);
const c=o.find(v=>v.aimSurface);for(const k of ['layoutRoot','aimSurface','gun','drawing','clock','roundLabel','comboLabel','tip','statusLabel','ammoLabel','spawnedLabel','hitsLabel','accuracyLabel','pauseButton','resultOverlay','resultTitle','resultDetail','resumeButton','replayButton','homeButton','shotAudio','hitAudio'])assert.ok(o[c[k]?.__id__],k);
const overlay=node('ResultOverlay');assert.equal(o[overlay]._parent.__id__,node('Canvas'));assert.ok(comp(overlay,'cc.BlockInputEvents'));assert.equal(comp(overlay,'cc.Widget')._alignFlags,45);assert.equal(comp(node('ResultDim'),'cc.Sprite')._color.a,145);assert.ok(!comp(node('ResultPanel'),'cc.Sprite'));
for(const h of [1334,1624]){for(const name of ['ResumeButton','ReplayButton','HomeButton']){const id=node(name),w=comp(id,'cc.Widget'),size=comp(id,'cc.UITransform')._contentSize;assert.ok(h/2+w._verticalCenter*h-size.height/2>=80,name+' bottom margin '+h);}assert.equal(comp(node('BottomHUD'),'cc.Widget')._bottom,80);assert.equal(comp(node('TopHUD'),'cc.Widget')._top,65);}
assert.equal(comp(node('Backdrop'),'cc.Widget')._alignFlags,45);
const lobby=JSON.parse(fs.readFileSync('assets/gamescene/NewMainScene.scene'));appendClayPigeonCard(lobby);const original=JSON.stringify(lobby);appendClayPigeonCard(lobby);assert.equal(JSON.stringify(lobby),original,'idempotent lobby append');const ctrl=lobby.find(v=>v.clayPigeonButton);assert.ok(ctrl);assert.equal(lobby[ctrl.clayPigeonButton.__id__].__type__,'cc.Button');
const load=fs.readFileSync('assets/scripts/loadScene.ts','utf8');assert.ok(load.includes('FEED_CLAY_PIGEON_CONTENT_ID && contentId === FEED_CLAY_PIGEON_CONTENT_ID'));
assert.ok(fs.readFileSync('assets/scripts/framework/GameSceneBundle.ts','utf8').includes(uuid('ClayPigeonGameScene')));console.log('PASS scene bindings, shared full-screen result, both safe areas, stable lobby append and guarded routing');
})();
