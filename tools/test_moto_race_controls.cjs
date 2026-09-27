const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
function load(file,require=()=>({})){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true}}).outputText,{exports,require,console,Math,Map,Set});return exports;}
const rules=load('assets/scripts/motoRaceRules.ts');let resolveAd,calls=0;
let fullscreen=false,scheduled=0,cancelled=0,completed=0,eligible;
const feed={removeListener(){},completeSession(){completed++;}};
const ads={cancelFeedEntryInterstitial(){cancelled++;},scheduleFeedEntryInterstitial(fn){scheduled++;eligible=fn;}};
const sdk={isFullscreenAdBusy:()=>fullscreen,isRewardedVideoBusy:()=>false,showRewardedVideo:()=>{calls++;return new Promise(r=>resolveAd=r);}};
const cleanup=[];const off=(event)=>cleanup.push(event);
const cc={Color:class{constructor(...values){this.values=values}},Button:{EventType:{CLICK:'click'}},Input:{EventType:{KEY_DOWN:'keydown',KEY_UP:'keyup'}},Game:{EVENT_HIDE:'hide',EVENT_SHOW:'show'},input:{off},game:{off},_decorator:{ccclass:()=>x=>x,property:()=>()=>{}},Component:class{},view:{off,getVisibleSize:()=>({width:750,height:1624})}};
const {motoRaceGameScene:Scene}=load('assets/scripts/motoRaceGameScene.ts',name=>name==='cc'?cc:name.endsWith('FeedAcquisitionService')?{FeedAcquisitionService:feed}:name.endsWith('ADController')?{adc:ads}:name.endsWith('motoRaceRules')?rules:name.endsWith('SdkUtils')?{SdkUtils:sdk}:{});
function scene(){const s=new Scene();s.node={isValid:true};s.countdown=0;s.engineSound={stop(){}};s.startSound=()=>{};s.refreshHud=()=>{};s.messageLabel={string:''};s.pause=()=>{s.race.paused=true;};return s;}
const touch=(id,x)=>({getID:()=>id,getUILocation:()=>({x,y:500})});
(async()=>{
 let s=scene();s.touchStart(touch(1,100));assert.equal(s.touchSteer,-1);s.touchMove(touch(1,600));assert.equal(s.touchSteer,1);
 s.touchStart(touch(2,50));assert.equal(s.touchSteer,-1);s.touchEnd(touch(2,50));assert.equal(s.touchSteer,1);s.touchEnd(touch(1,600));assert.equal(s.touchSteer,0);assert.equal(s.touchId,null);
 let pending=s.rewardBoost();assert(s.adInFlight);assert.equal(s.touchId,null);await s.rewardBoost();assert.equal(calls,1,'duplicate ad prevented');resolveAd(false);await pending;assert.equal(s.race.boostRemaining,0,'incomplete ad grants nothing');
 pending=s.rewardBoost();resolveAd(true);await pending;assert.equal(s.race.boostRemaining,600);assert(!s.adInFlight);
 s=scene();pending=s.rewardBoost();s.hidden=true;resolveAd(true);await pending;assert(s.hidden&&!s.race.paused,'reward return in background stays frozen without opening pause menu');assert.equal(s.race.boostRemaining,600);
 s=scene();pending=s.rewardBoost();s.disposed=true;resolveAd(true);await pending;assert.equal(s.race.boostRemaining,0,'late reward cannot affect disposed scene');
 for(const button of [null,{node:null},{node:{isValid:false,off(){throw Error('destroyed node accessed');}}},{node:{isValid:true,off}}]){
  s=scene();s.boostButton=button;let released=false,destroyed=false;
  s.releaseMusic=()=>released=true;s.art={destroy:()=>destroyed=true};cleanup.length=0;
  assert.doesNotThrow(()=>s.onDestroy(),'scene destruction tolerates already-destroyed child buttons');
  assert(s.disposed&&released&&destroyed,'cleanup must finish even when child button is gone');
  for(const event of ['canvas-resize','keydown','keyup','hide','show'])assert(cleanup.includes(event));
  if(button?.node?.isValid)assert(cleanup.includes('click'),'live button listener is detached');
 }
 s=scene();s.feedMode=true;
 s.scheduleFeedAd();assert.equal(scheduled,0,'preview must not schedule ads');
 s.touchStart(touch(1,100));assert.equal(s.touchSteer,0,'preview must not steer');
 s.feedChanged({active:true,entered:true,exited:false});assert.equal(scheduled,1);assert(eligible());
 s.feedChanged({active:true,entered:true,exited:false});assert.equal(scheduled,1,'duplicate entry does not reset ad timer');
 fullscreen=true;const elapsed=s.race.elapsed;s.update(1);assert.equal(s.race.elapsed,elapsed,'interstitial freezes race');fullscreen=false;
 s.feedChanged({active:true,entered:true,exited:true});assert(s.feedBlocked());assert(!eligible());assert(cancelled>0);
 s.feedChanged({active:true,entered:true,exited:false});assert.equal(scheduled,2,'reentry restores scheduling');
 s.onDestroy();assert.equal(completed,1);assert(!eligible());
 s=scene();delete s.pause;s.feedMode=true;s.overlay={active:false};s.countdownLabel={string:''};s.renderer={render(){}};
 s.restart();assert.equal(s.countdownLabel.string,'3','preview renders the initial 3 before its first update');
 s.hide();assert(!s.overlay.active&&!s.race.paused,'platform hide must not open manual pause');
 s.update(.1);assert.equal(s.countdown,3);
 s.show();s.update(.1);assert.equal(s.countdown,3,'feed preview holds at 3');
 s.feedChanged({active:true,entered:true,exited:false});s.update(.1);assert(s.countdown<3,'feed entry starts countdown');
 fullscreen=true;s.hide();s.show();const before=s.countdown;s.update(.1);assert.equal(s.countdown,before);fullscreen=false;
 s.update(.1);assert(s.countdown<before,'ad return resumes countdown without pause screen');
 s.showOverlay=()=>{s.overlay.active=true;};s.pause();s.hide();s.show();s.update(.1);
 assert(s.race.paused&&s.overlay.active,'explicit player pause survives background return');
 console.log('PASS half-screen multitouch, ad completion/cancellation, duplicate tap, background and stale reward');
})().catch(e=>{console.error(e);process.exitCode=1;});

for(const status of ['racing','finished','crashed']) {
  const s=scene();s.overlay={};s.resumeButton={node:{}};
  s.resultTitle={};s.resultDetail={};s.resumeLabel={};
  s.race.status=status;s.showOverlay();
  assert.equal(s.resultTitle.string,status==='racing'?'比赛暂停':status==='finished'?'挑战成功':'挑战失败');
  assert.equal(s.resumeButton.node.active,status==='racing','continue only appears while paused');
  assert.deepEqual(s.resultTitle.color.values,status==='finished'?[255,232,153,255]:[255,255,255,255]);
  assert.match(s.resultDetail.string,/用时/);
  if(status==='crashed')assert.match(s.resultDetail.string,/护甲耗尽/);
}
