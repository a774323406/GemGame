const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const { close28, close28Variations, open4, upright9, longFoot12, phoneVideoSixes } = require('./math_exam_handwriting_fixtures.cjs');
const miniGameTransform = require('./math_exam_minigame_compile.cjs');
const file = 'assets/scripts/mathExamFeedGameScene.ts';
assert(fs.existsSync(file), 'math controller must implement feed-safe handwriting');
function compile(file, imports = {}) {
  const out = {};
  const javascript = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true,
  } }).outputText;
  const compiled = file.endsWith('handwrittenDigits.ts') ? miniGameTransform(javascript) : javascript;
  vm.runInNewContext(compiled, { exports: out, require: name => { assert(name in imports, name); return imports[name]; }, Math, Number, String, Map, Set, console: { log: console.log, error() {} } });
  return out;
}
class Node {
  static EventType = { TOUCH_START:'start', TOUCH_MOVE:'move', TOUCH_END:'end', TOUCH_CANCEL:'cancel' };
  constructor() { this.isValid = true; this.active = true; this.position = new Vec3(); this.scale = new Vec3(1,1,1); }
  setPosition(x,y,z) { this.position = typeof x === 'object' ? x : new Vec3(x,y,z); }
  setScale(x,y,z) { this.scale = typeof x === 'object' ? x : new Vec3(x,y,z); }
  on() {} off() {}
  getWorldPosition() { const parent = this.parent?.getWorldPosition() || new Vec3(); return new Vec3(parent.x + this.position.x, parent.y + this.position.y, 0); }
  getComponent() { return { width: 246, height: 150, convertToNodeSpaceAR: p => {
    const origin = this.getWorldPosition(); return new Vec3(p.x - origin.x, p.y - origin.y, 0);
  } }; }
}
class Vec3 { constructor(x=0,y=0,z=0) { Object.assign(this,{x,y,z}); } }
class Color { constructor(...values) { this.values=values; } }
class Component { constructor() { this.node = new Node(); } }
const tweenCallbacks = [];
const cc = { _decorator:{ccclass:()=>v=>v,property:()=>()=>{}}, Component, Node, Vec3, Color,
  Button: class { static EventType={CLICK:'click'}; }, Label: class {}, Graphics: class {}, UITransform: class {},
  view:{setDesignResolutionSize(){},getVisibleSize:()=>({width:750,height:1624}),on(){},off(){}},
  ResolutionPolicy:{FIXED_WIDTH:1}, sys:{localStorage:{getItem:()=>null,setItem(){}}},
  game:{on(){},off(){}},Game:{EVENT_HIDE:'hide',EVENT_SHOW:'show'},
  input:{on(){},off(){}},Input:{EventType:{TOUCH_START:'start'}}, EventTouch: class {},
  Tween:{stopAllByTarget(){}}, tween:()=>({to(){return this;},delay(){return this;},call(fn){tweenCallbacks.push(fn);return this;},start(){return this;}}),
};
let state = {active:true,entered:false,exited:false};
let listener, complete=0, scheduled=0, busy=false, failLoad=false, musicStarts=0;
let rewardResolve, rewardReject, adCalls=0;
const showRewardedVideo=()=>{adCalls++;return new Promise((resolve,reject)=>{rewardResolve=resolve;rewardReject=reject;});};
const feed={init(){},isActive:()=>state.active,getState:()=>state,addListener:fn=>listener=fn,removeListener(){},
  reportSceneReadyAfterStableRender:async()=>{},activateFromFirstTouch(){},completeSession(){complete++;}};
const audio={setSoundEvent(){},playDefaultBgm(){musicStarts++;},playMusic(name){assert.equal(name,'getUserBgm');musicStarts++;},pauseBgmForVideo(){},playEffectByName(){}};
const imports={'cc':cc,'./gamePrefabMgr':{soundName:{getUserBgm:'getUserBgm'}},'./mathExamRules':compile('assets/scripts/mathExamRules.ts'),
  './handwrittenDigits':compile('assets/scripts/handwrittenDigits.ts'),
  './inkEraser':compile('assets/scripts/inkEraser.ts'),
  './framework/AudioManager':{default:audio},
  './framework/Platform/FeedAcquisitionService':{FeedAcquisitionService:feed},
  './framework/Platform/ADController':{adc:{cancelFeedEntryInterstitial(){},scheduleFeedEntryInterstitial(){scheduled++;}}},
  './framework/Platform/sdk/SdkUtils':{SdkUtils:{isFullscreenAdBusy:()=>busy,showRewardedVideo}},
  './framework/GameSceneBundle':{GameSceneName:{Main:'NewMainScene'},GameSceneBundle:{loadScene:async()=>{if(failLoad)throw Error('offline');}}}};
const {mathExamFeedGameScene:Controller}=compile(file,imports);
function fixture() {
  const c = new Controller();
  for(const key of ['layoutRoot','paper','questionRoot','inkArea','resultOverlay','resultPanel','correctionBottle','eraserTip']) c[key]=new Node();
  c.correctionBottle.parent = c.layoutRoot;
  c.correctionBottle.setPosition(-198,-458,0);
  c.eraserTip.parent = c.correctionBottle;
  c.eraserTip.setPosition(-45,125,0);
  for(const key of ['scoreLabel','timeLabel','hintLabel','inkHint','feedbackLabel','resultTitle','resultScore','resultDetail','bestLabel']) c[key]={node:new Node(),string:'',color:new Color()};
  for(const key of ['backButton','replayButton','homeButton','addTimeButton','reviveButton']) c[key]={node:new Node(),interactable:true};
  c.questionLabels=Array.from({length:4},()=>({node:new Node(),string:''}));
  c.ink={clear(){},moveTo(){},lineTo(){},stroke(){},circle(){},fill(){}};
  c.clock={clear(){},moveTo(){},lineTo(){},stroke(){},circle(){},fill(){},close(){}};
  return c;
}
(async()=>{
  const c=fixture(); c.onLoad(); c.start();
  const previewCalls=adCalls; await c.onAddTime(); await c.onRevive();
  assert.equal(adCalls,previewCalls,'preview cannot start reward ads before gameplay');
  c.update(8); assert.equal(c.round.remaining,60,'preview must not consume time');
  state={...state,entered:true}; listener(state); c.update(2); assert.equal(c.round.remaining,58);
  listener(state); assert.equal(c.round.remaining,58,'duplicate entry must not reset'); assert.equal(scheduled,1);
  busy=true; c.update(5); assert.equal(c.round.remaining,58,'ad pauses timer'); busy=false;
  c.onGameHide(); c.update(4); assert.equal(c.round.remaining,58,'background pauses timer'); c.onGameShow();
  state={...state,exited:true}; listener(state); c.update(5); assert.equal(c.round.remaining,58,'feed exit pauses timer');
  state={...state,exited:false}; listener(state);
  c.round.remaining=0.1; c.update(0.2); assert.equal(c.phase,'result'); assert.equal(c.resultOverlay.active,true);
  c.onReplay(); assert.equal(c.phase,'playing'); assert.equal(c.round.remaining,60); assert.equal(c.resultOverlay.active,false);
  const touch=(id,x,y)=>({getID:()=>id,getUILocation:()=>({x,y})});
  const videoLocal = strokes => strokes.map(s => s.map(p => ({ x: (p.x - 500) * 0.75, y: (p.y - 540) * 0.75 })));
  function drawVideoSix(sample, id) {
    for (const stroke of videoLocal(sample.strokes)) {
      c.onPenStart(touch(id, stroke[0].x, -stroke[0].y));
      for (const p of stroke.slice(1)) {
        c.onPenMove(touch(id,p.x,-p.y)); c.update(0.02);
      }
      c.onPenEnd(touch(id,stroke.at(-1).x,-stroke.at(-1).y));
    }
    assert.equal(c.pointerId,null,'phone-like pen release must unlock recognition and erasing');
  }
  for (const sample of phoneVideoSixes) {
    c.onReplay(); drawVideoSix(sample,30);
    c.update(0.99); assert.equal(c.round.score,0,'wait for the pen-up delay');
    c.update(0.02); assert.equal(c.round.score,5,`video six must auto-score: ${sample.name}`);
    assert.equal(c.phase,'scrolling');
    tweenCallbacks.at(-1)();
    assert.equal(c.phase,'playing'); assert.equal(c.questionLabels[0].string,'3+1=');
    assert.equal(c.strokes.length,0,'accepted video ink must clear for the next question');
    drawVideoSix(sample,31); c.update(1.01);
    assert.equal(c.round.score,5,'the same 6 must not be accepted for 3+1');
    assert.match(c.hintLabel.string,/6/);
  }
  c.onReplay(); drawVideoSix(phoneVideoSixes[0],32);
  c.onEraserStart(touch(33,-198,-458));
  assert.equal(c.eraserPointerId,33,'eraser is available immediately after lifting the pen');
  for (const p of videoLocal(phoneVideoSixes[0].strokes)[0]) c.onEraserMove(touch(33,p.x+45,-p.y-125));
  const eraserPosition=c.correctionBottle.position;
  c.onEraserEnd(touch(33,eraserPosition.x,eraserPosition.y));
  assert.equal(c.strokes.length,0,'tracing the first six with the nozzle erases all of it');
  drawVideoSix(phoneVideoSixes[1],34); c.update(1.01);
  assert.equal(c.round.score,5,'rewriting the second video six after erasing still auto-scores');
  assert.equal(c.phase,'scrolling'); tweenCallbacks.at(-1)();
  assert.equal(c.questionLabels[0].string,'3+1=');
  c.onReplay();
  c.onPenStart(touch(1,0,50)); c.onPenStart(touch(2,40,50));
  assert.equal(c.strokes.length,1,'second finger must not create ink');
  c.onPenMove(touch(1,0,-40)); c.onPenCancel(touch(1,0,-40));
  assert.equal(c.strokes.length,0,'cancelled stroke must be discarded');
  c.round.questions[0]={a:2,b:1,operator:'−',answer:1};
  c.onPenStart(touch(3,0,50)); c.onPenEnd(touch(3,0,-40));
  assert.equal(c.strokes[0].length,2,'pen-up position must complete stroke');
  c.onGameHide(); c.update(4); c.onGameShow(); c.update(1.01);
  assert.equal(c.round.score,5,'completed ink waiting for recognition must resume after background');
  c.onReplay();
  busy=true; c.onGameHide(); c.onGameShow();
  const beforeAdClose=musicStarts;
  busy=false; c.update(0.1);
  assert.equal(musicStarts,beforeAdClose+1,'show-before-ad-close must resume music when the ad closes');
  // A vertical 1 must be classified from ink, and a correct answer rolls once.
  c.round.questions[0]={a:2,b:1,operator:'−',answer:1};
  c.strokes=[[{x:0,y:0},{x:0,y:90}]]; c.recognizeAnswer();
  assert.equal(c.round.score,5); assert.equal(c.phase,'scrolling');
  c.recognizeAnswer(); assert.equal(c.round.score,5,'pending scroll cannot score twice');
  const stale=tweenCallbacks.at(-1); c.onReplay(); stale(); assert.equal(c.round.score,0); assert.equal(c.phase,'playing');
  for (const answer of ['6', '4', '10']) assert.equal(c.round.submit(answer), true);
  c.strokes=close28; c.penIdle=0; c.update(1.01);
  assert.equal(c.round.score,20,'the screenshot 28 must score on the fourth question, 4×7');
  assert.equal(c.phase,'scrolling');
  c.onReplay();
  for (const { name, strokes } of close28Variations) {
    c.onReplay();
    for (const answer of ['6', '4', '10']) assert(c.round.submit(answer));
    c.strokes=strokes; c.penIdle=0; c.update(1.01);
    assert.equal(c.round.score,20,`4×7 must auto-score the full 28: ${name}`);
    assert.equal(c.phase,'scrolling'); tweenCallbacks.at(-1)();
    assert.equal(c.strokes.length,0);
    c.onReplay(); c.round.submit('6');
    c.strokes=strokes; c.penIdle=0; c.update(1.01);
    assert.equal(c.round.score,5,`28 remains wrong for 3+1: ${name}`);
    assert.match(c.hintLabel.string,/28/);
  }
  c.onReplay();
  c.round.questions[0]={a:3,b:1,operator:'+',answer:4};
  c.strokes=close28; c.recognizeAnswer();
  assert.equal(c.round.score,0,'28 must remain wrong for 3+1; recognition must not follow the expected answer');
  assert.match(c.hintLabel.string,/28/,'wrong answer feedback reports the actual written digits');
  c.onReplay();
  c.round.submit('6');
  c.strokes=open4; c.penIdle=0; c.update(1.01);
  assert.equal(c.round.score,10,'the screenshot open 4 must score on 3+1');
  for (const strokes of [longFoot12, [longFoot12[0],longFoot12[1].slice(0,10),longFoot12[1].slice(9)]]) {
    c.onReplay(); c.round.score=25; c.round.correct=5;
    c.round.questions[0]={a:3,b:9,operator:'+',answer:12};
    c.round.questions[1]={a:1,b:1,operator:'+',answer:2};
    for (const [index, stroke] of strokes.entries()) {
      c.onPenStart(touch(41,stroke[0].x-300,178-stroke[0].y));
      for (const p of stroke.slice(1)) c.onPenMove(touch(41,p.x-300,178-p.y));
      c.onPenEnd(touch(41,stroke.at(-1).x-300,178-stroke.at(-1).y));
      if (index===0) {
        c.update(1.1);
        assert.equal(c.round.score,25,'pausing after 1 must preserve it for the rest of 12');
      } else c.update(0.1);
    }
    c.update(1.01);
    assert.equal(c.round.score,30,'screenshot 12 on 3+9 must auto-score from 25 to 30');
    assert.equal(c.phase,'scrolling'); tweenCallbacks.at(-1)();
    assert.equal(c.questionLabels[0].string,'1+1=');
    assert.equal(c.strokes.length,0);
    c.strokes=longFoot12; c.penIdle=0; c.update(1.01);
    assert.equal(c.round.score,30,'12 must not be accepted as just its final 2');
    assert.match(c.hintLabel.string,/12/);
    c.strokes=[longFoot12[1]]; c.penIdle=0; c.update(1.01);
    assert.equal(c.round.score,35,'the same 2 alone must score correctly on 1+1');
  }
  for (const strokes of [upright9, [upright9.flat()], upright9.slice().reverse().map(s=>s.slice().reverse())]) {
    c.onReplay();
    c.round.score=25; c.round.correct=5;
    c.round.questions[0]={a:6,b:3,operator:'+',answer:9};
    c.round.questions[1]={a:1,b:1,operator:'+',answer:2};
    for (const stroke of strokes) {
      c.onPenStart(touch(40,stroke[0].x-285,161-stroke[0].y));
      for (const p of stroke.slice(1)) c.onPenMove(touch(40,p.x-285,161-p.y));
      c.onPenEnd(touch(40,stroke.at(-1).x-285,161-stroke.at(-1).y));
      c.update(0.1);
    }
    c.update(1.01);
    assert.equal(c.round.score,30,'screenshot 9 on 6+3 must auto-score from 25 to 30');
    assert.equal(c.phase,'scrolling'); tweenCallbacks.at(-1)();
    assert.equal(c.questionLabels[0].string,'1+1=');
    assert.equal(c.strokes.length,0);
  }
  c.onReplay(); c.round.submit('6');
  c.strokes=upright9; c.penIdle=0; c.update(1.01);
  assert.equal(c.round.score,5,'screenshot 9 must not be confused with 4 on 3+1');
  assert.match(c.hintLabel.string,/9/);
  c.onReplay();
  c.round.questions[0]={a:3,b:2,operator:'+',answer:5};
  c.strokes=open4; c.recognizeAnswer();
  assert.equal(c.round.score,0,'an open 4 cannot be accepted for an answer of 5');
  assert.match(c.hintLabel.string,/4/);
  c.round.questions[0]={a:3,b:1,operator:'+',answer:4};
  c.strokes=[[{x:40,y:0},{x:40,y:90}],[{x:0,y:45},{x:80,y:45}]];
  c.recognizeAnswer();
  assert.equal(c.round.score,0,'a plus sign must not be awarded points as 4');
  c.strokes=[[{x:0,y:0},{x:80,y:0}]]; c.recognizeAnswer();
  assert.doesNotMatch(c.hintLabel.string,/写大/,'recognition failure should not claim the writing was too small');
  c.onReplay();
  assert.equal(typeof c.onEraserStart, 'function', 'correction bottle must be draggable instead of a clear-all button');
  c.strokes=[[{x:-100,y:0},{x:100,y:0}],[{x:-100,y:-55},{x:100,y:-55}]];
  c.penIdle=0.6;
  c.onEraserStart(touch(7,-198,-458));
  assert.equal(c.strokes.length,2,'picking up the bottle must not clear the answer');
  assert.equal(c.penIdle,-1,'picking up the bottle suspends pending recognition');
  c.onEraserMove(touch(8,25,-125));
  assert.equal(c.correctionBottle.position.x,-198,'another finger cannot move the bottle');
  c.onEraserMove(touch(7,25,-125));
  c.onEraserMove(touch(7,65,-125));
  assert.equal(c.correctionBottle.position.x,65,'the bottle follows the grabbed point');
  assert.equal(c.strokes.length,3,'a nozzle swipe cuts a gap and preserves the other stroke');
  assert.equal(c.strokes[0][0].x,-100); assert.equal(c.strokes[1].at(-1).x,100);
  assert.equal(c.strokes[2][0].y,-55,'ink away from the nozzle is retained');
  const fragments=c.strokes.length;
  c.onPenStart(touch(9,20,50)); assert.equal(c.strokes.length,fragments,'drawing is blocked while holding the bottle');
  c.update(1.2); assert.equal(c.penIdle,-1,'ink must not be submitted mid-erase');
  c.onEraserEnd(touch(7,65,-125));
  assert.equal(c.eraserPointerId,null); assert.equal(c.penIdle,0,'release restarts the recognition delay');
  c.onReplay();
  assert.equal(c.correctionBottle.position.x,-198); assert.equal(c.correctionBottle.position.y,-458);
  c.onEraserStart(touch(10,-198,-458)); c.onEraserMove(touch(10,25,-125));
  c.onGameHide();
  assert.equal(c.eraserPointerId,null,'backgrounding cancels an active drag');
  assert.equal(c.correctionBottle.position.y,-458,'backgrounding returns the bottle home');
  c.onEraserMove(touch(10,65,-125)); assert.equal(c.correctionBottle.position.y,-458,'late movement cannot revive a cancelled drag');
  c.onGameShow();
  c.onEraserStart(touch(11,-198,-458)); busy=true; c.update(0.1);
  assert.equal(c.eraserPointerId,null,'a fullscreen ad cancels the drag'); busy=false; c.update(0.1);
  c.onEraserStart(touch(12,-198,-458)); c.round.remaining=0.1; c.update(0.2);
  assert.equal(c.eraserPointerId,null,'timeout releases the bottle'); c.onReplay();
  assert.equal(typeof c.onAddTime, 'function', 'bottom ad button must add time');
  c.round.submit('6');
  c.strokes=open4; c.penIdle=0;
  const paper=c.round.questions;
  let pending=c.onAddTime();
  assert.equal(adCalls,1,'the native ad must start in the click call stack');
  assert.equal(c.addTimeButton.interactable,false);
  c.update(4); c.onGameHide(); c.onGameShow(); c.update(5);
  assert.equal(c.round.remaining,60,'own request pauses countdown even before SDK busy updates');
  assert.equal(c.round.score,5,'pending handwriting stays unsubmitted during the ad');
  await c.onAddTime(); await c.onRevive(); await c.returnToMain(); c.onReplay();
  assert.equal(adCalls,1,'double clicks and conflicting actions are blocked');
  assert.equal(c.round.score,5); assert.equal(c.phase,'playing');
  rewardResolve(true); await pending;
  assert.equal(c.round.remaining,90,'completed ad adds exactly 30 seconds');
  assert.equal(c.round.questions,paper); assert.equal(c.strokes,open4);
  assert.equal(c.addTimeButton.interactable,true);
  for(const outcome of [false,'error']) {
    pending=c.onAddTime();
    if(outcome==='error') rewardReject(Error('unavailable')); else rewardResolve(false);
    await pending; assert.equal(c.round.remaining,90,'incomplete or failed ads grant nothing');
    assert.equal(c.addTimeButton.interactable,true);
  }
  c.round.remaining=0.1; c.update(0.2);
  assert.equal(c.reviveButton.node.active,true,'failure offers revival');
  assert.equal(c.addTimeButton.node.active,false,'add-time is hidden behind the result');
  pending=c.onRevive(); rewardResolve(false); await pending;
  assert.equal(c.phase,'result'); assert.equal(c.round.remaining,0);
  pending=c.onRevive(); rewardResolve(true); await pending;
  assert.equal(c.phase,'playing'); assert.equal(c.resultOverlay.active,false);
  assert.equal(c.round.remaining,30); assert.equal(c.round.score,5); assert.equal(c.round.questions,paper);
  assert.equal(c.strokes,open4,'revive retains unfinished ink on the current question');
  c.round.score=100; c.round.remaining=0.1; c.update(0.2);
  assert.equal(c.reviveButton.node.active,false,'successful results do not offer revival');
  const callsBeforeSuccess=adCalls; await c.onRevive(); assert.equal(adCalls,callsBeforeSuccess);
  c.onReplay(); pending=c.onAddTime(); c.resetRound(true);
  rewardResolve(true); await pending;
  assert.equal(c.round.remaining,60,'old rewards cannot affect a new round');
  assert.equal(c.addTimeButton.interactable,true,'stale completion releases the request lock');
  pending=c.onAddTime(); state={...state,exited:true}; listener(state);
  rewardResolve(true); await pending; assert.equal(c.round.remaining,60,'feed exit discards the old reward');
  state={...state,exited:false}; listener(state);
  pending=c.onAddTime(); state={...state,exited:true}; listener(state);
  state={...state,exited:false}; listener(state); rewardResolve(true); await pending;
  assert.equal(c.round.remaining,60,'exit and re-entry cannot reward the new round');
  // Expiring during the accepted-answer animation must revive on the next question.
  c.round.questions[0]={a:2,b:1,operator:'−',answer:1};
  c.strokes=[[{x:0,y:0},{x:0,y:90}]]; c.recognizeAnswer();
  const expiredScroll=tweenCallbacks.at(-1);
  c.round.remaining=0.1; c.update(0.2);
  pending=c.onRevive(); rewardResolve(true); await pending; expiredScroll();
  assert.equal(c.phase,'playing'); assert.equal(c.round.score,5);
  assert.equal(c.questionLabels[0].string,'3+1=');
  assert.equal(c.strokes.length,0,'already scored ink must not be submitted for the next question');
  failLoad=true; await c.returnToMain(); assert.equal(c.phase,'playing','failed navigation must recover play');
  failLoad=false; await c.returnToMain(); assert.equal(c.phase,'leaving');
  // Cocos destroys children before the controller on their parent Canvas.
  for(const node of [c.inkArea,c.correctionBottle,c.backButton.node,c.replayButton.node,c.homeButton.node,c.addTimeButton.node,c.reviveButton.node]) {
    node.isValid=false;node.off=()=>{throw Error('destroyed event processor');};
  }
  c.feedbackLabel.node=null;
  assert.doesNotThrow(()=>c.onDestroy(),'scene teardown must tolerate already-destroyed children');
  assert.equal(complete,1,'session closes once after successful leave');
  state={active:false,entered:false,exited:false};
  const destroyed=fixture(); destroyed.onLoad(); pending=destroyed.onAddTime();
  destroyed.onDestroy(); destroyed.node.isValid=false; rewardResolve(true); await pending;
  assert.equal(destroyed.round.remaining,60,'destroyed scenes cannot receive rewards');
  console.log('Math controller: feed lifecycle, handwriting, erasing, +30-second rewards, failure revival, incomplete ads, duplicate actions, stale rewards and navigation passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
