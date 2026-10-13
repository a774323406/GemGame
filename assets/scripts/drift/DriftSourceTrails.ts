// Particle and rear-wheel geometry copied from the user's drift controller.
import {TrackSample} from './TrackRuntime';
import {DriftFeedSnapshot} from './driftFeedRules';
type TrailPoint={x:number;y:number};
const rgba=(r:number,g:number,b:number,a:number)=>({r,g,b,a});
export class DriftSourceTrails {
 readonly carWidth=125;readonly carHeight=238;readonly racingMode=false;
 marks:{startX:number;startY:number;endX:number;endY:number;width:number;life:number;layer?:number}[]=[];
 particles:{x:number;y:number;vx:number;vy:number;radius:number;endRadius?:number;life:number;maxLife:number;color:{r:number;g:number;b:number;a:number};shape?:string;layer?:number}[]=[];
 playerTrailLeftPoint:TrailPoint|null=null;playerTrailRightPoint:TrailPoint|null=null;
 layer=0;markTimer=0;particleTimer=0;carX=0;carY=0;heading=0;visualTailOffset=0;progress=0;bursting=false;
 getActiveCarScale(){return .58;}
 findPositiveSpeedStage(_s:number,_kind:string){return this.bursting?true:null;}
 emit(s:DriftFeedSnapshot,dt:number):void{
  this.layer=s.roadLayer;this.carX=s.car.x;this.carY=s.car.y;this.heading=s.car.heading;this.bursting=s.bursting;
  if(s.phase!=='driving'){this.resetPlayerDriftTrail();return;}
  if(s.drifting)this.emitDriftEffects(null,dt);else this.emitSpeedTrail(dt);
 }
 update(dt:number):void{
  for(let i=this.marks.length-1;i>=0;i--){this.marks[i].life-=dt*.055;if(this.marks[i].life<=0)this.marks.splice(i,1);}
  for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.life<=0)this.particles.splice(i,1);}
 }
 reset():void{this.marks.length=0;this.particles.length=0;this.resetPlayerDriftTrail();this.particleTimer=0;}
  driftWheelPoints(
    x: number,
    y: number,
    heading: number,
    scale: number,
  ): { left: TrailPoint; right: TrailPoint; rear: TrailPoint; forwardX: number; forwardY: number } {
    const forwardX = Math.sin(heading);
    const forwardY = Math.cos(heading);
    const rightX = Math.cos(heading);
    const rightY = -Math.sin(heading);
    const rearDistance = this.carHeight * scale * 0.31;
    const halfAxleWidth = this.carWidth * scale * 0.23;
    const rearX = x - forwardX * rearDistance;
    const rearY = y - forwardY * rearDistance;
    return {
      left: {
        x: rearX - rightX * halfAxleWidth,
        y: rearY - rightY * halfAxleWidth,
      },
      right: {
        x: rearX + rightX * halfAxleWidth,
        y: rearY + rightY * halfAxleWidth,
      },
      rear: { x: rearX, y: rearY },
      forwardX,
      forwardY,
    };
  }

  appendDriftMark(
    previous: TrailPoint | null,
    current: TrailPoint,
    life = 1,
    width = 5.2,
  ): void {
    if (!previous) {
      return;
    }

    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    // 过短的段没有视觉贡献；过长则通常意味着复活、重置或车辆瞬移，不能跨屏连线。
    if (distance < 1 || distance > 95) {
      return;
    }

    this.marks.push({
      layer:this.layer,startX: previous.x,
      startY: previous.y,
      endX: current.x,
      endY: current.y,
      width,
      life,
    });
  }

  resetPlayerDriftTrail(): void {
    this.playerTrailLeftPoint = null;
    this.playerTrailRightPoint = null;
    this.markTimer = 0;
  }

  emitDriftEffects(_center: TrackSample, dt: number): void {
    this.markTimer -= dt;
    this.particleTimer -= dt;
    const wheels = this.driftWheelPoints(
      this.carX,
      this.carY,
      this.heading + this.visualTailOffset,
      this.getActiveCarScale(),
    );

    if (this.markTimer <= 0) {
      this.markTimer = 0.028;
      this.appendDriftMark(this.playerTrailLeftPoint, wheels.left);
      this.appendDriftMark(this.playerTrailRightPoint, wheels.right);
      this.playerTrailLeftPoint = wheels.left;
      this.playerTrailRightPoint = wheels.right;
      const maxMarks = this.racingMode ? 520 : 320;
      while (this.marks.length > maxMarks) {
        this.marks.shift();
      }
    }

    if (this.particleTimer <= 0) {
      this.particleTimer = 0.042;
      for (let i = 0; i < 2; i++) {
        const life = 0.7 + Math.random() * 0.28;
        const sideOffset = (Math.random() - 0.5) * 34;
        const smokeShade = 172 + Math.floor(Math.random() * 42);
        this.particles.push({layer:this.layer,
          x: wheels.rear.x + Math.cos(this.heading) * sideOffset + (Math.random() - 0.5) * 10,
          y: wheels.rear.y - Math.sin(this.heading) * sideOffset + (Math.random() - 0.5) * 10,
          vx: -wheels.forwardX * (14 + Math.random() * 24) + (Math.random() - 0.5) * 24,
          vy: -wheels.forwardY * (14 + Math.random() * 24) + (Math.random() - 0.5) * 24,
          radius: 9 + Math.random() * 6,
          endRadius: 32 + Math.random() * 20,
          life,
          maxLife: life,
          color: rgba(smokeShade, smokeShade, smokeShade - 4, 78 + Math.random() * 24),
          shape: "smoke",
        });
      }
    }
  }

  emitSpeedTrail(dt: number): void {
    this.resetPlayerDriftTrail();
    this.particleTimer -= dt;
    const bursting = this.findPositiveSpeedStage(this.progress, "burst") != null;
    // 原版普通行驶不会持续喷蓝色圆点；只有爆冲阶段保留速度粒子。
    if (!bursting || this.particleTimer > 0) {
      if (!bursting) {
        this.particleTimer = 0;
      }
      return;
    }

    this.particleTimer = 0.026;
    const count = 3;
    for (let i = 0; i < count; i++) {
      const life = 0.7 + Math.random() * 0.22;
      const spread = 28;
      const backwardSpeed = 105 + Math.random() * 65;
      this.particles.push({layer:this.layer,
        x: this.carX - Math.sin(this.heading) * 50 + (Math.random() - 0.5) * spread,
        y: this.carY - Math.cos(this.heading) * 50 + (Math.random() - 0.5) * spread,
        vx: -Math.sin(this.heading) * backwardSpeed + (Math.random() - 0.5) * spread,
        vy: -Math.cos(this.heading) * backwardSpeed + (Math.random() - 0.5) * spread,
        radius: 4 + Math.random() * 7,
        life,
        maxLife: life,
        color: rgba(185, 239, 255, 125),
      });
    }
  }

}
