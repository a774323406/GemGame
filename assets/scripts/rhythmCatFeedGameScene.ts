import { _decorator, AudioClip, AudioSource, Button, Component, director, EventTouch, game, Game, Label, Node, ResolutionPolicy, Sprite, SpriteFrame, UITransform, Vec3, view } from 'cc';
import AudioManager from './framework/AudioManager';
import gameStorage from './framework/gameStorage';
import { GameSceneBundle, GameSceneName } from './framework/GameSceneBundle';
import { FeedAcquisitionService, FeedAcquisitionState } from './framework/Platform/FeedAcquisitionService';
import { adc } from './framework/Platform/ADController';
import { SdkUtils } from './framework/Platform/sdk/SdkUtils';
import { RHYTHM_CAT_CHART, RHYTHM_CAT_DURATION, FoodKind } from './rhythmCatChart';
import { CatPose, RhythmCatRound } from './rhythmCatRules';
import { RhythmCatInput } from './rhythmCatInput';
import { CAT_NORMAL_RATE, CAT_REWARD_RATE, RhythmCatTimeline } from './rhythmCatTimeline';
const {ccclass,property}=_decorator;
const FOOD: FoodKind[]=['brown-pop','pink-pop','brown-cone','pink-cone','brown-scoop','pink-scoop','cream-scoop'];

@ccclass('rhythmCatFeedGameScene')
export class rhythmCatFeedGameScene extends Component {
  @property(Node) layoutRoot:Node=null;
  @property(Node) background:Node=null;
  @property(Node) touchSurface:Node=null;
  @property([Sprite]) cats:Sprite[]=[];
  @property([Node]) mouthPoints:Node[]=[];
  @property([Node]) movementBounds:Node[]=[];
  @property([Sprite]) crumbPool:Sprite[]=[];
  @property([SpriteFrame]) crumbFrames:SpriteFrame[]=[];
  @property catchRadius=52;
  @property blackCatCatchBonus=6;
  @property lateCatchGrace=.1;
  @property dragSensitivity=1.1;
  @property fallSpeed=220;
  @property([SpriteFrame]) catFrames:SpriteFrame[]=[];
  @property([SpriteFrame]) foodFrames:SpriteFrame[]=[];
  @property([Sprite]) foodPool:Sprite[]=[];
  @property([Sprite]) hearts:Sprite[]=[];
  @property([SpriteFrame]) heartFrames:SpriteFrame[]=[];
  @property([Label]) feedback:Label[]=[];
  @property(Label) scoreLabel:Label=null;
  @property(Label) hintLabel:Label=null;
  @property(AudioSource) track:AudioSource=null;
  @property(AudioClip) slowTrack:AudioClip=null;
  @property(Button) slowdownButton:Button=null;
  @property(Label) slowdownTitle:Label=null;
  @property(Label) slowdownDetail:Label=null;
  @property(Node) slowdownBadge:Node=null;
  @property(Button) backButton:Button=null;
  @property(Node) resultOverlay:Node=null;
  @property(Label) resultTitle:Label=null;
  @property(Label) resultScore:Label=null;
  @property(Button) replayButton:Button=null;
  @property(Button) homeButton:Button=null;
  private round=new RhythmCatRound(RHYTHM_CAT_CHART,RHYTHM_CAT_DURATION);
  private fingers=new RhythmCatInput();
  private timeline:RhythmCatTimeline;
  private previous: [CatPose,CatPose];
  private mouthUntil=[0,0];
  private feedbackUntil=[0,0];
  private feedMode=false;private feedEntered=false;private feedScheduled=false;
  private appHidden=false;private leaving=false;private disposed=false;private sessionFinished=false;
  private catBaselines:Vec3[]=[];
  private bursts: {sprite:Sprite; born:number; x:number; y:number; vx:number; vy:number}[]=[];
  private crumbCursor=0;
  private foodSizes:{width:number;height:number}[]=[];
  private releaseMusic:(()=>void)|null=null;
  private normalTrack:AudioClip=null;
  private adInFlight=false;
  private adBusy=false;
  private roundSerial=0;
  private slowdownMessage='';
  protected onLoad():void {
    view.setDesignResolutionSize(750,1479,ResolutionPolicy.FIXED_WIDTH);
    this.round=new RhythmCatRound(RHYTHM_CAT_CHART,RHYTHM_CAT_DURATION,this.lateCatchGrace);
    this.fingers.sensitivity=this.dragSensitivity;
    this.catBaselines=this.cats.map(s=>new Vec3(s.node.position.x,s.node.position.y,0));
    this.fingers.initial=this.cats.map((s,i)=>(s.node.position.x+this.mouthPoints[i].position.x+288-i*288)/288) as [number,number];
    this.fingers.bounds=[0,1].map(i=>[0,1].map(j=>(this.movementBounds[i*2+j].position.x+288-i*288)/288)) as [[number,number],[number,number]];
    this.foodSizes=this.foodFrames.map(f=>({width:f.originalSize.width,height:f.originalSize.height}));
    this.releaseMusic=AudioManager.acquireSceneMusic();
    this.normalTrack=this.track.clip;
    this.timeline=new RhythmCatTimeline({
      play:()=>this.track.play(),pause:()=>this.track.pause(),stop:()=>this.track.stop(),
      // Clips are pre-stretched to 85% / 70%; both ports use chart seconds.
      seek:t=>{this.track.currentTime=t/this.timeline.rate;},position:()=>this.track.currentTime*this.timeline.rate,playing:()=>this.track.playing,
    },RHYTHM_CAT_DURATION);
    this.fitLayout();view.on('canvas-resize',this.fitLayout,this);
    this.touchSurface.on(Node.EventType.TOUCH_START,this.onTouchStart,this);
    this.touchSurface.on(Node.EventType.TOUCH_MOVE,this.onTouchMove,this);
    this.touchSurface.on(Node.EventType.TOUCH_END,this.onTouchEnd,this);
    this.touchSurface.on(Node.EventType.TOUCH_CANCEL,this.onTouchEnd,this);
    this.backButton.node.on(Button.EventType.CLICK,this.returnHome,this);
    this.homeButton.node.on(Button.EventType.CLICK,this.returnHome,this);
    this.replayButton.node.on(Button.EventType.CLICK,this.onReplay,this);
    this.slowdownButton.node.on(Button.EventType.CLICK,this.onSlowdown,this);
    game.on(Game.EVENT_HIDE,this.onHide,this);game.on(Game.EVENT_SHOW,this.onShow,this);
    director.on(SdkUtils.EVENT_AD_PAUSE_CHANGED,this.syncAdPause,this);
    director.on(SdkUtils.EVENT_INTERSTITIAL_ENDED,this.syncAdPause,this);
    adc.cancelFeedEntryInterstitial();
    const state=FeedAcquisitionService.getState();this.feedMode=state.active;
    this.feedEntered=!this.feedMode || (state.entered&&!state.exited);
    this.resetRound(false);
    this.timeline.setPaused('feed',this.feedMode&&!this.feedEntered);
    FeedAcquisitionService.addListener(this.onFeedChanged);
  }
  protected start():void {
    if(this.feedMode){
      void FeedAcquisitionService.reportSceneReadyAfterStableRender({owner:this.node,requiredVisibleNodes:[this.background,...this.cats.map(s=>s.node)],isReady:()=>!this.disposed&&!!this.track.clip});
      if(this.feedEntered){this.beginRound();this.scheduleFeedAd();}
    }
  }
  private fitLayout=():void=>{
    const size=view.getVisibleSize();const s=Math.min(size.width/576,(size.height-40)/1136);
    this.layoutRoot.setScale(s,s,1);
    this.layoutRoot.setPosition(0,0,0);
  };
  private poses():[CatPose,CatPose] {return [{x:this.fingers.positions[0],radius:(this.catchRadius+this.blackCatCatchBonus)/288},{x:this.fingers.positions[1],radius:this.catchRadius/288}];}
  private resetRound(start:boolean):void {
    this.roundSerial++;this.adInFlight=false;this.slowdownMessage='';
    this.timeline.reset();this.track.clip=this.normalTrack;this.round.reset();this.fingers.reset();this.previous=this.poses();this.mouthUntil=[0,0];this.feedbackUntil=[0,0];
    this.bursts=[];this.crumbPool.forEach(s=>s.node.active=false);
    this.resultOverlay.active=false;this.feedback.forEach(v=>v.node.active=false);
    this.hintLabel.string='左右各用一根手指，拖动猫咪接住冰淇淋';this.hintLabel.node.active=true;
    this.refreshHud();this.refreshSlowdown();this.render();if(start)this.beginRound();
  }
  private beginRound():void {
    if(this.leaving||this.timeline.paused)return;
    const muted=gameStorage.getMusic()===1;this.track.volume=muted?0:1;
    if(this.timeline.start(muted)){this.round.start();this.hintLabel.node.active=false;}
    else {this.hintLabel.string='轻触继续，跟着音乐接住冰淇淋';this.hintLabel.node.active=true;}
  }
  private screenX(event:EventTouch):number {
    const p=event.getUILocation();const local=this.layoutRoot.getComponent(UITransform).convertToNodeSpaceAR(new Vec3(p.x,p.y,0));return(local.x+288)/576;
  }
  private onTouchStart=(event:EventTouch):void=>{
    if(this.leaving||this.resultOverlay.active||this.appHidden||SdkUtils.isRewardedVideoBusy())return;
    if(this.feedMode&&!this.feedEntered)FeedAcquisitionService.activateFromFirstTouch();
    this.syncAdPause();if(this.timeline.paused)return;
    if(this.round.status==='ready'||this.timeline.awaitingGesture)this.beginRound();
    this.fingers.begin(event.getID(),this.screenX(event),false);
  };
  private onTouchMove=(event:EventTouch):void=>{
    if(!this.timeline.paused&&!this.leaving&&!this.resultOverlay.active)this.fingers.move(event.getID(),this.screenX(event));
  };
  private onTouchEnd=(event:EventTouch):void=>{this.fingers.end(event.getID());};
  private syncAdPause=():void=>{
    // Interstitial loading/showing must not pause music, chart time or drag input.
    const paused=SdkUtils.isRewardedVideoBusy();if(paused)this.fingers.clear();this.timeline.setPaused('advert',paused);
    const busy=SdkUtils.isFullscreenAdBusy();
    if(busy!==this.adBusy){this.adBusy=busy;this.refreshSlowdown();}
  };
  private refreshSlowdown():void {
    const slowed=this.timeline.rate<CAT_NORMAL_RATE;
    this.slowdownButton.node.active=!this.resultOverlay.active;
    this.slowdownButton.interactable=!slowed&&!this.adInFlight&&!this.appHidden&&!this.leaving&&!SdkUtils.isFullscreenAdBusy()
      && !(this.feedMode&&FeedAcquisitionService.getState().exited);
    this.slowdownTitle.string=this.adInFlight?'稍候':slowed?'慢速':'降速';
    this.slowdownBadge.active=!slowed;
    this.slowdownDetail.string=this.adInFlight?'看完广告即可生效':slowed?'已减速30% · 本局生效':this.slowdownMessage;
    this.slowdownDetail.node.active=!this.resultOverlay.active&&!!this.slowdownDetail.string;
  }
  private onSlowdown=async():Promise<void>=>{
    if(this.disposed||this.leaving||this.adInFlight||this.appHidden||this.timeline.rate<CAT_NORMAL_RATE||this.resultOverlay.active
      ||SdkUtils.isFullscreenAdBusy()||(this.feedMode&&FeedAcquisitionService.getState().exited))return;
    if(!this.slowTrack){this.slowdownMessage='暂不可用，请稍后再试';this.refreshSlowdown();return;}
    const serial=this.roundSerial;
    this.adInFlight=true;this.fingers.clear();this.previous=this.poses();
    // Keep our pause until the reward is applied, even if the SDK resumes first.
    this.timeline.setPaused('reward',true);this.refreshSlowdown();
    if(this.feedMode&&!this.feedEntered)FeedAcquisitionService.activateFromFirstTouch();
    let rewarded=false;
    try{rewarded=await SdkUtils.showRewardedVideo();}
    catch(err){console.warn('[rhythmCat] 减速广告失败',err);}
    if(this.disposed||this.leaving||!this.node?.isValid||serial!==this.roundSerial)return;
    if(rewarded){
      this.track.stop();this.track.clip=this.slowTrack;this.timeline.setRate(CAT_REWARD_RATE);
    }else this.slowdownMessage='看完广告即可减速，点此重试';
    this.adInFlight=false;this.syncAdPause();this.timeline.setPaused('reward',false);this.refreshSlowdown();
    if(this.round.status==='ready')this.beginRound();
  };
  protected update(dt:number):void {
    if(this.disposed||this.leaving)return;
    this.syncAdPause();
    if(this.round.status!=='playing')return;
    const time=this.timeline.tick(dt), next=this.poses();
    if(this.timeline.awaitingGesture){this.hintLabel.string='轻触继续，跟着音乐接住冰淇淋';this.hintLabel.node.active=true;}
    const judgments=this.round.advance(time,this.previous,next);this.previous=next;
    for(const j of judgments){
      if(j.caught){this.mouthUntil[j.note.side]=time+.17;this.emitCrumbs(j.note.side,time);}
      this.feedbackUntil[j.note.side]=time+.55;
      const label=this.feedback[j.note.side];label.string=j.caught?'好耶！':'漏接了';label.node.active=true;
    }
    if(judgments.length)this.refreshHud();
    this.render();
    if(this.round.lives===0||this.round.time>=RHYTHM_CAT_DURATION)this.finishRound();
  }
  private refreshHud():void {
    this.scoreLabel.string=`分数：${this.round.score}`;
    this.hearts.forEach((s,i)=>s.spriteFrame=this.heartFrames[i<this.round.lives?0:1]);
  }
  private render():void {
    const time=this.round.time;
    this.cats.forEach((s,i)=>{
      s.node.setPosition(-288+i*288+this.fingers.positions[i]*288-this.mouthPoints[i].position.x,this.catBaselines[i].y,0);
      s.spriteFrame=this.catFrames[i*2+(time<this.mouthUntil[i]?1:0)];
      if(time>this.feedbackUntil[i])this.feedback[i].node.active=false;
    });
    let count=0;
    for(const note of RHYTHM_CAT_CHART){
      const mouthY=this.catBaselines[note.side].y+this.mouthPoints[note.side].position.y;
      const y=mouthY+(note.hitTime-time)*this.fallSpeed;
      if(this.round.isResolved(note.id)||y>648||time>note.hitTime+this.lateCatchGrace)continue;
      const sprite=this.foodPool[count++];if(!sprite)break;
      const kind=FOOD.indexOf(note.kind), size=this.foodSizes[kind];
      sprite.node.active=true;sprite.spriteFrame=this.foodFrames[kind];
      sprite.node.getComponent(UITransform).setContentSize(size.width,size.height);
      sprite.node.setPosition(-288+note.side*288+note.x*288,y,0);
    }
    for(let i=count;i<this.foodPool.length;i++)this.foodPool[i].node.active=false;
    this.bursts=this.bursts.filter(p=>{
      const age=time-p.born;if(age>.45){p.sprite.node.active=false;return false;}
      p.sprite.node.setPosition(p.x+p.vx*age,p.y+p.vy*age-330*age*age,0);return true;
    });
  }
  private emitCrumbs(side:number,time:number):void {
    const mouth=this.mouthPoints[side].position;
    const x=-288+side*288+this.fingers.positions[side]*288, y=this.catBaselines[side].y+mouth.y;
    for(let i=0;i<4;i++){
      const sprite=this.crumbPool[this.crumbCursor++%this.crumbPool.length];if(!sprite)return;
      this.bursts=this.bursts.filter(p=>p.sprite!==sprite);
      sprite.spriteFrame=this.crumbFrames[side];sprite.node.active=true;
      sprite.node.setScale(.7+i*.12,.7+i*.12,1);
      this.bursts.push({sprite,born:time,x,y,vx:(i-1.5)*90,vy:70+(i%2)*90});
    }
  }
  private finishRound():void {
    this.timeline.setPaused('result',true);this.fingers.clear();
    this.resultTitle.string=this.round.status==='success'?'完美收工！':'再来一首吧';
    this.resultScore.string=`接住了 ${this.round.score} 份冰淇淋`;
    this.resultOverlay.active=true;
    this.refreshSlowdown();
  }
  private onReplay=():void=>{
    if(this.leaving||this.adInFlight||this.appHidden||SdkUtils.isRewardedVideoBusy()||(this.feedMode&&!this.feedEntered))return;
    this.resetRound(true);
  };
  private onFeedChanged=(state:FeedAcquisitionState):void=>{
    if(!this.feedMode||this.sessionFinished||this.leaving)return;
    this.feedEntered=state.active&&state.entered&&!state.exited;
    this.timeline.setPaused('feed',!this.feedEntered);
    if(!this.feedEntered){this.fingers.clear();adc.cancelFeedEntryInterstitial();this.feedScheduled=false;}
    else {if(this.round.status==='ready')this.beginRound();this.scheduleFeedAd();}
    this.refreshSlowdown();
  };
  private scheduleFeedAd():void {
    if(this.feedScheduled||!this.feedMode||!this.feedEntered)return;this.feedScheduled=true;
    adc.scheduleFeedEntryInterstitial(()=>!this.disposed&&!this.leaving&&!this.appHidden&&this.feedEntered);
  }
  private onHide=():void=>{this.appHidden=true;this.fingers.clear();this.timeline.setPaused('background',true);this.refreshSlowdown();};
  private onShow=():void=>{this.appHidden=false;this.syncAdPause();this.timeline.setPaused('background',false);this.refreshSlowdown();};
  private returnHome=async():Promise<void>=>{
    if(this.leaving||this.adInFlight||SdkUtils.isRewardedVideoBusy()||GameSceneBundle.isLoadingScene)return;
    this.leaving=true;this.fingers.clear();this.timeline.setPaused('leaving',true);
    try{await GameSceneBundle.loadScene(GameSceneName.Main);this.finishSession();this.releaseMusic?.();this.releaseMusic=null;AudioManager.playDefaultBgm();}
    catch(err){console.error('[rhythmCat] 返回大厅失败',err);if(!this.disposed){this.leaving=false;this.timeline.setPaused('leaving',false);this.hintLabel.string='返回失败，请再试一次';this.hintLabel.node.active=true;}}
  };
  private finishSession():void {
    if(this.sessionFinished)return;this.sessionFinished=true;adc.cancelFeedEntryInterstitial();if(this.feedMode)FeedAcquisitionService.completeSession();
  }
  protected onDestroy():void {
    this.disposed=true;this.leaving=true;this.fingers.clear();this.timeline?.reset();
    view.off('canvas-resize',this.fitLayout,this);game.off(Game.EVENT_HIDE,this.onHide,this);game.off(Game.EVENT_SHOW,this.onShow,this);
    director.off(SdkUtils.EVENT_AD_PAUSE_CHANGED,this.syncAdPause,this);director.off(SdkUtils.EVENT_INTERSTITIAL_ENDED,this.syncAdPause,this);
    FeedAcquisitionService.removeListener(this.onFeedChanged);this.finishSession();
    if(this.touchSurface?.isValid){
      this.touchSurface.off(Node.EventType.TOUCH_START,this.onTouchStart,this);this.touchSurface.off(Node.EventType.TOUCH_MOVE,this.onTouchMove,this);
      this.touchSurface.off(Node.EventType.TOUCH_END,this.onTouchEnd,this);this.touchSurface.off(Node.EventType.TOUCH_CANCEL,this.onTouchEnd,this);
    }
    for(const [button,callback] of [[this.backButton,this.returnHome],[this.homeButton,this.returnHome],[this.replayButton,this.onReplay],[this.slowdownButton,this.onSlowdown]] as const)if(button?.node?.isValid)button.node.off(Button.EventType.CLICK,callback,this);
    this.releaseMusic?.();this.releaseMusic=null;
  }
}
