import {_decorator,AudioSource,Button,Color,Component,EventTouch,game,Game,Graphics,Label,Node,ResolutionPolicy,UITransform,Vec3,view} from 'cc';
import {ClayPigeonRound,Disc} from './clayPigeonRules';
import {GameSceneBundle,GameSceneName} from './framework/GameSceneBundle';
import {FeedAcquisitionService,FeedAcquisitionState} from './framework/Platform/FeedAcquisitionService';
import {adc} from './framework/Platform/ADController';
import {SdkUtils} from './framework/Platform/sdk/SdkUtils';
import AudioManager from './framework/AudioManager';
import gameStorage from './framework/gameStorage';
const {ccclass,property}=_decorator;
const PALETTE=[[233,102,154],[235,160,53],[230,202,79],[95,187,156],[109,167,195],[173,141,194]];
interface Chip{x:number;y:number;vx:number;vy:number;life:number;color:number;spin:number;}
@ccclass('clayPigeonGameScene')
export class clayPigeonGameScene extends Component {
 @property(Node) layoutRoot:Node=null;
 @property(Node) aimSurface:Node=null;
 @property(Node) gun:Node=null;
 @property(Graphics) drawing:Graphics=null;
 @property(Label) clock:Label=null;
 @property(Label) roundLabel:Label=null;
 @property(Label) comboLabel:Label=null;
 @property(Label) tip:Label=null;
 @property(Label) statusLabel:Label=null;
 @property(Label) ammoLabel:Label=null;
 @property(Label) spawnedLabel:Label=null;
 @property(Label) hitsLabel:Label=null;
 @property(Label) accuracyLabel:Label=null;
 @property(Button) pauseButton:Button=null;
 @property(Node) resultOverlay:Node=null;
 @property(Label) resultTitle:Label=null;
 @property(Label) resultDetail:Label=null;
 @property(Button) resumeButton:Button=null;
 @property(Button) replayButton:Button=null;
 @property(Button) homeButton:Button=null;
 @property(AudioSource) shotAudio:AudioSource=null;
 @property(AudioSource) hitAudio:AudioSource=null;
 round=new ClayPigeonRound();private aim={x:0,y:150};private chips:Chip[]=[];
 private gunScale=1;private recoil=0;private flash=0;private roundAge=0;private touchId:number|null=null;
 private paused=false;private hidden=false;private leaving=false;private disposed=false;
 private feed=false;private entered=true;private exited=false;private adScheduled=false;private complete=false;
 private releaseMusic:()=>void;
 protected onLoad(){
  view.setDesignResolutionSize(750,1624,ResolutionPolicy.FIXED_WIDTH);this.fit();view.on('canvas-resize',this.fit,this);
  this.releaseMusic=AudioManager.acquireSceneMusic();
  FeedAcquisitionService.init();this.feed=FeedAcquisitionService.isActive();const state=FeedAcquisitionService.getState();this.entered=!this.feed||state.entered;this.exited=this.feed&&state.exited;
  FeedAcquisitionService.addListener(this.feedChanged);
  this.aimSurface.on(Node.EventType.TOUCH_START,this.touchStart,this);this.aimSurface.on(Node.EventType.TOUCH_MOVE,this.touchMove,this);this.aimSurface.on(Node.EventType.TOUCH_END,this.touchEnd,this);this.aimSurface.on(Node.EventType.TOUCH_CANCEL,this.touchEnd,this);
  this.pauseButton.node.on(Button.EventType.CLICK,this.pause,this);
  this.resumeButton.node.on(Button.EventType.CLICK,this.resume,this);this.replayButton.node.on(Button.EventType.CLICK,this.restart,this);this.homeButton.node.on(Button.EventType.CLICK,this.home,this);
  game.on(Game.EVENT_HIDE,this.hide,this);game.on(Game.EVENT_SHOW,this.show,this);this.refresh();this.draw();
 }
 protected start(){if(this.feed){void FeedAcquisitionService.reportSceneReadyAfterStableRender({owner:this.node,requiredVisibleNodes:[this.layoutRoot,this.gun],stableFrameCount:3,surfaceDelayMs:180,isReady:()=>!this.disposed&&!this.leaving&&!this.exited});this.scheduleAd();}}
 private fit=()=>{const s=view.getVisibleSize();const scale=Math.min(s.width/750,s.height/1334);this.layoutRoot.setScale(scale,scale,1);this.gunScale=Math.max(1,s.height/1334);this.gun.setScale(this.gunScale,this.gunScale,1);};
 private blocked(){return this.disposed||this.leaving||this.hidden||this.paused||(this.feed&&(!this.entered||this.exited))||SdkUtils.isFullscreenAdBusy();}
 private feedChanged=(s:FeedAcquisitionState)=>{if(!this.feed)return;this.entered=s.entered;this.exited=s.exited;if(!s.entered||s.exited){adc.cancelFeedEntryInterstitial();this.adScheduled=false;this.touchId=null;this.shotAudio.stop();this.hitAudio.stop();}else this.scheduleAd();};
 private scheduleAd(){if(!this.feed||!this.entered||this.exited||this.adScheduled||this.complete)return;this.adScheduled=true;adc.scheduleFeedEntryInterstitial(()=>!this.disposed&&!this.leaving&&this.feed&&this.entered&&!this.exited);}
 private finishFeed(){if(!this.feed||this.complete)return;this.complete=true;this.feed=false;this.entered=true;this.exited=false;adc.cancelFeedEntryInterstitial();FeedAcquisitionService.completeSession();}
 private touchStart=(e:EventTouch)=>{if(this.feed&&!this.entered)FeedAcquisitionService.activateFromFirstTouch();if(this.blocked()||this.touchId!==null||this.round.phase!=='playing')return;this.touchId=e.getID();this.setAim(e);};
 private touchMove=(e:EventTouch)=>{if(e.getID()===this.touchId&&!this.blocked())this.setAim(e);};
 private touchEnd=(e:EventTouch)=>{if(e.getID()===this.touchId)this.touchId=null;};
 private setAim(e:EventTouch){const p=e.getUILocation();const local=this.layoutRoot.getComponent(UITransform).convertToNodeSpaceAR(new Vec3(p.x,p.y));this.aim.x=Math.max(-345,Math.min(345,local.x));this.aim.y=Math.max(-120,Math.min(430,local.y));}
 protected update(dt:number){
  if(this.blocked())return;dt=Math.min(.05,dt);this.roundAge+=dt;
  this.round.step(dt);const hit=this.round.aim(this.aim.x,this.aim.y);if(hit.length)this.fire(hit);
  if(this.round.phase==='between')this.next();
  this.recoil=Math.max(0,this.recoil-dt*6);this.flash=Math.max(0,this.flash-dt);
  for(const c of this.chips){c.life-=dt;c.x+=c.vx*dt;c.y+=c.vy*dt;c.vy-=420*dt;c.spin+=dt*9;}this.chips=this.chips.filter(c=>c.life>0);
  this.gun.setPosition((165+this.aim.x*.32)*this.gunScale,(-365+this.aim.y*.1-this.recoil*26)*this.gunScale,0);this.gun.angle=-this.aim.x*.018+this.recoil*3;
  this.refresh();this.draw();
 }
 private fire(hits:Disc[]){this.recoil=1;this.flash=.07;if(gameStorage.getSound()!==1){this.shotAudio.play();this.hitAudio.play();}
  for(const d of hits)for(let i=0;i<9;i++){const angle=i*Math.PI*2/9;this.chips.push({x:d.x,y:d.y,vx:Math.cos(angle)*(70+i*9),vy:Math.sin(angle)*160+70,life:.45+(i%3)*.1,color:d.color,spin:angle});}
 }
 private refresh(){
  const r=this.round,seconds=Math.floor(r.elapsed);this.clock.string=`${('0'+Math.floor(seconds/60)).slice(-2)}:${('0'+seconds%60).slice(-2)}`;
  this.roundLabel.string=`第 ${('0'+(r.round+1)).slice(-2)} / 10 轮`;
  this.comboLabel.string=`连中 ${r.combo}    命中 ${r.totalHits}`;
  this.tip.string=this.roundAge<3.2?`第 ${r.round+1} 轮\n${r.config.tip}`:'';
  this.statusLabel.string=r.phase==='between'?'本轮完成':'瞄准自动射击';this.ammoLabel.string=`弹药 ${r.ammo} · 命中 ${r.hits}/${r.config.count}`;
  this.spawnedLabel.string=`${r.spawned} / ${r.config.count}`;this.hitsLabel.string=`${r.hits} / ${r.config.count}`;this.accuracyLabel.string=`${r.shots?r.accuracy+'%':'—'}`;
 }
 private draw(){
  const g=this.drawing;g.clear();
  for(const d of this.round.discs){if(!d.alive)continue;const [r,b,c]=PALETTE[d.color],ry=d.radius*(.58+.12*Math.sin(d.age*6));
   g.fillColor=new Color(r*.62,b*.62,c*.62);g.ellipse(d.x,d.y-6,d.radius,ry);g.fill();
   g.fillColor=new Color(r,b,c);g.ellipse(d.x,d.y,d.radius,ry);g.fill();
   g.lineWidth=2;g.strokeColor=new Color(Math.min(255,r+44),Math.min(255,b+44),Math.min(255,c+44),210);g.ellipse(d.x,d.y+2,d.radius*.78,ry*.77);g.stroke();
   g.strokeColor=new Color(255,255,255,100);g.ellipse(d.x,d.y+3,d.radius*.64,ry*.62);g.stroke();
  }
  for(const c of this.chips){const rgb=PALETTE[c.color];g.fillColor=new Color(...rgb as [number,number,number],Math.min(255,c.life*510));g.moveTo(c.x,c.y);g.lineTo(c.x+Math.cos(c.spin)*10,c.y+Math.sin(c.spin)*10);g.lineTo(c.x-5,c.y+7);g.close();g.fill();}
  const {x,y}=this.aim;
  // Filled arms keep the reticle crisp over both pale sky and colored clays.
  g.fillColor=new Color(30,51,56,235);this.cross(g,x,y,8);g.circle(x,y,4);g.fill();
  g.fillColor=new Color(255,255,255,255);this.cross(g,x,y,4);g.circle(x,y,2);g.fill();
  if(this.flash>0){g.strokeColor=new Color(255,233,148,200);g.lineWidth=3;g.circle(x,y,22);g.stroke();}
 }
 private cross(g:Graphics,x:number,y:number,width:number){for(const sign of [-1,1]){g.rect(x+(sign<0?-24:8),y-width/2,16,width);g.rect(x-width/2,y+(sign<0?-24:8),width,16);}g.fill();}
 private next=()=>{if(this.blocked()||this.round.phase!=='between')return;this.round.next();this.roundAge=0;if(this.round.phase as string==='success'||this.round.phase as string==='failure')this.result();this.refresh();};
 private result(){const r=this.round;this.resultTitle.string=r.phase==='success'?'挑战成功':'挑战失败';this.resultDetail.string=`命中 ${r.totalHits} / 380\n最高连击 ${r.bestCombo} · 命中率 ${r.accuracy}%\n用时 ${Math.floor(r.elapsed)} 秒`;this.resumeButton.node.active=false;this.resultOverlay.active=true;this.paused=true;this.finishFeed();}
 private pause=()=>{if(this.blocked())return;this.paused=true;this.touchId=null;this.resultTitle.string='比赛暂停';this.resultDetail.string=`第 ${this.round.round+1} / 10 轮\n累计命中 ${this.round.totalHits} 碟`;this.resumeButton.node.active=true;this.resultOverlay.active=true;};
 private resume=()=>{if(this.hidden||this.leaving||SdkUtils.isFullscreenAdBusy())return;this.resultOverlay.active=false;this.paused=false;};
 private restart=()=>{if(this.leaving||SdkUtils.isFullscreenAdBusy())return;this.round=new ClayPigeonRound();this.chips=[];this.roundAge=0;this.recoil=0;this.flash=0;this.touchId=null;this.aim={x:0,y:150};this.resultOverlay.active=false;this.paused=false;this.refresh();this.draw();};
 private home=async()=>{if(this.leaving)return;this.leaving=true;this.finishFeed();try{await GameSceneBundle.loadScene(GameSceneName.Main);}catch{this.leaving=false;}};
 private hide=()=>{this.hidden=true;this.touchId=null;this.shotAudio.stop();this.hitAudio.stop();};
 private show=()=>{this.hidden=false;};
 protected onDestroy(){this.disposed=true;view.off('canvas-resize',this.fit,this);game.off(Game.EVENT_HIDE,this.hide,this);game.off(Game.EVENT_SHOW,this.show,this);FeedAcquisitionService.removeListener(this.feedChanged);this.finishFeed();this.releaseMusic?.();}
}
