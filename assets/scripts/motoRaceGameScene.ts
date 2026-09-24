import { _decorator, AudioSource, Button, Color, Component, EventKeyboard, EventTouch, game, Game, Graphics, input, Input, KeyCode, Label, Node, ResolutionPolicy, Texture2D, UITransform, Vec3, view } from 'cc';
import { GameSceneBundle, GameSceneName } from './framework/GameSceneBundle';
import { SdkUtils } from './framework/Platform/sdk/SdkUtils';
import AudioManager from './framework/AudioManager';
import gameStorage from './framework/gameStorage';
import { MotoRace, MAX_SPEED, RACE_LENGTH, Attack } from './motoRaceRules';
import { MotoRaceRenderer } from './motoRaceRenderer';
import { MotoRaceArt } from './motoRaceArt';
const {ccclass,property}=_decorator;
@ccclass('motoRaceGameScene')
export class motoRaceGameScene extends Component {
  @property(Node) layoutRoot:Node=null;
  @property(Graphics) world:Graphics=null;
  @property(Node) artRoot:Node=null;
  @property(Texture2D) riderAtlas:Texture2D=null;
  @property(Graphics) hud:Graphics=null;
  @property(Label) rankLabel:Label=null;
  @property(Label) armorLabel:Label=null;
  @property(Label) speedLabel:Label=null;
  @property(Label) distanceLabel:Label=null;
  @property(Label) timeLabel:Label=null;
  @property(Label) messageLabel:Label=null;
  @property(Label) countdownLabel:Label=null;
  @property(Node) steeringPad:Node=null;
  @property(Node) steeringKnob:Node=null;
  @property(Button) punchButton:Button=null;
  @property(Button) kickButton:Button=null;
  @property(Button) pauseButton:Button=null;
  @property(Button) boostButton:Button=null;
  @property(Label) boostTitle:Label=null;
  @property(Label) boostDetail:Label=null;
  @property(Node) boostBadge:Node=null;
  @property(Button) backButton:Button=null;
  @property(Node) overlay:Node=null;
  @property(Label) resultTitle:Label=null;
  @property(Label) resultDetail:Label=null;
  @property(Label) resumeLabel:Label=null;
  @property(Button) resumeButton:Button=null;
  @property(Button) replayButton:Button=null;
  @property(Button) homeButton:Button=null;
  @property(AudioSource) music:AudioSource=null;
  @property(AudioSource) hitSound:AudioSource=null;
  private race=new MotoRace();
  private renderer:MotoRaceRenderer;
  private art:MotoRaceArt;
  private countdown=3;
  private touchId:number|null=null;
  private fingers=new Map<number,number>();
  private adInFlight=false;private roundSerial=0;private disposed=false;
  private touchSteer=0;
  private keys=new Set<number>();
  private leaving=false;
  private hidden=false;
  private hitSerial=0;
  private messageTime=0;
  private releaseMusic:(()=>void)|null=null;
  protected onLoad():void {
    view.setDesignResolutionSize(750,1624,ResolutionPolicy.FIXED_WIDTH);
    this.art=new MotoRaceArt(this.artRoot,this.riderAtlas);
    this.renderer=new MotoRaceRenderer(this.world,this.art);
    this.releaseMusic=AudioManager.acquireSceneMusic();
    this.fit(); view.on('canvas-resize',this.fit,this);
    this.punchButton.node.on(Button.EventType.CLICK,this.punch,this);
    this.kickButton.node.on(Button.EventType.CLICK,this.kick,this);
    this.pauseButton.node.on(Button.EventType.CLICK,this.pause,this);
    this.boostButton.node.on(Button.EventType.CLICK,this.rewardBoost,this);
    this.backButton.node.on(Button.EventType.CLICK,this.pause,this);
    this.resumeButton.node.on(Button.EventType.CLICK,this.resume,this);
    this.replayButton.node.on(Button.EventType.CLICK,this.restart,this);
    this.homeButton.node.on(Button.EventType.CLICK,this.home,this);
    this.steeringPad.on(Node.EventType.TOUCH_START,this.touchStart,this);
    this.steeringPad.on(Node.EventType.TOUCH_MOVE,this.touchMove,this);
    this.steeringPad.on(Node.EventType.TOUCH_END,this.touchEnd,this);
    this.steeringPad.on(Node.EventType.TOUCH_CANCEL,this.touchEnd,this);
    input.on(Input.EventType.KEY_DOWN,this.keyDown,this); input.on(Input.EventType.KEY_UP,this.keyUp,this);
    game.on(Game.EVENT_HIDE,this.hide,this); game.on(Game.EVENT_SHOW,this.show,this);
    this.restart();
  }
  private fit():void {
    const size=view.getVisibleSize(); const s=Math.min(size.width/750,(size.height-40)/1334);
    this.layoutRoot.setScale(s,s,1); this.clearInput();
  }
  private clearInput():void {this.keys.clear();this.fingers.clear();this.touchId=null;this.touchSteer=0;this.steeringKnob?.setPosition(0,0,0);}
  private restart():void {
    if(this.adInFlight)return;this.roundSerial++;
    this.race=new MotoRace();this.countdown=3;this.hitSerial=0;this.messageTime=0;
    this.music?.stop();this.overlay.active=false;this.clearInput(); this.messageLabel.string='按住左半屏向左，右半屏向右';
    this.music?.pause();this.startSound();
    this.renderer.render(this.race);this.refreshHud();
  }
  private touchStart(e:EventTouch):void {
    if(this.adInFlight||this.hidden||this.race.paused||this.race.status!=='racing')return;
    this.fingers.set(e.getID(),e.getUILocation().x);this.touchId=e.getID();this.touchMove(e);this.startSound();
  }
  private touchMove(e:EventTouch):void {
    if(!this.fingers.has(e.getID()))return;
    this.fingers.set(e.getID(),e.getUILocation().x);
    if(e.getID()===this.touchId)this.touchSteer=e.getUILocation().x<view.getVisibleSize().width/2?-1:1;
  }
  private touchEnd(e:EventTouch):void {
    this.fingers.delete(e.getID());
    if(e.getID()===this.touchId){
      const remaining=[...this.fingers.entries()].pop();this.touchId=remaining?.[0] ?? null;
      this.touchSteer=remaining?(remaining[1]<view.getVisibleSize().width/2?-1:1):0;
    }
  }
  private async rewardBoost():Promise<void> {
    if(this.adInFlight||this.hidden||this.leaving||this.race.paused||this.race.fallen||this.countdown>0
      ||this.race.status!=='racing'||this.race.boostRemaining>0||SdkUtils.isFullscreenAdBusy())return;
    const serial=this.roundSerial;this.adInFlight=true;this.clearInput();this.music?.pause();this.refreshHud();
    let rewarded=false;
    try{rewarded=await SdkUtils.showRewardedVideo();}catch(error){console.warn('[MotoRace] 加速广告失败',error);}
    if(this.disposed||serial!==this.roundSerial||this.leaving||!this.node?.isValid)return;
    this.adInFlight=false;
    if(rewarded)this.race.activateBoost();
    this.messageLabel.string=rewarded?'无敌冲刺！':'看完广告即可加速，请重试';this.messageTime=2;
    if(this.hidden)this.pause();else this.startSound();this.refreshHud();
  }
  private keyDown(e:EventKeyboard):void {
    if(this.adInFlight||this.hidden)return;
    const repeated=this.keys.has(e.keyCode);this.keys.add(e.keyCode);
    if(repeated)return;
    if(e.keyCode===KeyCode.KEY_J)this.punch();
    if(e.keyCode===KeyCode.KEY_K)this.kick();
    if(e.keyCode===KeyCode.ESCAPE||e.keyCode===KeyCode.SPACE){if(this.race.paused)this.resume();else this.pause();}
    if(e.keyCode===KeyCode.ENTER&&this.overlay.active){if(this.race.status==='racing')this.resume();else this.restart();}
    this.startSound();
  }
  private keyUp(e:EventKeyboard):void {this.keys.delete(e.keyCode);}
  private punch():void {this.attack('punch');}
  private kick():void {this.attack('kick');}
  private attack(kind:Attack):void {if(this.countdown<=0&&!this.leaving&&!this.adInFlight)this.race.attack(kind);this.startSound();}
  private pause():void {
    if(this.adInFlight||this.leaving||this.race.status!=='racing')return;
    this.race.paused=true;this.clearInput();this.music?.pause();this.showOverlay();
  }
  private resume():void {if(this.adInFlight||this.hidden||this.leaving||this.race.status!=='racing')return;this.race.paused=false;this.overlay.active=false;this.clearInput();this.startSound();}
  private hide():void {this.hidden=true;this.pause();this.music?.pause();}
  private show():void {this.hidden=false;}
  private showOverlay():void {
    this.overlay.active=true;this.resumeButton.node.active=this.race.status==='racing';
    this.resultTitle.string=this.race.status==='racing'?'比赛暂停':this.race.status==='finished'?'冲线完成！':'护甲耗尽';
    this.resultDetail.string=`第 ${this.race.rank} 名 / 12\n击倒 ${this.race.knockouts} 人 · 用时 ${this.race.elapsed.toFixed(1)} 秒\n行驶 ${Math.floor(this.race.distance)} / ${RACE_LENGTH} 米`;
    this.resumeLabel.string='继续比赛';
  }
  private async home():Promise<void> {
    if(this.leaving||this.adInFlight)return; this.leaving=true;this.race.paused=true;this.clearInput();this.music?.pause();
    try {await GameSceneBundle.loadScene(GameSceneName.Main);} catch(error){this.leaving=false;this.showOverlay();this.resultTitle.string='返回失败，请重试';console.error('[MotoRace]',error);}
  }
  private syncMusic():void {
    if(!this.music)return;
    const allowed=!this.hidden&&!this.leaving&&!this.race.paused&&!this.adInFlight
      &&this.race.status==='racing'&&!SdkUtils.isFullscreenAdBusy()&&gameStorage.getMusic()!==1;
    if(allowed){if(!this.music.playing)this.music.play();}
    else if(this.music.playing)this.music.pause();
  }
  private startSound():void {
    this.syncMusic();
  }
  protected update(dt:number):void {
    this.syncMusic();
    if(this.hidden||this.leaving||this.race.paused||this.adInFlight||SdkUtils.isRewardedVideoBusy())return;
    if(this.race.status!=='racing')return;
    dt=Math.min(dt,.1);
    if(this.countdown>0){this.countdown=Math.max(0,this.countdown-dt);this.countdownLabel.string=this.countdown>0?String(Math.ceil(this.countdown)):'出发！';}
    else {
      this.countdownLabel.string=this.race.elapsed<.65?'出发！':'';
      const steer=this.touchId!==null?this.touchSteer:(Number(this.keys.has(KeyCode.KEY_D)||this.keys.has(KeyCode.ARROW_RIGHT))-Number(this.keys.has(KeyCode.KEY_A)||this.keys.has(KeyCode.ARROW_LEFT)));
      let remaining=dt;while(remaining>0){const step=Math.min(remaining,1/60);this.race.tick(step,steer);remaining-=step;}
      if(this.hitSerial!==this.race.hitSerial){this.hitSerial=this.race.hitSerial;this.messageLabel.string=this.race.lastHit;this.messageTime=1;
        if(AudioManager.canPlaySound())this.hitSound.play();}
      this.messageTime=Math.max(0,this.messageTime-dt);
      if(this.messageTime===0)this.messageLabel.string=this.race.fallen>0?'倒地！正在起身…':this.race.warningTime>0?this.race.warning:this.race.elapsed<7?'按住左半屏向左，右半屏向右':'';
      if(this.race.status!=='racing'){this.music?.pause();this.clearInput();this.showOverlay();}
    }
    this.renderer.render(this.race);this.refreshHud();
  }
  private setText(label:Label,text:string):void {if(label.string!==text)label.string=text;}
  private refreshHud():void {
    const r=this.race;
    this.boostButton.interactable=!this.adInFlight&&!this.hidden&&!r.paused&&!r.fallen&&this.countdown===0&&r.status==='racing'&&r.boostRemaining===0;
    this.setText(this.boostTitle,this.adInFlight?'稍候':r.boostRemaining>0?'冲刺':'加速');
    this.boostBadge.active=r.boostRemaining===0;
    this.boostDetail.node.active=this.adInFlight||r.boostRemaining>0;
    this.setText(this.boostDetail,this.adInFlight?'广告加载中':r.boostRemaining>0?`剩余 ${Math.ceil(r.boostRemaining)}米`:'');
    this.setText(this.rankLabel,`第${r.rank}名`);this.setText(this.armorLabel,`体力 ${Math.ceil(r.armor/34)} / 3\n击倒 ×${r.knockouts}`);
    this.setText(this.speedLabel,`${Math.round(r.speed)} km/h`);this.setText(this.timeLabel,`${r.elapsed.toFixed(1)} 秒`);
    this.setText(this.distanceLabel,`里程 ${Math.floor(r.distance)} / ${RACE_LENGTH} 米`);
    const g=this.hud;g.clear();
    const rect=(c:Color,x:number,y:number,w:number,h:number)=>{g.fillColor=c;g.roundRect(x,y,w,h,8);g.fill();};
    rect(new Color(29,51,63,150),-340,463,283,174);
    rect(new Color(56,76,83,150),-177,418,354,25);rect(new Color(255,211,79),-161,427,Math.max(2,322*r.distance/RACE_LENGTH),6);
    for(let i=0;i<3;i++)rect(new Color(i<Math.ceil(r.armor/34)?75:50,i<Math.ceil(r.armor/34)?205:92,i<Math.ceil(r.armor/34)?81:74),-156+i*25,602,20,13);
    g.strokeColor=new Color(244,247,250,95);g.lineWidth=2;
    for(const [x,y,radius] of [[-259,-443,61],[-259,-589,61]]){g.fillColor=new Color(225,231,237,28);g.circle(x,y,radius);g.fill();g.circle(x,y,radius);g.stroke();}
    if(r.attackCooldown>0){g.strokeColor=new Color(255,224,146,180);g.lineWidth=3;const y=r.attackKind==='kick'?-589:-443;g.arc(-259,y,64,0,Math.PI*2*Math.min(1,r.attackCooldown/.7),false);g.stroke();}
  }
  protected onDestroy():void {
    this.disposed=true;this.roundSerial++;
    // Child components may be destroyed before this scene controller.
    if(this.boostButton?.node?.isValid)this.boostButton.node.off(Button.EventType.CLICK,this.rewardBoost,this);
    view.off('canvas-resize',this.fit,this); input.off(Input.EventType.KEY_DOWN,this.keyDown,this);input.off(Input.EventType.KEY_UP,this.keyUp,this);
    game.off(Game.EVENT_HIDE,this.hide,this);game.off(Game.EVENT_SHOW,this.show,this);if(this.music?.isValid)this.music.stop();this.releaseMusic?.();this.art?.destroy();
  }
}
