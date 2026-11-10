const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
let state={active:true,entered:false,exited:false},listener,resolveAd,rewardBusy=false,interstitialBusy=false,music=false,ready=0,schedules=0,closed=0;
const node=()=>({active:true,isValid:true,on(){},off(){},setPosition(x,y){this.position={x,y}},setScale(x,y){this.scale={x,y}}});
const graphics=()=>new Proxy({},{get:(o,k)=>k in o?o[k]:()=>{}});
const cc={_decorator:{ccclass:()=>v=>v,property:()=>()=>{}},Component:class{constructor(){this.node=node()}},Node:{EventType:{TOUCH_START:'start',TOUCH_END:'end',TOUCH_CANCEL:'cancel'}},Button:{EventType:{CLICK:'click'}},Color:class{constructor(...v){this.values=v}},Game:{EVENT_HIDE:'hide',EVENT_SHOW:'show'},game:{on(){},off(){}},view:{setDesignResolutionSize(){},getVisibleSize:()=>({width:750,height:1334})},ResolutionPolicy:{FIXED_WIDTH:1},sys:{localStorage:{getItem:()=>null,setItem(){}}}};
const feed={init(){},isActive:()=>state.active,getState:()=>state,addListener:f=>listener=f,removeListener(){listener=null},activateFromFirstTouch(){state={...state,entered:true};listener(state)},reportSceneReadyAfterStableRender:async(o)=>{assert.equal(o.requiredVisibleNodes.length,3);ready++},completeSession(){closed++}};
const sdk={isRewardedVideoBusy:()=>rewardBusy,isFullscreenAdBusy:()=>rewardBusy||interstitialBusy,showRewardedVideo:()=>new Promise(r=>resolveAd=r),vibrateShort(){}};
function load(file){const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/scripts/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true}}).outputText,{exports:out,console,require:n=>n==='cc'?cc:n.endsWith('ropeDuckRules')?load('ropeDuckRules.ts'):n.endsWith('FeedAcquisitionService')?{FeedAcquisitionService:feed}:n.endsWith('SdkUtils')?{SdkUtils:sdk}:n.endsWith('ADController')?{adc:{onEnterGame(){},onLevelResult(){},scheduleFeedEntryInterstitial(){schedules++},cancelFeedEntryInterstitial(){}}}:n.endsWith('AudioManager')?{default:{setSoundEvent(){},playMusic(){music=true},pauseBgmForVideo(){music=false},canPlaySound:()=>true}}:n.endsWith('gamePrefabMgr')?{soundName:{getUserBgm:'getUserBgm'}}:{GameSceneName:{Main:'NewMainScene'},GameSceneBundle:{loadScene:async()=>{}}}});return out;}
const C=load('ropeDuckFeedGameScene.ts').ropeDuckFeedGameScene;
function make(){const c=new C();for(const k of ['surface','hud','resultOverlay','exitOverlay'])c[k]=node();c.ducks=[node(),node()];c.terrain=graphics();c.effects=graphics();for(const k of ['distanceLabel','energyLabel','hintLabel','resultTitle','resultDetail'])c[k]={string:'',node:node()};for(const k of ['reviveButton','replayButton','homeButton','backButton','continueButton','restartButton','exitButton'])c[k]={node:node()};for(const k of ['jumpAudio','landAudio','pickupAudio','fallAudio'])c[k]={isValid:true,stop(){},play(){}};c.onLoad();c.start();return c;}
const touch=id=>({getID:()=>id});
const fail=c=>{c.round.ducks.forEach(d=>{d.y=-600;d.grounded=false;});c.update(.02);assert(c.resultOverlay.active);assert(!c.hud.active);};
(async()=>{
 const c=make();assert(music);c.update(.05);assert.equal(c.round.distance,0);assert.equal(c.round.charge,0);assert.equal(ready,1);
 c.onTouchStart(touch(1));assert(c.round.charging);assert.equal(schedules,1);c.update(.05);c.onTouchEnd(touch(2));assert(c.round.charging,'second finger cannot release');c.onTouchCancel(touch(1));assert(!c.round.charging);c.onTouchEnd(touch(1));assert(c.round.ducks[0].grounded);
 c.onTouchStart(touch(1));c.update(.05);c.onTouchEnd(touch(1));assert(!c.round.ducks[0].grounded);assert.equal(c.round.selected,1);
 c.replay();
 for(let n=0;n<2;n++){c.onTouchStart(touch(n+10));c.onTouchEnd(touch(n+10));assert.equal(c.round.ducks[n].vy,410,'rapid taps without an update still produce short jumps');}
 assert(c.round.ducks.every(d=>!d.grounded));
 interstitialBusy=true;const y=c.round.ducks[0].y;c.update(.05);assert.notEqual(c.round.ducks[0].y,y,'interstitial must not freeze simulation');interstitialBusy=false;
 c.replay();c.onTouchStart(touch(1));c.onHide();assert(!c.round.charging);assert(!music);c.onTouchEnd(touch(1));assert(c.round.ducks[0].grounded);c.onShow();assert(music);
 c.onTouchStart(touch(1));c.requestExit();assert(c.exitOverlay.active);assert(!c.round.charging);c.update(.05);c.cancelExit();assert(!c.exitOverlay.active);
 c.round.distance=246;c.round.energy=3;c.onTouchStart(touch(9));c.requestExit();assert(!music);
 const restart=c.actions().find(([button])=>button===c.restartButton);assert(restart,'pause menu exposes restart');restart[1].call(c);
 assert.equal(c.round.distance,0);assert.equal(c.round.energy,0);assert(!c.exitPaused&&!c.exitOverlay.active&&c.hud.active);assert(music,'restart resumes BGM after pause');
 c.onTouchEnd(touch(9));assert(c.round.ducks.every(d=>d.grounded),'pause restart discards old held touch');
 fail(c);let p=c.revive();assert(c.adInFlight);const old=c.round;c.replay();assert.equal(c.round,old,'replay is blocked while reward is open');resolveAd(false);await p;assert.equal(c.round.phase,'failure');assert(c.resultOverlay.active);
 p=c.revive();resolveAd(true);await p;assert.equal(c.round.phase,'playing');assert(!c.resultOverlay.active);assert(c.hud.active);assert(c.round.invulnerable>0);
 fail(c);p=c.revive();listener({...state,entered:false,exited:true});resolveAd(true);await p;assert.equal(c.round.phase,'failure','reward from exited feed cannot revive');
 listener({...state,entered:true,exited:false});c.replay();fail(c);p=c.revive();c.onDestroy();resolveAd(true);await p;assert.equal(c.round.phase,'failure');assert.equal(closed,1);assert.equal(listener,null);
 console.log('PASS preview/music, touch identity/cancel, charge, non-pausing interstitial, pause/background, failure/revive/stale callbacks and cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
