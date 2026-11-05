const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
let state={active:true,entered:false,exited:false},listener,resolveAd,rewardBusy=false,schedules=0,ready=0,closed=0,vibrations=0,fxPlays=0;
let owners=0,musicPlaying=false,musicRestarts=0,musicName=null,musicMuted=false;
const audio={acquireSceneMusic(){owners++;musicPlaying=false;return()=>owners--},setSoundEvent(){},playMusic(name){musicName=name;musicPlaying=owners===0&&!musicMuted},restartMusic(name){musicRestarts++;this.playMusic(name)},pauseBgmForVideo(){musicPlaying=false},playEffectByName(){},canPlaySound:()=>true};
const feed={init(){},isActive:()=>state.active,getState:()=>state,addListener:f=>listener=f,removeListener(){listener=null},activateFromFirstTouch(){state={...state,entered:true};listener(state)},reportSceneReadyAfterStableRender:async(options)=>{assert.equal(options.requiredVisibleNodes[1].name,"Brick0","readiness checks real sprite, not 1x1 pivot");ready++},completeSession(){closed++}};
const node=()=>({active:true,isValid:true,position:{x:0,y:0},on(){},off(){},setPosition(x,y){this.position={x,y}},setScale(x,y){this.scale={x,y}},getChildByName(){return {name:"Brick0",isValid:true}}});
const events=new Map();const cc={director:{on:(e,f,o)=>events.set(e,()=>f.call(o)),off:e=>events.delete(e)},_decorator:{ccclass:()=>v=>v,property:()=>()=>{}},Component:class{constructor(){this.node=node()}},Node:{EventType:{TOUCH_START:'touch'}},Button:{EventType:{CLICK:'click'}},Game:{EVENT_HIDE:'hide',EVENT_SHOW:'show'},game:{on(){},off(){}},view:{setDesignResolutionSize(){},getVisibleSize:()=>({width:750,height:1334})},ResolutionPolicy:{FIXED_WIDTH:1}};
function load(f){const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/scripts/'+f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true}}).outputText,{exports:out,console,require:n=>n==='cc'?cc:n.endsWith('gamePrefabMgr')?{soundName:{getUserBgm:'getUserBgm'}}:n.endsWith('brickChopFeedback')?load('brickChopFeedback.ts'):n.endsWith('brickChopRules')?load('brickChopRules.ts'):n.endsWith('FeedAcquisitionService')?{FeedAcquisitionService:feed}:n.endsWith('SdkUtils')?{SdkUtils:{EVENT_INTERSTITIAL_SHOWN:'shown',vibrateShort(){vibrations++},isRewardedVideoBusy:()=>rewardBusy,showRewardedVideo:()=>new Promise(r=>resolveAd=r)}}:n.endsWith('ADController')?{adc:{onEnterGame(){},cancelFeedEntryInterstitial(){},scheduleFeedEntryInterstitial(){schedules++}}}:n.endsWith('AudioManager')?{default:audio}:{GameSceneName:{Main:'NewMainScene'},GameSceneBundle:{loadScene:async()=>{}}}});return out;}

const C=load('brickChopFeedGameScene.ts').brickChopFeedGameScene;
function make(){
 const c=new C();
 for(const k of ['surface','hand','impactRoot','hud','resultOverlay','exitOverlay'])c[k]=node();
 c.bricks=Array.from({length:12},()=>node());c.bricks[0].name='Brick0';
 c.leftPieces=Array.from({length:12},()=>node());c.rightPieces=Array.from({length:12},()=>node());
 for(const k of ['chanceLabel','hintLabel','hitLabel','resultTitle','resultDetail'])c[k]={string:'',node:node()};
 c.dust=Array.from({length:16},()=>node());c.swingAudio={isValid:true,stop(){},play(){fxPlays++}};c.impactAudio={isValid:true,stop(){},play(){fxPlays++}};
 c.gaugeFill={fillRange:0};
 for(const k of ['slowdownButton','extraButton','replayButton','homeButton','backButton','continueButton','exitButton'])c[k]={node:node()};
 c.onLoad();c.start();return c;
}
function settle(c){for(let i=0;i<14;i++)c.update(.1);}
(async()=>{
 const c=make();assert(musicPlaying);const power=c.gaugeFill.fillRange;c.update(.1);assert.notEqual(c.gaugeFill.fillRange,power);assert.equal(c.round.chances,3);assert.equal(c.round.chargeTime,0);
 const displayed=c.gaugeFill.fillRange;c.onTap();assert(Math.abs(c.round.strikePower-displayed)<1e-8,'first touch samples the visible preview meter');assert.equal(schedules,1);assert.equal(c.round.chances,2);c.onTap();assert.equal(c.round.chances,2);settle(c);
 c.onHide();const time=c.round.chargeTime;c.update(.1);assert.equal(c.round.chargeTime,time);assert(!musicPlaying);c.onShow();assert(musicPlaying);
 let p=c.reward('extra');c.onTap();assert.equal(c.round.chances,2);c.update(.1);assert.equal(c.round.chargeTime,time);resolveAd(false);await p;assert.equal(c.round.chances,2);
 p=c.reward('extra');resolveAd(true);await p;assert.equal(c.round.chances,5);
 p=c.reward('slow');resolveAd(true);await p;assert.equal(c.round.speedMultiplier,.72);
 p=c.reward('extra');c.replay();resolveAd(true);await p;assert.equal(c.round.chances,3,'stale reward cannot change new round');
 p=c.reward('extra');listener({...state,entered:false,exited:true});resolveAd(true);await p;assert.equal(c.round.chances,3);assert(musicPlaying);
 const prev=c.gaugeFill.fillRange;c.update(.1);assert.notEqual(c.gaugeFill.fillRange,prev);c.onTap();assert.equal(c.round.chances,3);
 listener({...state,entered:true,exited:false});c.replay();c.round.chargeTime=.9;c.onTap();c.update(.1);assert.equal(c.round.remaining,12);c.update(.1);c.update(.05);assert.equal(c.round.remaining,0);assert(!c.resultOverlay.active,'wait for chop animation');assert(c.leftPieces.some(p=>p.active));settle(c);assert(c.resultOverlay.active&&!c.hud.active);assert.equal(c.resultTitle.string,'挑战成功');c.update(.016);assert(!c.hitLabel.node.active,'hit message stays hidden after result');
 c.replay();c.round.chargeTime=.81;c.onTap();assert.equal(c.round.lastHit,10);
 for(let i=0;i<8;i++)c.update(.1);
 assert.equal(c.leftPieces.filter(p=>p.active).length,10,'ten left halves for ten broken bricks');
 assert.equal(c.rightPieces.filter(p=>p.active).length,10);
 const layers=c.leftPieces.filter(p=>p.active);for(let i=1;i<layers.length;i++)assert(layers[i].position.y-layers[i-1].position.y>=20,'fracture rows must remain visually distinct');
 assert.equal(c.bricks.filter(p=>p.active).length,2,'exactly two whole bricks remain');
 assert(vibrations>=4,'strong strikes vibrate at contact and final fracture');
 const plays=fxPlays;c.onHide();c.update(.1);assert.equal(fxPlays,plays);c.onShow();settle(c);
 c.replay();for(let i=0;i<3;i++){c.round.chargeTime=0;c.onTap();settle(c);}assert.equal(c.resultTitle.string,'挑战失败');assert(c.resultOverlay.active);
 c.replay();c.requestExit();assert(c.exitOverlay.active);const before=c.round.chargeTime;c.update(.1);assert.equal(c.round.chargeTime,before);c.cancelExit();c.update(.1);assert(c.round.chargeTime>before);
 p=c.reward('extra');c.surface.isValid=false;c.surface.off=()=>{throw Error('invalid surface')};c.onDestroy();resolveAd(true);await p;assert.equal(c.round.chances,3);assert.equal(listener,null);assert.equal(closed,1);assert.equal(ready,1);
 console.log('PASS brick preview/music, feed activation/exit, repeated touches, rewards/stale callbacks, pause, win/fail and cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
