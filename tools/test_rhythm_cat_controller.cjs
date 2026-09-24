const assert=require('node:assert/strict');const {loadTs}=require('./rhythm_cat_test_helpers.cjs');
class Node {static EventType={TOUCH_START:'start',TOUCH_MOVE:'move',TOUCH_END:'end',TOUCH_CANCEL:'cancel'};constructor(){this.isValid=true;this.active=true;this.position={x:0,y:0,z:0};}on(){}off(){}setScale(...v){this.scale=v}setPosition(x,y,z){this.position={x,y,z}}getComponent(){return{convertToNodeSpaceAR:p=>p,setContentSize(){}}}}
class Component{constructor(){this.node=new Node}}class Vec3{constructor(x,y,z){Object.assign(this,{x,y,z})}}
const cc={_decorator:{ccclass:()=>v=>v,property:(...args)=>args.length>=2?undefined:()=>{}},Component,Node,Vec3,Button:class{static EventType={CLICK:'click'}},AudioSource:class{},Sprite:class{},SpriteFrame:class{},Label:class{},UITransform:class{},EventTouch:class{},ResolutionPolicy:{FIXED_WIDTH:1},view:{setDesignResolutionSize(){},getVisibleSize:()=>({width:750,height:1334}),on(){},off(){}},game:{on(){},off(){}},Game:{EVENT_HIDE:'hide',EVENT_SHOW:'show'},director:{on(){},off(){}}};
let state={active:true,entered:false,exited:false},listener,busy=false,interstitialBusy=false,fail=false,completed=0,released=0,scheduled=0,rewardCalls=0,rewardRequest=()=>Promise.resolve(true);
const chart=loadTs('assets/scripts/rhythmCatChart.ts');
const feed={getState:()=>state,addListener(fn){listener=fn;fn(state)},removeListener(){},reportSceneReadyAfterStableRender:async()=>{},activateFromFirstTouch(){state={...state,entered:true,exited:false};listener(state)},completeSession(){completed++}};
const imports={cc,...Object.fromEntries(['Rules','Input','Timeline'].map(s=>['./rhythmCat'+s,loadTs('assets/scripts/rhythmCat'+s+'.ts')])), './rhythmCatChart':chart,
 './framework/AudioManager':{default:{acquireSceneMusic(){return()=>released++},playDefaultBgm(){}}},'./framework/gameStorage':{default:{getMusic:()=>0}},
 './framework/GameSceneBundle':{GameSceneName:{Main:'NewMainScene'},GameSceneBundle:{isLoadingScene:false,loadScene:async()=>{if(fail)throw Error('offline')}}},
 './framework/Platform/FeedAcquisitionService':{FeedAcquisitionService:feed},'./framework/Platform/ADController':{adc:{cancelFeedEntryInterstitial(){},scheduleFeedEntryInterstitial(){scheduled++}}},'./framework/Platform/sdk/SdkUtils':{SdkUtils:{isFullscreenAdBusy:()=>busy||interstitialBusy,isRewardedVideoBusy:()=>busy,showRewardedVideo(){rewardCalls++;return rewardRequest()},EVENT_AD_PAUSE_CHANGED:'ad',EVENT_INTERSTITIAL_ENDED:'close'}}};
const {rhythmCatFeedGameScene:C}=loadTs('assets/scripts/rhythmCatFeedGameScene.ts',imports);const label=()=>({node:new Node,string:''});
function fixture(){const c=new C;for(const key of ['layoutRoot','background','touchSurface','resultOverlay','slowdownBadge'])c[key]=new Node;for(const key of ['scoreLabel','hintLabel','resultTitle','resultScore','slowdownTitle','slowdownDetail'])c[key]=label();for(const key of ['backButton','homeButton','replayButton','slowdownButton'])c[key]={node:new Node};c.slowTrack={name:'track-slow'};c.cats=[label(),label()];c.hearts=[label(),label(),label()];c.feedback=[label(),label()];c.foodPool=Array.from({length:96},label);c.catFrames=[0,1,2,3];c.foodFrames=Array.from({length:7},()=>({originalSize:{width:38,height:74}}));
c.cats[0].node.setPosition(-228,-156,0);c.cats[1].node.setPosition(111.8,-156,0);
c.mouthPoints=[new Node,new Node];c.mouthPoints[0].setPosition(12,3,0);c.mouthPoints[1].setPosition(-11,3,0);
c.movementBounds=[-245,-43,43,245].map(x=>{const n=new Node;n.setPosition(x,-153,0);return n});c.crumbPool=Array.from({length:24},label);c.crumbFrames=[0,1];c.heartFrames=[0,1];c.track={clip:{},currentTime:0,playing:false,play(){this.playing=true},pause(){this.playing=false},stop(){this.playing=false;this.currentTime=0}};return c;}
const touch=(id,x)=>({getID:()=>id,getUILocation:()=>({x,y:0})});
// Serialized tuning reaches the round/input, and late food remains visible until caught.
const tuned=fixture();tuned.catchRadius=51;tuned.blackCatCatchBonus=7;tuned.lateCatchGrace=.08;tuned.dragSensitivity=1.12;tuned.onLoad();
assert.equal(tuned.fingers.sensitivity,1.12);assert.equal(tuned.poses()[0].radius,58/288);assert.equal(tuned.poses()[1].radius,51/288);
const first=chart.RHYTHM_CAT_CHART[0],away=[{x:.9,radius:58/288},{x:.5,radius:51/288}];
const mouthY=tuned.catBaselines[0].y+tuned.mouthPoints[0].position.y;
tuned.round.start();tuned.round.advance(first.hitTime+.05,away,away);tuned.render();
assert.equal(tuned.round.lives,3);assert.equal(tuned.round.isResolved(first.id),false);
assert(tuned.foodPool.some(s=>s.node.active&&Math.abs(s.node.position.y-(mouthY-.05*tuned.fallSpeed))<1e-6),'pending food remains below the mouth during grace');
tuned.round.advance(first.hitTime+.07,away,[{x:first.x,radius:58/288},away[1]]);tuned.render();
assert.equal(tuned.round.score,1);assert(tuned.foodPool.every(s=>!s.node.active||s.node.position.y>mouthY),'caught food disappears');
tuned.resetRound(false);tuned.round.start();tuned.round.advance(first.hitTime+.081,away,away);tuned.render();
assert.equal(tuned.round.lives,2,'serialized deadline applies');assert(tuned.foodPool.every(s=>!s.node.active||s.node.position.y>mouthY),'expired food disappears');
tuned.onDestroy();released=0;completed=0;
async function verifySlowdown(){
  state={active:false,entered:true,exited:false};busy=false;
  const c=fixture();const normal=c.track.clip;c.onLoad();c.beginRound();c.update(.4);
  assert.equal(c.timeline.rate,.85);assert(Math.abs(c.round.time-.34)<1e-9,'normal gameplay runs 15% slower');assert(c.slowdownButton.interactable);assert(c.slowdownBadge.active);
  const before=c.round.time;let resolveReward;rewardCalls=0;rewardRequest=()=>new Promise(resolve=>resolveReward=resolve);
  const pending=c.onSlowdown();assert.equal(rewardCalls,1);assert(c.timeline.paused);assert(!c.track.playing);assert(!c.slowdownButton.interactable);
  c.update(10);assert.equal(c.round.time,before);assert.equal(c.round.lives,3,'ad time cannot miss food');
  await c.onSlowdown();assert.equal(rewardCalls,1,'double click requests only one ad');c.onReplay();await c.returnHome();assert.equal(c.round.time,before);assert(!c.leaving);
  resolveReward(true);await pending;
  assert.equal(c.timeline.rate,.7);assert.equal(c.round.time,before);assert.equal(c.track.clip,c.slowTrack);assert(Math.abs(c.track.currentTime-before/.7)<1e-9,'slow audio resumes at the same musical point');
  assert.equal(c.slowdownTitle.string,'慢速');assert.match(c.slowdownDetail.string,/已减速30%/);assert(!c.slowdownBadge.active);assert(!c.slowdownButton.interactable);c.update(.4);assert(Math.abs(c.round.time-before-.28)<1e-9,'reward uses 70% of original speed without stacking');
  await c.onSlowdown();assert.equal(rewardCalls,1,'one reward per round');
  c.resetRound(false);assert.equal(c.timeline.rate,.85);assert.equal(c.track.clip,normal);assert(c.slowdownButton.interactable);
  rewardRequest=async()=>false;await c.onSlowdown();assert.equal(c.timeline.rate,.85);assert.equal(c.track.clip,normal);assert(!c.timeline.paused);assert(c.slowdownButton.interactable);assert.match(c.slowdownDetail.string,/看完/);
  rewardRequest=async()=>{throw Error('ad unavailable')};await c.onSlowdown();assert.equal(c.timeline.rate,.85);assert(!c.timeline.paused);assert(c.slowdownButton.interactable);
  rewardRequest=()=>new Promise(resolve=>resolveReward=resolve);const stale=c.onSlowdown();c.resetRound(false);resolveReward(true);await stale;assert.equal(c.timeline.rate,.85,'old reward must not affect a new round');
  const hidden=c.onSlowdown();c.onHide();resolveReward(true);await hidden;assert.equal(c.timeline.rate,.7);assert(c.timeline.paused);assert(!c.track.playing);c.onShow();c.beginRound();assert(!c.timeline.paused);
  c.round.lives=0;c.update(.01);assert(!c.slowdownButton.node.active,'button hidden behind result');c.onReplay();assert.equal(c.timeline.rate,.85);assert(c.slowdownButton.node.active);
  const destroyed=c.onSlowdown();c.onDestroy();resolveReward(true);await destroyed;assert.equal(c.timeline.rate,.85);assert(!c.track.playing);
  // The reward button is also a valid first touch in feed preview, without a clock jump.
  state={active:true,entered:false,exited:false};const preview=fixture();preview.onLoad();
  const previewReward=preview.onSlowdown();assert(state.entered);assert.equal(preview.round.time,0);assert(preview.timeline.paused);
  state={...state,exited:true};listener(state);resolveReward(true);await previewReward;assert(preview.timeline.paused);assert(!preview.track.playing);
  state={...state,exited:false};listener(state);assert.equal(preview.timeline.rate,.7);assert.equal(preview.round.status,'playing');preview.onDestroy();
  console.log('rhythm cat rewarded slow mode: grant/cancel/error, single request, music sync, pause overlap, retry and stale callbacks passed');
}
(async()=>{const c=fixture();c.onLoad();c.start();c.update(5);assert.equal(c.round.time,0);assert.equal(c.round.lives,3);
state={...state,entered:true};listener(state);c.update(.1);const t=c.round.time;listener(state);assert.equal(c.round.time,t);assert.equal(scheduled,1);
c.onTouchStart(touch(1,-170));c.onTouchStart(touch(2,170));c.onTouchMove(touch(1,-100));assert(c.fingers.positions[0]>.25);assert(Math.abs(c.fingers.positions[1]-.35)<1e-6);c.onTouchMove(touch(2,220));assert(c.fingers.positions[1]>.35);c.emitCrumbs(0,c.round.time);assert.equal(c.bursts[0].x,-288+c.fingers.positions[0]*288,'crumbs follow current drag position');c.render();assert(c.crumbPool.some(s=>s.node.active));
c.onHide();busy=true;c.update(3);assert.equal(c.round.time,t);c.onShow();c.update(3);assert.equal(c.round.time,t);busy=false;c.update(.1);assert(c.round.time>t);
state={...state,exited:true};listener(state);let prev=c.round.time;c.update(4);assert.equal(c.round.time,prev);state={...state,exited:false};listener(state);assert.equal(c.round.time,prev);
c.round.lives=0;c.update(.01);assert(c.resultOverlay.active);c.feedbackUntil[0]=4;c.round.time=3.8;c.render();assert(c.feedback[0].node.active===false);c.onReplay();assert(!c.resultOverlay.active);assert.equal(c.round.score,0);assert.equal(c.round.lives,3);
fail=true;await c.returnHome();assert(!c.leaving);assert.equal(released,0);fail=false;await c.returnHome();assert(c.leaving);assert.equal(released,1);assert.equal(completed,1);
for(const n of [c.touchSurface,c.backButton.node,c.homeButton.node,c.replayButton.node]){n.isValid=false;n.off=()=>{throw Error('already destroyed')}}c.onDestroy();assert.equal(released,1);assert.equal(completed,1);console.log('rhythm cat controller: preview, dual pointers, overlapping pauses, feed reentry, replay, navigation and teardown passed');await verifySlowdown();await verifyInterstitialDoesNotPause();})().catch(e=>{console.error(e);process.exitCode=1});

async function verifyInterstitialDoesNotPause(){
  state={active:false,entered:true,exited:false};busy=false;interstitialBusy=true;
  const c=fixture();c.onLoad();let plays=0,pauses=0;
  c.track.play=()=>{plays++;c.track.playing=true};c.track.pause=()=>{pauses++;c.track.playing=false};
  c.onTouchStart(touch(1,-170));assert.equal(c.round.status,'playing','interstitial must not block first touch');
  c.update(.2);assert(c.round.time>0);assert(!c.timeline.paused);assert(c.track.playing);
  const x=c.fingers.positions[0];c.onTouchMove(touch(1,-150));assert(c.fingers.positions[0]>x,'interstitial must retain the active drag');
  const requests=rewardCalls;await c.onSlowdown();assert.equal(rewardCalls,requests,'do not request a rewarded ad over an interstitial');
  interstitialBusy=false;c.syncAdPause();c.update(.2);assert(c.round.time>.3);assert.equal(plays,1,'closing interstitial must not restart music');assert.equal(pauses,0);
  c.onTouchEnd(touch(1,-150));c.onTouchStart(touch(2,170));c.onTouchMove(touch(2,190));assert(c.fingers.positions[1]>.35,'input remains usable after close');
  interstitialBusy=true;c.onHide();const before=c.round.time;c.update(1);assert.equal(c.round.time,before,'actual background still pauses');c.onShow();c.update(.1);assert(c.round.time>before);
  c.round.lives=0;c.update(.01);c.onReplay();assert.equal(c.round.lives,3);assert.equal(c.round.time,0,'interstitial must not lock replay');
  await c.returnHome();assert(c.leaving,'interstitial must not lock navigation');c.onDestroy();interstitialBusy=false;
  console.log('rhythm cat interstitial: clock, music, drag, close, replay and navigation remain active; background/reward pauses preserved');
}
