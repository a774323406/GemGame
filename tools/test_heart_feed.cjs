// Controller/storage checks; no Cocos renderer or Douyin host required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const storage = new Map();
const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
class Stub { clone() { return new Stub(); } }
Stub.WHITE = new Stub(); Stub.ONE = new Stub();
const cc = new Proxy({ _decorator: { ccclass: () => c => c, property: (...args) => args.length >= 2 ? undefined : () => {} }, Component: Stub, sys: {localStorage} }, {get: (o,k) => o[k] ?? Stub});
let state = {active:true, mode:'acquisition', contentId:'xxx', entered:false};
const feed = {init(){}, isActive:()=>state.active, isAcquisition:()=>state.mode==='acquisition', isRevisit:()=>state.mode==='revisit', getState:()=>state, getContentId:()=>state.contentId, addListener(){}};
const cache = {};
function load(file) {
 if(cache[file]) return cache[file];
 const exports = {}; cache[file] = exports;
 const code = ts.transpileModule(fs.readFileSync('assets/scripts/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true}}).outputText;
 vm.runInNewContext(code,{exports,console,require(name){
  if(name==='cc') return cc;
  if(name.endsWith('/FeedAcquisitionService')) return {FeedAcquisitionService:feed};
  for(const path of ['ToolInventory.ts','data/TutorialProgress.ts','framework/Platform/FeedRevisitConfig.ts','framework/GameSceneBundle.ts']) if(name.endsWith('/'+path.split('/').pop().replace('.ts',''))) return load(path);
  return {};
 }});
 return exports;
}
const {ToolInventory: inventory} = load('ToolInventory.ts');
const {TutorialProgress: tutorial} = load('data/TutorialProgress.ts');
const {gameScene: Scene} = load('gameScene.ts');
const {loadScene: Loader} = load('loadScene.ts');
async function entry() {
 const scene = new Scene();
 scene.prepareScene = scene.loadAssets = async()=>{};
 scene.refreshToolBadges=()=>{};
 scene.loadLevel=async level=>{scene.levelIndex=level;scene.ensureUnlocksForCurrentLevel();return false;};
 await scene.start();return scene;
}
(async()=>{
 assert.equal(new Loader().resolveFeedEntry().sceneName,'GameScene','xxx routes to gem game');
 const scene = await entry();
 assert.equal(scene.levelIndex,8);
 assert.equal(storage.get('gem_sort_level'),'8');
 assert(tutorial.isCoreGuideDone() && tutorial.isTrayExpandGuideDone() && tutorial.isTrayExpandUnlocked());
 for(const tool of ['magic','brush','magnet']) {
  assert(inventory.isUnlocked(tool) && inventory.isGuideDone(tool));
  assert.equal(inventory.getCount(tool),0);
  assert.equal(inventory.grantUnlockReward(tool),false,'no deferred free rewards');
 }
 assert.equal(scene.hasPendingTutorialForCurrentLevel(),false);
 scene.feedMode=false;scene.feedAcquisition=false;scene.heartFeedMode=false;scene.levelIndex=9;scene.ensureUnlocksForCurrentLevel();
 assert.equal(scene.hasPendingTutorialForCurrentLevel(),false);
 assert.deepEqual(JSON.parse(JSON.stringify(inventory.getAll())),{magic:0,brush:0,magnet:0});
 const win = await entry();
 win.levelData={};win.blocks=[{location:'board',collapsed:true}];
 win.clearTutorialPresentation=win.resetCountdownWarning=win.openPassPanel=()=>{};
 win.checkWin();assert.equal(storage.get('gem_sort_level'),'9','win persists level 9 before navigating');
 inventory.add('magic',2);storage.set('gem_sort_level','20');
 const veteran=await entry();assert.equal(storage.get('gem_sort_level'),'20');assert.equal(inventory.getCount('magic'),2);
 veteran.levelData={};veteran.blocks=[{location:'board',collapsed:true}];
 veteran.clearTutorialPresentation=veteran.resetCountdownWarning=veteran.openPassPanel=()=>{};
 veteran.checkWin();assert.equal(storage.get('gem_sort_level'),'20');
 storage.clear();state={active:false,mode:'none',contentId:''};
 const normal=await entry();assert.equal(normal.levelIndex,1);assert(!tutorial.isCoreGuideDone());assert(!inventory.isUnlocked('magic'));
 state={active:true,mode:'acquisition',contentId:'unknown'};assert.equal(new Loader().resolveFeedEntry().sceneName,'ShootingGlassBottlesGame');
 console.log('heart feed: routing, level 8, skipped tutorials, zero gifts, later levels, repeat entry, existing inventory/progress and normal entry passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
