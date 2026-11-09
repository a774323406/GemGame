const fs=require('node:fs'),assert=require('node:assert/strict');
const bundle=fs.readFileSync('assets/scripts/framework/GameSceneBundle.ts','utf8');assert(bundle.includes('DriftFeedGame = "DriftFeedGameScene"'),'scene registered');
const o=JSON.parse(fs.readFileSync('assets/gamescene/NewMainScene.scene'));const ctrl=o.find(x=>x.gameList&&x.puzzleButton);assert(ctrl.driftButton,'serialized lobby entry');assert(o[ctrl.driftButton.__id__].node,'live button reference');
const load=fs.readFileSync('assets/scripts/loadScene.ts','utf8');assert(load.includes('FEED_DRIFT_CONTENT_ID && contentId === FEED_DRIFT_CONTENT_ID'),'empty content id guarded');
const config=fs.readFileSync('assets/scripts/framework/Platform/FeedRevisitConfig.ts','utf8');assert(/FEED_DRIFT_CONTENT_ID: string = "CONTENT15927306754"/.test(config),'user-provided production ID');
const card=o[o[ctrl.driftButton.__id__].node.__id__];
const children=card._children.map(r=>o[r.__id__]);
for(const name of ['CardShadow','CardOutline','CardSurface','ArtworkMask','TitlePlaque'])assert(children.some(n=>n._name===name),'shared lobby card '+name);
const plaque=children.find(n=>n._name==='TitlePlaque'),title=plaque._children.map(r=>o[r.__id__]).find(n=>n._name==='GameName');
assert.equal(title._components.map(r=>o[r.__id__]).find(c=>c.__type__==='cc.Label')._string,'漂移');
console.log('PASS drift integration: registered scene, shared lobby card, user-provided content ID');
// Execute the production route with local stand-ins; no SDK/network calls.
const vm=require('node:vm'),{load:loadModule}=require('./drift_feed_test_helpers.cjs');
const ts=require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const routeExports={},feedState={mode:'acquisition',contentId:'CONTENT15927306754'};
vm.runInNewContext(ts.transpileModule(load,{compilerOptions:{module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText,{
 exports:routeExports,require:name=>{
  if(name==='cc')return {_decorator:{ccclass:()=>x=>x,property:()=>()=>{}},Component:class{}};
  if(name.endsWith('FeedRevisitConfig'))return loadModule('assets/scripts/framework/Platform/FeedRevisitConfig.ts');
  if(name.endsWith('FeedAcquisitionService'))return {FeedAcquisitionService:{getState:()=>feedState}};
  if(name.endsWith('GameSceneBundle'))return {GameSceneName:{DriftFeedGame:'DriftFeedGameScene',Main:'NewMainScene'}};
  return {};
 }
});
assert.equal(routeExports.loadScene.prototype.resolveFeedEntry().sceneName,'DriftFeedGameScene');
feedState.mode='revisit';assert.equal(routeExports.loadScene.prototype.resolveFeedEntry().sceneName,'NewMainScene');
console.log('PASS production content-ID route executes correctly');
