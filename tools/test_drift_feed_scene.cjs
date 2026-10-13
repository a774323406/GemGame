const assert=require('node:assert/strict'),fs=require('node:fs');
const file='assets/gamescene/DriftFeedGameScene.scene';assert(fs.existsSync(file),'drift scene must be authored');const o=JSON.parse(fs.readFileSync(file));
const node=n=>o.find(x=>x.__type__==='cc.Node'&&x._name===n);const comps=n=>n._components.map(r=>o[r.__id__]);
for(const n of ['World','HUD','Guide','ResultOverlay','ReviveButton','RetryButton','HomeButton'])assert(node(n),n);
assert(comps(node('ResultOverlay')).some(x=>x.__type__==='cc.BlockInputEvents'));
assert.equal(comps(node('ResultDim')).find(x=>x.__type__==='cc.Sprite')._color.a,145);
for(const n of ['ResultPanel'])assert(!comps(node(n)).some(x=>x.__type__==='cc.Sprite'&&x._enabled));
for(const n of ['ReviveButton','RetryButton','HomeButton']){const w=comps(node(n)).find(x=>x.__type__==='cc.Widget');assert(w,n+' anchored');assert(w._verticalCenter*1334-69>=-667+80);}
function walk(v){if(!v||typeof v!=='object')return;if(Number.isInteger(v.__id__))assert(o[v.__id__]);for(const v2 of Object.values(v))walk(v2);}walk(o);
console.log('PASS drift scene: references, authored UI, full screen result, bottom margins');
