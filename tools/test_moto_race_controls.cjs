const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
function load(file,require=()=>({})){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true}}).outputText,{exports,require,console,Math,Map,Set});return exports;}
const rules=load('assets/scripts/motoRaceRules.ts');let resolveAd,calls=0;
const sdk={isFullscreenAdBusy:()=>false,isRewardedVideoBusy:()=>false,showRewardedVideo:()=>{calls++;return new Promise(r=>resolveAd=r);}};
const cleanup=[];const off=(event)=>cleanup.push(event);
const cc={Button:{EventType:{CLICK:'click'}},Input:{EventType:{KEY_DOWN:'keydown',KEY_UP:'keyup'}},Game:{EVENT_HIDE:'hide',EVENT_SHOW:'show'},input:{off},game:{off},_decorator:{ccclass:()=>x=>x,property:()=>()=>{}},Component:class{},view:{off,getVisibleSize:()=>({width:750,height:1624})}};
const {motoRaceGameScene:Scene}=load('assets/scripts/motoRaceGameScene.ts',name=>name==='cc'?cc:name.endsWith('motoRaceRules')?rules:name.endsWith('SdkUtils')?{SdkUtils:sdk}:{});
function scene(){const s=new Scene();s.node={isValid:true};s.countdown=0;s.engineSound={stop(){}};s.startSound=()=>{};s.refreshHud=()=>{};s.messageLabel={string:''};s.pause=()=>{s.race.paused=true;};return s;}
const touch=(id,x)=>({getID:()=>id,getUILocation:()=>({x,y:500})});
(async()=>{
 let s=scene();s.touchStart(touch(1,100));assert.equal(s.touchSteer,-1);s.touchMove(touch(1,600));assert.equal(s.touchSteer,1);
 s.touchStart(touch(2,50));assert.equal(s.touchSteer,-1);s.touchEnd(touch(2,50));assert.equal(s.touchSteer,1);s.touchEnd(touch(1,600));assert.equal(s.touchSteer,0);assert.equal(s.touchId,null);
 let pending=s.rewardBoost();assert(s.adInFlight);assert.equal(s.touchId,null);await s.rewardBoost();assert.equal(calls,1,'duplicate ad prevented');resolveAd(false);await pending;assert.equal(s.race.boostRemaining,0,'incomplete ad grants nothing');
 pending=s.rewardBoost();resolveAd(true);await pending;assert.equal(s.race.boostRemaining,600);assert(!s.adInFlight);
 s=scene();pending=s.rewardBoost();s.hidden=true;resolveAd(true);await pending;assert(s.race.paused,'reward return in background remains paused');assert.equal(s.race.boostRemaining,600);
 s=scene();pending=s.rewardBoost();s.disposed=true;resolveAd(true);await pending;assert.equal(s.race.boostRemaining,0,'late reward cannot affect disposed scene');
 for(const button of [null,{node:null},{node:{isValid:false,off(){throw Error('destroyed node accessed');}}},{node:{isValid:true,off}}]){
  s=scene();s.boostButton=button;let released=false,destroyed=false;
  s.releaseMusic=()=>released=true;s.art={destroy:()=>destroyed=true};cleanup.length=0;
  assert.doesNotThrow(()=>s.onDestroy(),'scene destruction tolerates already-destroyed child buttons');
  assert(s.disposed&&released&&destroyed,'cleanup must finish even when child button is gone');
  for(const event of ['canvas-resize','keydown','keyup','hide','show'])assert(cleanup.includes(event));
  if(button?.node?.isValid)assert(cleanup.includes('click'),'live button listener is detached');
 }
 console.log('PASS half-screen multitouch, ad completion/cancellation, duplicate tap, background and stale reward');
})().catch(e=>{console.error(e);process.exitCode=1;});
