import {_decorator,AudioClip,Button,Color,Component,EventTouch,director,game,Game,Label,Node,Sprite,SpriteFrame,sys,view,ResolutionPolicy,Widget} from 'cc';
import {DriftFeedRun} from './drift/driftFeedRules';
import {DriftFeedView,DRIFT_THEMES} from './drift/driftFeedView';
import {DriftFeedEffects} from './drift/driftFeedEffects';
import {DriftFeedAudio} from './drift/driftFeedAudio';
import {DriftReviveGate} from './drift/driftReviveGate';
import {GameSceneBundle,GameSceneName} from './framework/GameSceneBundle';
import {FeedAcquisitionService,FeedAcquisitionState} from './framework/Platform/FeedAcquisitionService';
import {SdkUtils} from './framework/Platform/sdk/SdkUtils';
import {adc} from './framework/Platform/ADController';
import AudioManager from './framework/AudioManager';
const {ccclass,property}=_decorator;
const BEST='gemgame.driftFeed.bestCurves';
@ccclass('driftFeedGameScene')
export class driftFeedGameScene extends Component {
 @property(Node) world:Node=null;
 @property(Sprite) background:Sprite=null;
 @property(Node) driveSurface:Node=null;
 @property(Node) hud:Node=null;
 @property(Node) guide:Node=null;
 @property(Label) scoreLabel:Label=null;
 @property(Label) bestLabel:Label=null;
 @property(Label) hintLabel:Label=null;
 @property(Label) messageLabel:Label=null;
 @property(Button) pauseButton:Button=null;
 @property(Node) resultOverlay:Node=null;
 @property(Label) resultTitle:Label=null;
 @property(Label) resultDetail:Label=null;
 @property(Button) reviveButton:Button=null;
 @property(Button) retryButton:Button=null;
 @property(Button) homeButton:Button=null;
 @property([SpriteFrame]) roadFrames:SpriteFrame[]=[];
 @property(SpriteFrame) arrowFrame:SpriteFrame=null;
 @property(SpriteFrame) carFrame:SpriteFrame=null;
 @property([AudioClip]) audioClips:AudioClip[]=[];
 run=new DriftFeedRun(Date.now());
 private visual:DriftFeedView;private effects:DriftFeedEffects;private audio:DriftFeedAudio;
 private gate=new DriftReviveGate();private paused=false;private hidden=false;private leaving=false;private disposed=false;private touchId:number|null=null;
 private best=0;private messageTime=0;private feed=false;private entered=true;private exited=false;private adScheduled=false;private releaseMusic:()=>void;
 protected onLoad():void {
  view.setDesignResolutionSize(750,1624,ResolutionPolicy.FIXED_WIDTH);
  const stored=Number(sys.localStorage.getItem(BEST));this.best=Number.isFinite(stored)?Math.max(0,Math.floor(stored)):0;
  this.releaseMusic=AudioManager.acquireSceneMusic();AudioManager.stopAllEffects();
  this.visual=new DriftFeedView(this.world,this.roadFrames,this.carFrame,this.arrowFrame);this.effects=new DriftFeedEffects(this.visual.effectRoot,this.visual.trailsRoot,this.visual.upperTrailsRoot);this.audio=new DriftFeedAudio(this.node,this.audioClips);
  this.visual.render(this.run.snapshot,this.run.track,0);
  this.driveSurface.on(Node.EventType.TOUCH_START,this.press,this);this.driveSurface.on(Node.EventType.TOUCH_END,this.release,this);this.driveSurface.on(Node.EventType.TOUCH_CANCEL,this.release,this);
  this.pauseButton.node.on(Button.EventType.CLICK,this.togglePause,this);this.retryButton.node.on(Button.EventType.CLICK,this.retry,this);this.reviveButton.node.on(Button.EventType.CLICK,this.requestRevive,this);this.homeButton.node.on(Button.EventType.CLICK,this.home,this);
  director.on(SdkUtils.EVENT_INTERSTITIAL_SHOWN,this.onInterstitialShown,this);
  game.on(Game.EVENT_HIDE,this.onHide,this);game.on(Game.EVENT_SHOW,this.onShow,this);
  FeedAcquisitionService.init();this.feed=FeedAcquisitionService.isActive();const state=FeedAcquisitionService.getState();this.entered=!this.feed||state.entered;this.exited=this.feed&&state.exited;FeedAcquisitionService.addListener(this.feedChanged);
 }
 protected start():void {
  if(this.feed){void FeedAcquisitionService.reportSceneReadyAfterStableRender({owner:this.node,requiredVisibleNodes:[this.world,this.background.node],stableFrameCount:3,surfaceDelayMs:180,isReady:()=>!this.disposed&&!this.leaving&&!this.exited});this.scheduleAd();}
 }
 private scheduleAd():void{if(!this.feed||!this.entered||this.exited||this.adScheduled)return;this.adScheduled=true;adc.scheduleFeedEntryInterstitial(()=>!this.disposed&&!this.leaving&&this.feed&&this.entered&&!this.exited);}
 private feedChanged=(s:FeedAcquisitionState):void=>{if(!this.feed)return;this.entered=s.entered;this.exited=s.exited;if(!s.entered||s.exited){adc.cancelFeedEntryInterstitial();this.adScheduled=false;this.clearTouch();this.audio?.setSuspended(true);}else this.scheduleAd();};
 private blocked():boolean{return this.disposed||this.leaving||this.hidden||this.paused||this.gate.busy||(SdkUtils.isFullscreenAdBusy()&&!SdkUtils.isInterstitialBusy())||(this.feed&&(!this.entered||this.exited));}
 private press(e:EventTouch):void{if(this.feed&&!this.entered)FeedAcquisitionService.activateFromFirstTouch();if(this.blocked()||this.resultOverlay.active||this.touchId!==null)return;this.audio.unlock();this.touchId=e.getID();this.run.setPressed(true);}
 private release(e:EventTouch):void{if(e.getID()===this.touchId)this.clearTouch();}
 private clearTouch():void{this.touchId=null;this.run.setPressed(false);}
 private onInterstitialShown():void{if(this.disposed||this.leaving)return;this.setPaused(true);}
 private onHide():void{this.hidden=true;this.clearTouch();this.audio.setSuspended(true);}
 private onShow():void{this.hidden=false;this.clearTouch();}
 protected update(dt:number):void {
  const blocked=this.blocked();this.audio.setSuspended(blocked);
  if(blocked){this.clearTouch();return;}
  this.run.viewportHeight=view.getVisibleSize().height;this.run.update(dt);const s=this.run.snapshot,events=this.run.drainEvents();
  this.visual.render(s,this.run.track,dt);this.effects.consume(events);this.effects.emitTrail(s,dt);this.effects.update(Math.min(dt,1/15));this.audio.consume(events);this.audio.sync(s,dt);
  const target=DRIFT_THEMES[s.themeIndex],old=this.background.color,k=Math.min(1,dt*3);
  this.background.color=new Color(old.r+(target[0]-old.r)*k,old.g+(target[1]-old.g)*k,old.b+(target[2]-old.b)*k);
  this.scoreLabel.string=String(s.curves);this.bestLabel.string=`最佳 ${Math.max(this.best,s.curves)} 弯`;
  this.hintLabel.string=s.phase==='ready'?'按住漂移 · 松手出弯':s.pin?'松手出弯':'靠近弯道时按住';
  if(s.curves>this.best){this.best=s.curves;sys.localStorage.setItem(BEST,String(this.best));}
  for(const e of events){if(e.type==='boost-start'){this.messageLabel.string='极速冲刺！';this.messageTime=1.2;}if(e.type==='theme'){this.messageLabel.string='进入新赛段';this.messageTime=1.2;}if(e.type==='result')this.showResult(false);}
  if(s.phase==='reviving'){this.messageLabel.string=String(Math.ceil(s.countdown));this.messageLabel.node.active=true;}
  else{this.messageTime=Math.max(0,this.messageTime-dt);if(this.messageTime===0)this.messageLabel.string='';}
 }
 private showResult(pause:boolean):void {
  this.clearTouch();this.resultTitle.string=pause?'暂停驾驶':'挑战失败';
  this.resultDetail.string=`本次通过 ${this.run.snapshot.curves} 弯\n最佳纪录 ${this.best} 弯`;
  const revive=pause||this.run.snapshot.revivesRemaining>0;
  this.reviveButton.node.active=revive;
  this.reviveButton.node.getChildByName('ReviveButtonLabel').getComponent(Label).string=pause?'继续驾驶':'复活继续';
  this.reviveButton.node.getChildByName('VideoBadge').active=!pause;
  for(const [button,y] of [[this.retryButton,revive?-345:-260],[this.homeButton,revive?-510:-425]] as [Button,number][]){const w=button.node.getComponent(Widget);w.verticalCenter=y/1334;w.updateAlignment();}
  this.resultOverlay.active=true;
 }
 setPaused(value:boolean):void{if(this.gate.busy||this.run.snapshot.phase==='result'||this.run.snapshot.phase==='crashing')return;this.paused=value;this.clearTouch();if(value)this.showResult(true);else this.resultOverlay.active=false;this.audio.setSuspended(value);}
 private togglePause():void{this.setPaused(!this.paused);}
 retry():void{if(this.leaving||this.disposed)return;this.gate.invalidate();this.clearTouch();this.paused=false;this.resultOverlay.active=false;this.run.restart(Date.now());this.effects.reset();this.visual.reset();this.audio.reset();this.messageTime=0;this.messageLabel.string='';}
 async requestRevive():Promise<void>{
  if(this.paused){this.setPaused(false);return;}
  if(this.blocked()||this.run.snapshot.phase!=='result'||this.run.snapshot.revivesRemaining<=0)return;
  this.audio.setSuspended(true);this.clearTouch();
  await this.gate.request(()=>SdkUtils.showRewardedVideo(),()=>{
   if(this.disposed||this.leaving||!this.run.revive())return false;
   this.resultOverlay.active=false;this.effects.reset();this.audio.reset();return true;
  });
 }
 private async home():Promise<void>{if(this.leaving)return;this.leaving=true;this.gate.invalidate();this.clearTouch();this.audio.setSuspended(true);try{await GameSceneBundle.loadScene(GameSceneName.Main);}catch(e){this.leaving=false;console.error('[DriftFeed] return failed',e);}}
 protected onDestroy():void{this.disposed=true;director.off(SdkUtils.EVENT_INTERSTITIAL_SHOWN,this.onInterstitialShown,this);this.gate.invalidate();game.off(Game.EVENT_HIDE,this.onHide,this);game.off(Game.EVENT_SHOW,this.onShow,this);FeedAcquisitionService.removeListener(this.feedChanged);if(this.feed){adc.cancelFeedEntryInterstitial();FeedAcquisitionService.completeSession();}this.audio?.dispose();this.effects?.dispose();this.releaseMusic?.();}
}
