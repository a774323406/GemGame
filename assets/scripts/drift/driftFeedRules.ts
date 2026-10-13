import {driftViewport,roadBounds,overlaps} from './driftRoadVisibility';
import {DriftSourceRules} from './DriftSourceRules';
import {driftFeel} from './driftSourceConfig';
import { SlingDriftMotion, SlingDriftPin, SlingDriftState } from './SlingDriftMotion';
import { TrackRuntime, AnchorPoint } from './TrackRuntime';
export type DriftPhase = 'ready' | 'driving' | 'crashing' | 'result' | 'reviving';
export type DriftFeedEvent = {type:'attach'|'detach'|'curve'|'boost-start'|'boost-end'|'crash'|'revive'|'result'|'theme'; x:number;y:number;value:number};
export type DriftFeedSnapshot = {phase:DriftPhase;car:SlingDriftState;progress:number;curves:number;revivesRemaining:number;themeIndex:number;bursting:boolean;drifting:boolean;roadLayer:number;targetSpeed:number;countdown:number;pin:SlingDriftPin|null;boostStart:number;boostEnd:number};
export const baseSpeedMultiplier=(curves:number):number=>1+Math.max(0,Math.min(1,(curves-6)/59))*.4;
const BASE_SPEED=560, STEP=1/60;
export class DriftFeedRun {
 readonly track=new TrackRuntime({sampleStep:20,viewBehind:980,viewAhead:1760,driftEnterLead:120,driftExitDelay:20,getRoadHalfWidth:()=>165,canCreateRoad:p=>this.canStreamRoad(p)});
 readonly snapshot:DriftFeedSnapshot={phase:'ready',car:{x:0,y:0,velocityX:0,velocityY:BASE_SPEED,heading:0},progress:0,curves:0,revivesRemaining:2,themeIndex:0,bursting:false,drifting:false,roadLayer:0,targetSpeed:BASE_SPEED,countdown:0,pin:null,boostStart:-1,boostEnd:-1};
 viewportHeight=1624;
 private canStreamRoad(piece:import('./TrackRuntime').EndlessRoadVisual):boolean{
  return this.snapshot.phase==='ready'||!overlaps(roadBounds(piece),this.streamingBounds);
 }
 prepareRoads():void{
  const s=this.snapshot,look=this.track.getTrackPoint(s.progress+240);
  this.streamingBounds=driftViewport(s.car,look,this.viewportHeight);
  this.track.ensureTrack(s.progress+6000,s.progress);
  const reserve=driftViewport(s.car,look,this.viewportHeight,2400);
  for(let i=0;i<32;i++){
   const tiles=this.track.getEndlessRoadVisuals(),tail=tiles[tiles.length-1];
   if(!tail||!overlaps(roadBounds(tail),reserve))break;
   this.track.ensureTrack(tail.endS+1800,s.progress);
   if(this.track.getEndlessRoadVisuals()[this.track.getEndlessRoadVisuals().length-1].id===tail.id)break;
  }
 }
 private streamingBounds={left:0,right:0,bottom:0,top:0};
 readonly source=new DriftSourceRules(this.track,this.snapshot.car);
 private motion=new SlingDriftMotion();
 private events:DriftFeedEvent[]=[];
 private pressed=false;
 private active:AnchorPoint|null=null;
 private clock=0;
 private counted=0;
 constructor(seed:number){this.restart(seed);}
 start():void {if(this.snapshot.phase==='ready')this.snapshot.phase='driving';}
 setPressed(pressed:boolean):void {
  if(this.snapshot.phase!=='driving'&&this.snapshot.phase!=='ready')return;
  if(pressed&&this.track.speedStages.some(z=>this.snapshot.progress>=z.startS&&this.snapshot.progress<z.endS))return;
  if(pressed&&!this.pressed){
   this.start();this.source.progress=this.snapshot.progress;
   this.active=this.source.findAutoAnchor();this.source.activeAnchor=this.active;
   if(this.active){this.source.recentAnchor=this.active;this.snapshot.pin=this.pinFor(this.active);this.emit('attach');}
  }
  if(!pressed&&this.active){
   const attached=this.motion.isAttached();
   if(attached)this.motion.release(this.snapshot.car);else this.motion.detach();
   this.source.recentAnchor=attached?this.active:null;this.source.activeAnchor=null;
   this.active=null;this.snapshot.pin=null;this.emit('detach');
  }
  this.pressed=pressed;
 }
 restart(seed:number):void {
  this.snapshot.phase='ready';this.track.resetEndless(seed,1200);this.track.ensureTrack(6000,140);this.motion.reset();
  this.motion.configure({fixedStep:STEP,defaultVelocity:BASE_SPEED,radiusMin:driftFeel.radiusMinScale*BASE_SPEED/8,radiusMax:driftFeel.radiusMaxScale*BASE_SPEED/8,radiusSpeedMax:driftFeel.radiusSpeedMax,turnValue:driftFeel.velocityFollowRate,recoveryTurnValue:driftFeel.recoveryTurnValue,angularDrag:driftFeel.angularDrag,attachedTurnValue:driftFeel.attachedTurnValue,driftAngle:driftFeel.driftAngleDeg*Math.PI/180,transitionAngleMax:driftFeel.transitionAngleMaxDeg*Math.PI/180,pushbackSpeedRatio:driftFeel.pushbackSpeedRatio,maxSubSteps:4});
  Object.assign(this.snapshot,{phase:'ready',progress:140,curves:0,revivesRemaining:2,themeIndex:0,bursting:false,drifting:false,roadLayer:0,targetSpeed:BASE_SPEED,countdown:0,pin:null,boostStart:-1,boostEnd:-1});
  Object.assign(this.snapshot.car,{x:0,y:140,velocityX:0,velocityY:BASE_SPEED,heading:0});
  this.source.activeAnchor=null;this.source.recentAnchor=null;this.source.progress=140;this.track.setProgress(140);this.events=[];this.clock=0;this.counted=0;this.pressed=false;this.active=null;this.prepareRoads();
 }
 drainEvents():DriftFeedEvent[]{return this.events.splice(0);}
 private emit(type:DriftFeedEvent['type'],value=0):void{this.events.push({type,x:this.snapshot.car.x,y:this.snapshot.car.y,value});}
 crash():void {
  if(this.snapshot.phase!=='driving')return;
  this.snapshot.phase='crashing';this.snapshot.drifting=false;this.clock=0;this.pressed=false;this.active=null;this.snapshot.pin=null;this.motion.detach();
  if(this.snapshot.bursting)this.emit('boost-end');this.snapshot.bursting=false;this.emit('crash');
 }
 revive():boolean {
  const s=this.snapshot;if(s.phase!=='result'||s.revivesRemaining<=0)return false;
  const p=this.track.getReviveTrackPoint(s.progress);
  s.roadLayer=p.layer||0;s.drifting=false;s.progress=p.s;Object.assign(s.car,{x:p.x,y:p.y,heading:Math.atan2(p.tx,p.ty),velocityX:0,velocityY:0});
  s.revivesRemaining--;s.phase='reviving';s.countdown=3;s.boostStart=-1;s.boostEnd=-1;s.bursting=false;s.pin=null;
  this.motion.reset();this.pressed=false;this.active=null;this.source.activeAnchor=null;this.source.recentAnchor=null;this.source.progress=s.progress;this.clock=0;this.emit('revive');return true;
 }
 update(dt:number):void {
  if(!Number.isFinite(dt)||dt<=0)return;
  const elapsed=dt;dt=Math.min(dt,1/30);const s=this.snapshot;
  if(s.phase==='crashing'){this.clock+=dt;if(this.clock>=.8-1e-8){s.phase='result';this.emit('result');}return;}
  if(s.phase==='reviving'){s.countdown=Math.max(0,s.countdown-elapsed);if(s.countdown<=1e-8){s.phase='driving';s.countdown=0;}return;}
  if(s.phase!=='driving')return;
  this.step(dt);
 }
 private step(dt:number):void {
  const s=this.snapshot,c=s.car;
  this.prepareRoads();this.source.progress=s.progress;
  if(this.source.isCarTouchingRoadEdgeAt(c.x,c.y,s.progress,c.heading)){this.crash();return;}
  const previousX=c.x,previousY=c.y,previousProgress=s.progress;
  const before=this.track.findClosestTrackPoint(c.x,c.y,s.progress);
  const stage=this.track.speedStages.find(z=>s.progress>=z.startS&&s.progress<z.endS);
  const burst=!!stage&&s.progress<stage.midS;
  if(burst!==s.bursting){s.bursting=burst;this.emit(burst?'boost-start':'boost-end');}
  s.boostStart=stage?.startS??-1;s.boostEnd=stage?.endS??-1;
  s.targetSpeed=BASE_SPEED*baseSpeedMultiplier(s.curves)*(burst?4:1);
  if(stage){
   this.motion.detach();this.active=null;this.source.activeAnchor=null;s.pin=null;s.drifting=false;
   const ray=this.track.getTrackPoint(stage.startS),distance=(c.x-ray.x)*ray.tx+(c.y-ray.y)*ray.ty;
   const blend=Math.min(1,dt*3*(burst?1:2)),centering=Math.min(1,dt*10);
   c.velocityX+=(ray.tx*s.targetSpeed-c.velocityX)*blend;c.velocityY+=(ray.ty*s.targetSpeed-c.velocityY)*blend;
   c.velocityX+=(ray.x+ray.tx*distance-c.x)*centering;c.velocityY+=(ray.y+ray.ty*distance-c.y)*centering;
   c.x+=c.velocityX*dt;c.y+=c.velocityY*dt;c.heading=Math.atan2(ray.tx,ray.ty);
  }else{
   s.pin=this.active?this.pinFor(this.active):null;
   const constraint=s.pin&&(this.motion.isAttached()||this.source.canAttachSlingConstraintAt(this.active,s.pin,c.x,c.y,s.progress))?s.pin:null;
   this.motion.configure({defaultVelocity:s.targetSpeed});this.motion.update(c,constraint,dt);s.drifting=this.motion.isAttached();
  }
  const forward=Math.max(0,(c.x-previousX)*before.tx+(c.y-previousY)*before.ty);
  if(this.source.isCarPathTouchingRoadEdge(previousX,previousY,c.x,c.y,previousProgress,previousProgress+forward,c.heading)){this.crash();return;}
  const closest=this.source.findClosestTrackPointNearProgress(c.x,c.y,s.progress,140,360);
  s.progress=Math.max(s.progress-40,closest.s);this.track.setProgress(s.progress);this.source.progress=s.progress;
  s.roadLayer=this.track.getTrackPoint(s.progress).layer||0;
  const count=this.track.getPassedCurveCount();
  if(count>this.counted){s.curves+=count-this.counted;this.counted=count;this.emit('curve',s.curves);}
  const theme=this.track.speedStages.filter(z=>s.progress>=z.midS).slice(-1)[0]?.theme??0;
  if(theme!==s.themeIndex){s.themeIndex=theme;this.emit('theme',theme);}
  if(this.source.isCarTouchingRoadEdgeAt(c.x,c.y,s.progress,c.heading))this.crash();
 }

 pinFor(anchor:AnchorPoint):SlingDriftPin {
  const point=this.source.anchorWorldPoint(anchor),exit=this.track.getTrackPoint(anchor.recoverS);
  return {...point,turnSign:anchor.offset<0?1:-1,exitHeading:Math.atan2(exit.tx,exit.ty)};
 }
}
