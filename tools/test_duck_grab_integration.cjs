const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const scene=JSON.parse(fs.readFileSync('assets/gamescene/DuckGrabFeedGameScene.scene'));
const metas=new Set();function walk(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,f.name);if(f.isDirectory())walk(p);else if(p.endsWith('.meta')){const m=JSON.parse(fs.readFileSync(p));metas.add(m.uuid);}}}walk('assets');
function refs(v){if(!v||typeof v!=='object')return;if(Number.isInteger(v.__id__))assert(scene[v.__id__],'dangling scene reference');if(v.__uuid__)assert(metas.has(v.__uuid__.split('@')[0]),'missing asset '+v.__uuid__);for(const x of Object.values(v))if(typeof x==='object')refs(x);}refs(scene);
const source=fs.readFileSync('assets/scripts/duckGrabFeedGameScene.ts','utf8');assert(source.includes('adc.onEnterGame(this.node)'));assert(!source.includes('isFullscreenAdBusy()'),'interstitial must not block simulation');
const images=fs.readdirSync('assets/res/duckGrabFeed').filter(n=>!n.endsWith('.meta'));
const imageBytes=images.reduce((n,f)=>n+fs.statSync('assets/res/duckGrabFeed/'+f).size,0);
// Exclusive penguin art: 158,060 bytes. Actual deleted scenes/scripts excluded from this stricter cap.
assert(imageBytes<=158060+200*1024,'new artwork exceeds released penguin budget plus 200 KiB');
for(const f of ['assets/res/penguinStackFeed','assets/gamescene/PenguinStackFeedGameScene.scene','assets/scripts/penguinStackFeedGameScene.ts'])assert(!fs.existsSync(f),f+' must retire');
assert.equal(scene.filter(o=>o.__type__==='cc.Node'&&o._name==='SlowdownButton').length,1);
for(const n of ['SkipButton','HintButton','RestartButton'])assert(!scene.some(o=>o.__type__==='cc.Node'&&o._name===n));
console.log('PASS duck scene references, ad lifecycle, retired penguin, single slowdown and artwork budget:',imageBytes);
// Exercise the real platform renderability gate using the serialized node sizes/assets.
const vm=require('node:vm'),ts=require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
class UITransform{}class Sprite{}
const service={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/scripts/framework/Platform/FeedAcquisitionService.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:service,require:n=>n==='cc'?{UITransform,Sprite}: {EnvTool:{}},console});
const wrap=id=>({isValid:true,activeInHierarchy:true,name:scene[id]._name,getChildByName:n=>wrap(scene[id]._children.find(r=>scene[r.__id__]._name===n).__id__),getComponent:type=>{const c=scene[id]._components.map(r=>scene[r.__id__]).find(x=>x.__type__===(type===UITransform?'cc.UITransform':'cc.Sprite'));if(!c)return null;return type===UITransform?{width:c._contentSize.width,height:c._contentSize.height}:{enabled:c._enabled,spriteFrame:{isValid:metas.has(c._spriteFrame.__uuid__.split('@')[0])}};}});
const ctrl=scene.find(o=>o.surface&&o.duckPivot&&o.hand),runtime=Object.fromEntries(['surface','duckPivot','hand'].map(k=>[k,wrap(ctrl[k].__id__)]));
const list=source.match(/requiredVisibleNodes:\s*(\[[^\]]+\])/)[1];const required=Function('return '+list).call(runtime);
service.FeedAcquisitionService.active=true;
assert(service.FeedAcquisitionService.isFeedSceneRenderable({owner:{isValid:true,activeInHierarchy:true},requiredVisibleNodes:required}),'actual scene must pass real feed readiness gate');
assert(!service.FeedAcquisitionService.isFeedSceneRenderable({owner:{isValid:true,activeInHierarchy:true},requiredVisibleNodes:[runtime.duckPivot]}),'1x1 pivot regression is detected');
console.log('PASS real feed scene-ready gate with serialized art nodes');
