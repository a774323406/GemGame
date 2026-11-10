import { _decorator, AudioSource, Button, Color, Component, EventTouch, Game, game, Graphics, Label, Node, ResolutionPolicy, sys, view } from 'cc';
import { CHARGE_SECONDS, RopeDuckCord, RopeDuckRound } from './ropeDuckRules';
import { FeedAcquisitionService, FeedAcquisitionState } from './framework/Platform/FeedAcquisitionService';
import { adc } from './framework/Platform/ADController';
import { SdkUtils } from './framework/Platform/sdk/SdkUtils';
import { GameSceneBundle, GameSceneName } from './framework/GameSceneBundle';
import AudioManager from './framework/AudioManager';
import { soundName } from './gamePrefabMgr';
const { ccclass, property } = _decorator;
type Puff = { x:number;y:number;vx:number;vy:number;age:number;color:number };
@ccclass('ropeDuckFeedGameScene')
export class ropeDuckFeedGameScene extends Component {
  @property(Node) surface:Node=null;
  @property(Graphics) terrain:Graphics=null;
  @property(Graphics) effects:Graphics=null;
  @property([Node]) ducks:Node[]=[];
  @property(Node) hud:Node=null;
  @property(Label) distanceLabel:Label=null;
  @property(Label) energyLabel:Label=null;
  @property(Label) hintLabel:Label=null;
  @property(Node) resultOverlay:Node=null;
  @property(Label) resultTitle:Label=null;
  @property(Label) resultDetail:Label=null;
  @property(Button) reviveButton:Button=null;
  @property(Button) replayButton:Button=null;
  @property(Button) homeButton:Button=null;
  @property(Button) backButton:Button=null;
  @property(Node) exitOverlay:Node=null;
  @property(Button) continueButton:Button=null;
  @property(Button) restartButton:Button=null;
  @property(Button) exitButton:Button=null;
  @property(AudioSource) jumpAudio:AudioSource=null;
  @property(AudioSource) landAudio:AudioSource=null;
  @property(AudioSource) pickupAudio:AudioSource=null;
  @property(AudioSource) fallAudio:AudioSource=null;
  round=new RopeDuckRound();
  private cord=new RopeDuckCord();
  private feed=false;
  private entered=true;
  private exited=false;
  private hidden=false;
  private disposed=false;
  private leaving=false;
  private exitPaused=false;
  private adInFlight=false;
  private adScheduled=false;
  private serial=0;
  private touchId:number|null=null;
  private cameraX=0;
  private clock=0;
  private best=0;
  private puffs:Puff[]=[];
  private trails:{x:number;y:number}[][]=[[],[]];
  private reviveAction=():void=>{void this.revive();};
  protected onLoad():void {
    view.setDesignResolutionSize(750,1624,ResolutionPolicy.FIXED_WIDTH);
    FeedAcquisitionService.init();this.feed=FeedAcquisitionService.isActive();
    const state=FeedAcquisitionService.getState();this.entered=!this.feed||state.entered;this.exited=this.feed&&state.exited;
    try{this.best=Math.max(0,Number(sys.localStorage.getItem('ropeDuckBest'))||0);}catch{}
    this.replay();FeedAcquisitionService.addListener(this.feedChanged);
    this.surface.on(Node.EventType.TOUCH_START,this.onTouchStart,this);
    this.surface.on(Node.EventType.TOUCH_END,this.onTouchEnd,this);
    this.surface.on(Node.EventType.TOUCH_CANCEL,this.onTouchCancel,this);
    for(const [button,fn]of this.actions())button.node.on(Button.EventType.CLICK,fn,this);
    game.on(Game.EVENT_HIDE,this.onHide,this);game.on(Game.EVENT_SHOW,this.onShow,this);
  }
  protected start():void {
    adc.onEnterGame(this.node);
    if(this.feed)void FeedAcquisitionService.reportSceneReadyAfterStableRender({owner:this.node,requiredVisibleNodes:[this.surface,...this.ducks],stableFrameCount:3,surfaceDelayMs:180,isReady:()=>!this.disposed&&!this.leaving&&!this.exited});
    this.scheduleAd();this.syncAudio();
  }
  private actions():[Button,Function][]{return [[this.backButton,this.requestExit],[this.reviveButton,this.reviveAction],[this.replayButton,this.replay],[this.homeButton,this.home],[this.continueButton,this.cancelExit],[this.restartButton,this.restart],[this.exitButton,this.home]];}
  private feedChanged=(state:FeedAcquisitionState):void=>{
    if(!this.feed)return;
    this.entered=state.entered;this.exited=state.exited;
    if(!this.entered||this.exited){this.cancelInput();adc.cancelFeedEntryInterstitial();this.adScheduled=false;if(this.exited){this.serial++;this.adInFlight=false;this.stopEffects();}}
    else this.scheduleAd();this.syncAudio();
  };
  private scheduleAd():void {
    if(!this.feed||!this.entered||this.exited||this.adScheduled)return;
    this.adScheduled=true;adc.scheduleFeedEntryInterstitial(()=>!this.disposed&&!this.leaving&&this.entered&&!this.exited);
  }
  private paused():boolean{return this.disposed||this.hidden||this.leaving||this.exitPaused||this.adInFlight||SdkUtils.isRewardedVideoBusy();}
  private blocked():boolean{return this.paused()||(this.feed&&(!this.entered||this.exited));}
  private syncAudio():void {
    if(this.paused()){this.stopEffects();AudioManager.pauseBgmForVideo();return;}
    AudioManager.setSoundEvent();AudioManager.playMusic(soundName.getUserBgm);
  }
  private onTouchStart(event:EventTouch):void {
    if(this.feed&&!this.entered&&!this.exited)FeedAcquisitionService.activateFromFirstTouch();
    if(this.blocked()||this.touchId!==null)return;
    this.syncAudio();
    if(this.round.beginCharge())this.touchId=event.getID();
  }
  private onTouchEnd(event:EventTouch):void {
    if(this.touchId!==event.getID())return;
    this.touchId=null;if(this.blocked()){this.round.cancelCharge();return;}this.round.release();
  }
  private onTouchCancel(event:EventTouch):void {if(this.touchId===event.getID())this.cancelInput();}
  private cancelInput():void {this.touchId=null;this.round.cancelCharge();}
  private onHide():void {this.hidden=true;this.cancelInput();this.syncAudio();}
  private onShow():void {this.hidden=false;this.syncAudio();}
  protected update(dt:number):void {
    if(this.paused())return;
    const step=Math.min(.05,Math.max(0,Number.isFinite(dt)?dt:0));this.clock+=step;
    if(!this.blocked()){
      this.round.tick(step);
      for(const e of this.round.drainEvents()){
        if(e.kind==='jump')this.playEffect(this.jumpAudio,.6);
        if(e.kind==='land'){this.playEffect(this.landAudio,.4);this.burst(e.x,e.y,0);}
        if(e.kind==='pickup'||e.kind==='boost'){this.playEffect(this.pickupAudio,.6);this.burst(e.x,e.y+55,1);}
        if(e.kind==='failure'){this.playEffect(this.fallAudio,.7);SdkUtils.vibrateShort();this.showResult();}
      }
      for(let i=0;i<2;i++){const d=this.round.ducks[i];this.trails[i].unshift({x:d.x,y:d.y+40});this.trails[i].length=Math.min(9,this.trails[i].length);}
      const target=Math.max(0,(this.round.ducks[0].x+this.round.ducks[1].x)/2-260);
      this.cameraX+=(target-this.cameraX)*Math.min(1,step*8);
    }
    for(const p of this.puffs){p.age+=step;p.x+=p.vx*step;p.y+=p.vy*step;p.vy-=230*step;}
    this.puffs=this.puffs.filter(p=>p.age<.35);
    const [a,b]=this.round.ducks;
    const ledge=a.grounded&&b.grounded&&this.round.platforms.find(p=>a.x>=p.start&&a.x<=p.end&&b.x>=p.start&&b.x<=p.end&&Math.abs(a.y-p.y)<1&&Math.abs(b.y-p.y)<1);
    this.cord.tick(step,{x:a.x,y:a.y+22},{x:b.x,y:b.y+22},ledge?ledge.y+21:null);
    this.render();
  }
  private burst(x:number,y:number,color:number):void {
    for(let i=0;i<7;i++)this.puffs.push({x,y,vx:(i-3)*36,vy:70+(i%3)*30,age:0,color});
    if(this.puffs.length>56)this.puffs.splice(0,this.puffs.length-56);
  }
  private render():void {
    const height=view.getVisibleSize().height,ground=-height*.08,r=this.round;
    const sx=(x:number)=>x-this.cameraX-375,sy=(y:number)=>ground+y;
    const terrain=this.terrain;terrain.clear();
    for(const p of r.platforms){
      const x=sx(p.start),w=p.end-p.start,top=sy(p.y);if(x>400||x+w< -400)continue;
      const bottom=-height/2-20,h=top-bottom;
      for(let i=0;i<8;i++){terrain.fillColor=new Color(248-i*5,193-i*5,144-i*6);terrain.rect(x,top-h*(i+1)/8,w,h/8+1);terrain.fill();}
      terrain.fillColor=new Color(98,57,27);terrain.rect(x,top-5,w,5);terrain.fill();
      terrain.fillColor=new Color(166,206,34);terrain.rect(x,top,w,18);terrain.fill();
      terrain.fillColor=new Color(187,225,47);terrain.rect(x,top+12,w,7);terrain.fill();
      terrain.fillColor=new Color(224,255,98,75);terrain.rect(x,top+16,w,2);terrain.fill();
      if(p.spikeX!==null){for(let i=0;i<3;i++){const tx=sx(p.spikeX+i*16);terrain.fillColor=new Color(88,100,105);terrain.moveTo(tx,top+19);terrain.lineTo(tx+8,top+45);terrain.lineTo(tx+16,top+19);terrain.close();terrain.fill();terrain.strokeColor=new Color(45,50,57);terrain.lineWidth=2;terrain.stroke();}}
      if(p.energyX!==null&&!p.energyTaken){const ex=sx(p.energyX),ey=sy(p.y+110)+Math.sin(this.clock*4+p.id)*6;terrain.fillColor=new Color(255,239,83,85);terrain.circle(ex,ey,24);terrain.fill();terrain.fillColor=new Color(255,232,40);terrain.moveTo(ex+4,ey+20);terrain.lineTo(ex-14,ey-2);terrain.lineTo(ex-2,ey-2);terrain.lineTo(ex-6,ey-20);terrain.lineTo(ex+14,ey+5);terrain.lineTo(ex+2,ey+5);terrain.close();terrain.fill();terrain.strokeColor=new Color(198,151,16);terrain.lineWidth=2;terrain.stroke();}
    }
    const fx=this.effects;fx.clear();
    for(let i=0;i<2;i++){
      const d=r.ducks[i],trail=this.trails[i];
      if(!d.grounded&&r.phase==='playing')for(let k=trail.length-1;k>0;k--){fx.strokeColor=i===0?new Color(255,255,255,110-k*9):new Color(242,242,72,120-k*10);fx.lineWidth=22*(1-k/10);fx.moveTo(sx(trail[k].x),sy(trail[k].y));fx.lineTo(sx(trail[k-1].x),sy(trail[k-1].y));fx.stroke();}
      const charging=r.charging&&r.selected===i,c=charging?r.charge/CHARGE_SECONDS:0;
      const land=d.landAge<.16?Math.sin(d.landAge/.16*Math.PI)*.16:0;
      const idle=(this.feed&&(!this.entered||this.exited))?Math.sin(this.clock*2.8+i)*.025:0;
      this.ducks[i].setPosition(sx(d.x),sy(d.y)+17,0);this.ducks[i].setScale(1+c*.15+land,1-c*.24-land+idle,1);
      this.ducks[i].angle=d.grounded?0:Math.max(-16,Math.min(18,-d.vy*.018));
      if(r.invulnerable>0){fx.strokeColor=new Color(255,255,180,170);fx.lineWidth=3;fx.circle(sx(d.x),sy(d.y)+57,53);fx.stroke();}
    }
    const points=this.cord.points;
    if(points.length){
      fx.strokeColor=new Color(57,47,32);fx.lineWidth=3.5;fx.moveTo(sx(points[0].x),sy(points[0].y));
      for(let i=0;i<points.length-1;i++){
        const p0=points[Math.max(0,i-1)],p1=points[i],p2=points[i+1],p3=points[Math.min(points.length-1,i+2)];
        fx.bezierCurveTo(sx(p1.x+(p2.x-p0.x)/6),sy(p1.y+(p2.y-p0.y)/6),sx(p2.x-(p3.x-p1.x)/6),sy(p2.y-(p3.y-p1.y)/6),sx(p2.x),sy(p2.y));
      }
      fx.stroke();
    }
    if(r.phase==='playing'){
      const d=r.ducks[r.selected],x=sx(d.x),y=sy(d.y)+126+Math.sin(this.clock*5)*4;
      fx.fillColor=r.selected===0?new Color(72,178,255):new Color(236,47,241);fx.strokeColor=new Color(54,42,54);fx.lineWidth=3;
      fx.moveTo(x-7,y+12);fx.lineTo(x+7,y+12);fx.lineTo(x+7,y-1);fx.lineTo(x+16,y-1);fx.lineTo(x,y-18);fx.lineTo(x-16,y-1);fx.lineTo(x-7,y-1);fx.close();fx.fill();fx.stroke();
    }
    for(const p of this.puffs){fx.fillColor=p.color?new Color(255,236,80,Math.round(230*(1-p.age/.35))):new Color(255,255,244,Math.round(210*(1-p.age/.35)));fx.circle(sx(p.x),sy(p.y)+18,5+p.age*11);fx.fill();}
    this.distanceLabel.string=`${r.distance} 米`;
    this.energyLabel.string=r.boost>0?'能量冲刺！':`能量 ${r.energy}/5`;
    this.hintLabel.string=r.boost>0?'乘风向前！':r.charging?'松手起跳，越蓄越远':r.distance<15?'轻点短跳，按住跳远':'落地的鸭子可以继续跳，拉上伙伴';
    for(const button of [this.reviveButton,this.replayButton,this.homeButton])button.interactable=!this.adInFlight&&!this.leaving;
  }
  private showResult():void {
    this.cancelInput();this.best=Math.max(this.best,this.round.distance);
    try{sys.localStorage.setItem('ropeDuckBest',String(this.best));}catch{}
    this.hud.active=false;this.resultTitle.string='挑战失败';
    this.resultDetail.string=`${this.round.failureReason}\n本次跳了 ${this.round.distance} 米\n最远纪录 ${this.best} 米`;
    this.resultOverlay.active=true;adc.onLevelResult(this.round.distance,'fail');
  }
  private replay():void {
    if(this.disposed||this.leaving||this.adInFlight)return;
    this.serial++;this.cancelInput();this.round=new RopeDuckRound();this.cameraX=0;this.puffs=[];this.trails=[[],[]];
    this.resetCord();
    this.exitPaused=false;this.exitOverlay.active=false;this.resultOverlay.active=false;this.hud.active=true;this.stopEffects();this.render();
  }
  private async revive():Promise<void> {
    if(this.blocked()||this.round.phase!=='failure')return;
    const serial=this.serial;this.adInFlight=true;this.cancelInput();this.syncAudio();this.render();
    let success=false;try{success=await SdkUtils.showRewardedVideo();}catch(e){console.warn('[RopeDuck] reward failed',e);}
    if(this.disposed||this.leaving||serial!==this.serial||!this.node?.isValid)return;
    this.adInFlight=false;
    if(success&&this.round.revive()){this.resetCord();this.resultOverlay.active=false;this.hud.active=true;this.puffs=[];this.trails=[[],[]];this.cameraX=Math.max(0,(this.round.ducks[0].x+this.round.ducks[1].x)/2-260);}
    else this.resultDetail.string='完整看完广告才能复活\n也可以重新挑战';
    this.syncAudio();this.render();
  }
  private requestExit():void {if(this.paused()||this.resultOverlay.active)return;this.cancelInput();this.exitPaused=true;this.exitOverlay.active=true;this.syncAudio();}
  private restart():void {if(this.disposed||this.leaving||this.adInFlight)return;this.replay();this.syncAudio();}
  private resetCord():void {const [a,b]=this.round.ducks;this.cord.reset({x:a.x,y:a.y+22},{x:b.x,y:b.y+22});}
  private cancelExit():void {this.exitPaused=false;this.exitOverlay.active=false;this.syncAudio();}
  private async home():Promise<void> {if(this.leaving||this.adInFlight)return;this.cancelInput();this.leaving=true;this.serial++;this.syncAudio();try{await GameSceneBundle.loadScene(GameSceneName.Main);}catch(e){this.leaving=false;this.syncAudio();console.warn('[RopeDuck] return failed',e);}}
  private playEffect(source:AudioSource,volume:number):void {if(!source?.isValid||this.paused()||!AudioManager.canPlaySound())return;source.stop();source.volume=volume;source.play();}
  private stopEffects():void {for(const a of [this.jumpAudio,this.landAudio,this.pickupAudio,this.fallAudio])if(a?.isValid)a.stop();}
  protected onDestroy():void {
    this.disposed=true;this.serial++;this.cancelInput();this.stopEffects();
    if(this.surface?.isValid){this.surface.off(Node.EventType.TOUCH_START,this.onTouchStart,this);this.surface.off(Node.EventType.TOUCH_END,this.onTouchEnd,this);this.surface.off(Node.EventType.TOUCH_CANCEL,this.onTouchCancel,this);}
    for(const [b,fn]of this.actions())if(b?.node?.isValid)b.node.off(Button.EventType.CLICK,fn,this);
    game.off(Game.EVENT_HIDE,this.onHide,this);game.off(Game.EVENT_SHOW,this.onShow,this);FeedAcquisitionService.removeListener(this.feedChanged);
    if(this.feed){adc.cancelFeedEntryInterstitial();FeedAcquisitionService.completeSession();}
  }
}
