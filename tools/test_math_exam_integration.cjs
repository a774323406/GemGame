const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
let state = {mode:'acquisition',contentId:''};
const cc = {_decorator:{ccclass:()=>v=>v,property:()=>()=>{}},Component:class{},Button:class{static EventType={CLICK:'click'};},Node:class{},game:{},Game:{}};
const cache = {};
function load(file) {
  if(cache[file])return cache[file];
  const out={};cache[file]=out;
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/scripts/'+file+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true}}).outputText,{
    exports:out, console:{log(){},warn(){},error(){}},require(name){
      if(name==='cc')return cc;
      if(name.endsWith('FeedAcquisitionService'))return {FeedAcquisitionService:{getState:()=>state}};
      if(name.endsWith('FeedRevisitConfig'))return load('framework/Platform/FeedRevisitConfig');
      if(name.endsWith('GameSceneBundle'))return load('framework/GameSceneBundle');
      return {};
    }
  });return out;
}
const Loader=load('loadScene').loadScene;
const loader=new Loader();loader.warnUnknownFeedContentId=()=>{};
assert.equal(loader.resolveFeedEntry().sceneName,'ShootingGlassBottlesGame','empty unconfigured content ID must preserve fallback');
state.contentId='CONTENT15271990018';
assert.equal(loader.resolveFeedEntry().sceneName,'MathExamFeedGameScene','the actual acquisition ID must enter math exam using project configuration');
state.mode='revisit';
assert.equal(loader.resolveFeedEntry().sceneName,'ShootingGlassBottlesGame','existing revisit route must be retained');
const Main=load('newMainScene').newMainScene;
const main=new Main();let chosen;
main.enterGame=scene=>{chosen=scene;};main.openMathExam();
assert.equal(chosen,'MathExamFeedGameScene');
main.mathExamButton={interactable:true,node:{isValid:true}};main.setGameButtonsInteractable(false);
assert.equal(main.mathExamButton.interactable,false,'new entry locks along with other cards');
main.setGameButtonsInteractable(true);assert.equal(main.mathExamButton.interactable,true);
(async()=>{
  const {appendMathExamCard,buildMathExamScene}=await import('./math_exam_authoring.mjs');
  const lobby=JSON.parse(fs.readFileSync('assets/gamescene/NewMainScene.scene'));
  const before=JSON.stringify(lobby);appendMathExamCard(lobby);
  assert.equal(JSON.stringify(lobby),before,'re-running lobby generation must preserve editor adjustments');
  assert(buildMathExamScene().length>100);
  console.log('Math integration: empty-ID safety, configured route, revisit fallback, lobby entry/button lock and idempotent authoring passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
