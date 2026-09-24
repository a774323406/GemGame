/** Pure race simulation. Distances are metres, speed is km/h, road edges are ±1. */
export const MAX_SPEED = 240;
export const RACE_LENGTH = 10000;
export const RIDER_VIEW_DISTANCE = 150;
export type Attack = 'punch' | 'kick';
export interface MotoRider {
  id: number; x: number; distance: number; speed: number; armor: number;
  fallen: number; attackCooldown: number; hitFlash: number; steer?: number; combatTime?: number; trafficCooldown?: number;
  attackPhase?: 'windup'|'swing'; windupTime?: number; combatTarget?: number; hitImmunity?: number;
  laneTarget?: number; avoidCarId?: number;
  revengeLeft?: number; revengePhase?: 'chase'|'windup'|'swing'|'cooldown'|'done';
  revengeTimer?: number; attackTime?: number; attackSide?: number; strikeResolved?: boolean;
}
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function roadCurve(distance: number): number {
  return Math.sin(distance / 470) * .55 + Math.sin(distance / 230) * .22;
}
/** Shared projection: combat volumes use the same image positions as the renderer. */
export function projectRoad(z:number,r:{x:number;distance:number}):{x:number;y:number;s:number;w:number} {
  const s=30/(30+z);
  return {x:-r.x*90*s+(roadCurve(r.distance+z)-roadCurve(r.distance))*330*(1-s),y:15-850*s,s,w:620*s};
}
export function riderVisibility(gap:number):number {
  return clamp((RIDER_VIEW_DISTANCE-gap)/30,0,1);
}
export interface MotoCar { id:number; x:number; distance:number; speed:number; kind?:number; }
// Contact centres measured on the 256px atlas, relative to the tyre anchor (128,237).
// Expanded torso rectangle + swept limb segment gives a small forgiving hit capsule.
export function strikeTouches(kind:Attack,side:number,r:{x:number;distance:number},b:MotoRider):boolean {
  if(b.fallen || Math.abs(b.distance-r.distance)>10) return false;
  const p=projectRoad(24,r), q=projectRoad(b.distance-r.distance+24,r), scale=q.s*1.8;
  const dx=q.x+b.x*q.w-(p.x+r.x*p.w), dy=q.y-p.y;
  if(dx*side<=0) return false;
  const x0=side*(kind==='kick'?25:30), y0=kind==='kick'?99:135;
  const x1=side*(kind==='kick'?104:80), y1=kind==='kick'?109:145;
  const radius=kind==='kick'?16:14;
  const bounds=[[dx-34*scale-radius,dx+34*scale+radius,x0,x1-x0],
    [dy+90*scale-radius,dy+164*scale+radius,y0,y1-y0]];
  let lo=0,hi=1;
  for(const [min,max,start,delta] of bounds) {
    if(Math.abs(delta)<.001) {if(start<min||start>max)return false;continue;}
    const a=(min-start)/delta,b=(max-start)/delta;
    lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));
  }
  return lo<=hi;
}
export function aggressionForRank(rank:number):{cooldown:number;windup:number;range:number} {
  if(rank<=3)return {cooldown:1.8,windup:.35,range:10};
  if(rank<=6)return {cooldown:2.8,windup:.45,range:8};
  if(rank<=9)return {cooldown:4,windup:.55,range:6};
  return {cooldown:5.5,windup:.65,range:4};
}
export class MotoRace {
  boostRemaining=0;
  activateBoost():boolean {
    if(this.status!=='racing'||this.fallen>0||this.boostRemaining>0)return false;
    this.boostRemaining=600;this.speed=360;return true;
  }
  fallen=0; falls=0; aggressionEnabled=true;
  speed = 0; distance = 0; x = 0; armor = 100; elapsed = 0; knockouts = 0;
  paused = false; status: 'racing' | 'finished' | 'crashed' = 'racing';
  attackCooldown = 0; attackTime = 0; attackKind: Attack = 'punch'; attackSide = 1;
  combatTime = 0; private attackHit = false;
  cars: MotoCar[] = Array.from({length:18},(_,id)=>({id,kind:id%3,x:id%2?.62:-.62,distance:1150+id*870,speed:65+id%3*5}));
  warning=''; warningTime=0;
  invincible = 0; impact = 0; hitSerial = 0; lastHit = ''; steer = 0;
  riders: MotoRider[] = Array.from({ length: 11 }, (_, id) => ({
    id, x: [-.62, 0, .62][id % 3], distance: 32 + id * 22 + id * id * .95,
    speed: 0, armor: 100, fallen: 0,
    attackCooldown: 2 + id * .2, hitFlash: 0,
  }));
  get rank(): number { return 1 + this.riders.filter(r => r.distance > this.distance).length; }
  attack(kind: Attack): boolean {
    if (this.paused || this.status !== 'racing' || this.attackCooldown > 0 || this.fallen>0 || this.boostRemaining>0) return false;
    this.attackKind = kind; this.attackTime = .3; this.attackCooldown = kind === 'kick' ? .7 : .42;
    this.attackHit=false;
    const p=projectRoad(24,this),px=p.x+this.x*p.w;
    const target=this.riders.filter(b=>!b.fallen && Math.abs(b.distance-this.distance)<18 && Math.abs(b.x-this.x)<.9)
      .sort((a,b)=>Math.hypot((a.x-this.x)*344,(a.distance-this.distance)*8)-Math.hypot((b.x-this.x)*344,(b.distance-this.distance)*8))[0];
    if(target) {
      const q=projectRoad(target.distance-this.distance+24,this);
      this.attackSide=q.x+target.x*q.w>=px?1:-1;
    } else if(Math.abs(this.steer)>.1) this.attackSide=Math.sign(this.steer);
    this.speed=Math.max(0,this.speed-8);
    return true;
  }
  private resolveStrike():void {
    // Only extension frames can hit; moving away during the windup avoids the blow.
    if(this.attackHit || this.attackTime>.225 || this.attackTime<.075)return;
    const target=this.riders.filter(b=>strikeTouches(this.attackKind,this.attackSide,this,b))
      .sort((a,b)=>Math.abs(a.distance-this.distance)-Math.abs(b.distance-this.distance))[0];
    if(!target)return;
    this.attackHit=true;
    target.armor=Math.max(0,target.armor-(this.attackKind==='kick'?60:40));
    // Both lose speed. Brief equal acceleration keeps riders alongside for another exchange.
    const sharedSpeed=Math.max(0,Math.min(this.speed,target.speed)-8);
    this.speed=target.speed=sharedSpeed; this.combatTime=target.combatTime=1.1;
    target.hitFlash=.3;
    this.impact=.22;this.hitSerial++;this.lastHit=this.attackKind==='kick'?'踢中！':'命中！';
    if(target.armor<=0)this.knockDown(target);
  }
  private knockDown(target:MotoRider):void {
    if(target.fallen>0)return;
    target.armor=0;
      target.fallen=3;target.speed=0;target.attackTime=0;target.attackPhase=undefined;target.combatTarget=undefined;this.knockouts++;this.lastHit='击倒 +1';this.impact=.4;
      if(this.knockouts===3){target.revengeLeft=2;target.revengePhase='chase';target.fallen=.75;}
      else if((target.revengeLeft ?? 0)>0){target.revengePhase='chase';target.revengeTimer=0;}
  }
  private damage(amount: number, side: number, speedFactor=.72, push=.12): void {
    if (this.invincible > 0 || this.fallen>0 || this.boostRemaining>0) return;
    this.armor = Math.max(0, this.armor - amount); this.speed *= speedFactor;
    this.x = clamp(this.x + side * push, -1.45, 1.45);
    this.invincible = 1.1; this.impact = .3; this.hitSerial++; this.lastHit = '车身碰撞！';
    if(this.armor<=0)this.downPlayer();
  }
  private downPlayer():void {
    if(this.fallen>0)return;
    this.fallen=2;this.falls++;this.speed=0;this.attackTime=0;this.combatTime=0;
    this.lastHit='倒地！正在起身…';
  }
  riderRank(rider:MotoRider):number {
    return 1+Number(this.distance>rider.distance)+this.riders.filter(b=>b!==rider &&
      (b.distance>rider.distance || b.distance===rider.distance && b.id<rider.id)).length;
  }
  private combatant(id:number|undefined):MotoRider|undefined {
    if(id===-1)return {id:-1,x:this.x,distance:this.distance,speed:this.speed,armor:this.armor,
      fallen:this.fallen,attackCooldown:0,hitFlash:0};
    return this.riders.find(b=>b.id===id);
  }
  private prepareCombat(rider:MotoRider):MotoRider|undefined {
    if(!this.aggressionEnabled || rider.revengePhase && rider.revengePhase!=='done')return;
    const aggression=aggressionForRank(this.riderRank(rider));
    let target=this.combatant(rider.combatTarget);
    if(target?.fallen || target && Math.abs(target.distance-rider.distance)>aggression.range*1.5)target=undefined;
    if(!target && rider.attackCooldown===0 && !rider.attackPhase) {
      const candidates=[...this.riders,this.combatant(-1)!].filter(b=>b.id!==rider.id && !b.fallen
        && Math.abs(b.distance-rider.distance)<aggression.range && Math.abs(b.x-rider.x)<.85);
      target=candidates.sort((a,b)=>Math.hypot((a.x-rider.x)*20,a.distance-rider.distance)
        -Math.hypot((b.x-rider.x)*20,b.distance-rider.distance))[0];
    }
    rider.combatTarget=target?.id;
    return target;
  }
  private ordinaryAttack(rider:MotoRider,dt:number):void {
    if(!this.aggressionEnabled || rider.fallen || rider.revengePhase && rider.revengePhase!=='done')return;
    const target=this.combatant(rider.combatTarget),aggression=aggressionForRank(this.riderRank(rider));
    if(rider.avoidCarId!==undefined || !target || target.fallen) {
      rider.attackPhase=undefined;rider.attackTime=0;rider.combatTarget=undefined;return;
    }
    if(!rider.attackPhase) {
      if(rider.attackCooldown>0 || Math.abs(target.distance-rider.distance)>2.5
        || Math.abs(target.x-rider.x)<.19 || Math.abs(target.x-rider.x)>.38)return;
      rider.attackPhase='windup';rider.windupTime=aggression.windup;
      rider.attackTime=.3;rider.attackSide=target.x>=rider.x?1:-1;
      if(target.id===-1){this.warning='小心！对手准备出拳';this.warningTime=aggression.windup+.3;}
    } else if(rider.attackPhase==='windup') {
      rider.windupTime=Math.max(0,(rider.windupTime ?? 0)-dt);
      if(rider.windupTime===0){rider.attackPhase='swing';rider.attackTime=.3;rider.strikeResolved=false;}
    } else {
      rider.attackTime=Math.max(0,(rider.attackTime ?? 0)-dt);
      if(!rider.strikeResolved && rider.attackTime<=.225 && rider.attackTime>=.075
        && strikeTouches('punch',rider.attackSide ?? 1,rider,target)) {
        rider.strikeResolved=true;
        if(target.id===-1) {
          const before=this.hitSerial;this.damage(34,this.x>=rider.x?1:-1,.96,.025);
          if(this.hitSerial!==before && !this.fallen)this.lastHit='被对手打中！';
        } else if((target.hitImmunity ?? 0)===0) {
          target.armor=Math.max(0,target.armor-34);target.hitImmunity=1.1;target.hitFlash=.3;
          target.speed=Math.max(0,target.speed-10);target.combatTime=.6;
          if(target.armor===0){target.fallen=3;target.speed=0;target.attackTime=0;target.attackPhase=undefined;
            target.combatTarget=undefined;if((target.revengeLeft ?? 0)>0)target.revengePhase='chase';}
        }
      }
      if(rider.attackTime===0) {
        rider.speed=Math.max(0,rider.speed-20);rider.attackCooldown=aggression.cooldown;
        rider.attackPhase=undefined;rider.combatTarget=undefined;
      }
    }
  }
  private revengeStep(rider:MotoRider,dt:number):void {
    if(!rider.revengePhase || rider.revengePhase==='done' || rider.fallen || this.fallen)return;
    rider.revengeTimer=Math.max(0,(rider.revengeTimer ?? 0)-dt);
    const dz=rider.distance-this.distance;
    if(rider.revengePhase==='chase' && Math.abs(dz)<2.2 && Math.abs(rider.x-this.x)>.19
      && Math.abs(rider.x-this.x)<.36 && this.invincible===0) {
      rider.revengePhase='windup';rider.revengeTimer=.4;
      rider.attackSide=this.x>=rider.x?1:-1;rider.attackTime=.3;
      this.warning='小心！对手准备出拳';this.warningTime=.7;
    } else if(rider.revengePhase==='windup' && rider.revengeTimer===0) {
      rider.revengePhase='swing';rider.attackTime=.3;rider.strikeResolved=false;
      rider.revengeLeft=Math.max(0,(rider.revengeLeft ?? 0)-1);
    } else if(rider.revengePhase==='swing') {
      rider.attackTime=Math.max(0,(rider.attackTime ?? 0)-dt);
      const player={x:this.x,distance:this.distance,fallen:0} as MotoRider;
      if(!rider.strikeResolved && rider.attackTime<=.225 && rider.attackTime>=.075
        && strikeTouches('punch',rider.attackSide ?? 1,rider,player)) {
        rider.strikeResolved=true;const serial=this.hitSerial;
        this.damage(34,this.x>=rider.x?1:-1,.96,.025);
        if(serial!==this.hitSerial && !this.fallen)this.lastHit='被对手打中！';
      }
      if(rider.attackTime===0) {
        rider.speed=Math.max(0,Math.min(rider.speed,this.speed)-45);
        rider.revengePhase='cooldown';rider.revengeTimer=2;
      }
    } else if(rider.revengePhase==='cooldown' && rider.revengeTimer===0) {
      rider.revengePhase=(rider.revengeLeft ?? 0)>0?'chase':'done';
    }
  }
  tick(dt: number, steering: number): void {
    if (this.paused || this.status !== 'racing' || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, .05);
    if(this.boostRemaining>0 && dt>this.boostRemaining/100+1e-8) {
      const boostedStep=this.boostRemaining/100;
      this.tick(boostedStep,steering);this.tick(dt-boostedStep,steering);return;
    }
    const previousDistance=this.distance;
    const riderPrevious=new Map(this.riders.map(b=>[b.id,b.distance]));
    this.warningTime=Math.max(0,this.warningTime-dt);
    this.combatTime=Math.max(0,this.combatTime-dt);
    this.elapsed += dt; this.steer = clamp(steering, -1, 1);
    this.attackCooldown = Math.max(0, this.attackCooldown-dt);
    this.attackTime = Math.max(0, this.attackTime-dt);
    this.invincible = Math.max(0, this.invincible-dt); this.impact = Math.max(0, this.impact-dt);
    if(this.fallen>0) {
      this.fallen=Math.max(0,this.fallen-dt);this.speed=0;this.steer=0;
      if(this.fallen===0) {
        const safe=[0,-.62,.62,-.95,.95].find(x=>!this.riders.some(b=>!b.fallen && Math.abs(b.distance-this.distance)<12 && Math.abs(b.x-x)<.32)
          && !this.cars.some(c=>Math.abs(c.distance-this.distance)<35 && Math.abs(c.x-x)<.4));
        if(safe===undefined)this.fallen=.1;
        else {this.x=safe;this.armor=100;this.invincible=2.5;this.lastHit='满血起身！';this.hitSerial++;}
      }
    } else {
      this.x = clamp(this.x + this.steer * dt * 1.15 - roadCurve(this.distance) * dt * .045 * this.speed/MAX_SPEED, -1.45, 1.45);
      const offRoad = Math.abs(this.x) > 1.04;
      this.speed = this.boostRemaining>0?360:clamp(this.speed + (offRoad ? -95 : this.combatTime>0 ? 12 : 34) * dt, offRoad ? 55 : 0, MAX_SPEED);
      if (offRoad && this.invincible===0 && this.boostRemaining===0) this.armor = Math.max(0, this.armor - dt * 7);
      this.distance += this.speed / 3.6 * dt;
    }
    // Front-to-back update lets every follower react to the resolved leader.
    const ordered = [...this.riders].sort((a,b) => b.distance-a.distance || a.id-b.id);
    const lanes = [-.62, 0, .62];
    for (const rider of ordered) {
      rider.hitImmunity=Math.max(0,(rider.hitImmunity ?? 0)-dt);
      rider.hitFlash = Math.max(0, rider.hitFlash-dt);
      rider.attackCooldown = Math.max(0, rider.attackCooldown-dt);

      rider.trafficCooldown=Math.max(0,(rider.trafficCooldown ?? 0)-dt);
      rider.combatTime=Math.max(0,(rider.combatTime ?? 0)-dt);
      if (rider.fallen > 0) {
        rider.fallen = Math.max(0, rider.fallen-dt);
        if (!rider.fallen) {
          // Rejoin only into an empty lane; never materialize inside a bike.
          const safe = lanes.find(x => (Math.abs(this.distance-rider.distance)>12 || Math.abs(this.x-x)>.32)
            && !this.riders.some(b => b!==rider && !b.fallen && Math.abs(b.distance-rider.distance)<12 && Math.abs(b.x-x)<.32));
          if (safe===undefined) { rider.fallen=dt; continue; }
          rider.armor=100; rider.speed=0; rider.x=safe;rider.laneTarget=safe;rider.avoidCarId=undefined;rider.steer=0;
        }
        continue;
      }
      const combatTarget=this.prepareCombat(rider);
      const revenge=rider.revengePhase && rider.revengePhase!=='done';
      const dzBefore=rider.distance-this.distance;
      let cruise=202+rider.id*3;
      if(revenge) {
        if(rider.revengePhase==='cooldown')cruise=Math.max(0,this.speed-35);
        else if(rider.revengePhase==='windup'||rider.revengePhase==='swing')cruise=this.speed;
        else cruise=clamp(this.speed-dzBefore*4,0,285);
      }
      if(combatTarget && !revenge)cruise=Math.min(cruise+8,Math.max(0,combatTarget.speed+(combatTarget.distance-rider.distance)*3));
      const front = [...ordered].reverse().find(b => b!==rider && !b.fallen && b.distance>=rider.distance
        && (b.distance>rider.distance || b.id<rider.id) && Math.abs(b.x-rider.x)<.32);
      let lane = rider.laneTarget ?? lanes[rider.id%3];
      if (front && front.distance-rider.distance<30 && Math.abs(lane-rider.x)<.03) {
        // An overtaking lane must be clear over the whole lateral path.
        const safe = lanes.filter(x => !ordered.some(b => b!==rider && !b.fallen
          && Math.abs(b.distance-rider.distance)<18
          && b.x>=Math.min(x,rider.x)-.32 && b.x<=Math.max(x,rider.x)+.32));
        lane = safe.sort((a,b)=>Math.abs(a-rider.x)-Math.abs(b-rider.x))[0] ?? rider.x;
        rider.laneTarget=lane;
      }
      if(revenge && rider.revengePhase!=='cooldown') {
        const side=this.x>.6?-1:this.x<-.6?1:rider.x>=this.x?1:-1;
        lane=clamp(this.x+side*.29,-.9,.9);
      }
      if(combatTarget && !revenge) {
        const side=rider.x>=combatTarget.x?1:-1;
        lane=clamp(combatTarget.x+side*.35,-.95,.95);
      }
      // Keep the manoeuvre until the tracked car has passed, even after leaving its danger strip.
      let approaching=this.cars.find(c=>c.id===rider.avoidCarId && c.distance-rider.distance>-20);
      if(!approaching) {
        rider.avoidCarId=undefined;
        approaching=this.cars.find(c=>c.distance>rider.distance && c.distance-rider.distance<180
          && (Math.abs(c.x-rider.x)<.4 || Math.abs(c.x-lane)<.4));
      }
      if(approaching) {
        rider.avoidCarId=approaching.id;
        const committed=rider.laneTarget;
        if(committed!==undefined && Math.abs(committed-approaching.x)>.4)lane=committed;
        else {
          const choices=lanes.filter(x=>Math.abs(x-approaching.x)>.4
            && !ordered.some(b=>b!==rider && !b.fallen && Math.abs(b.distance-rider.distance)<18
              && b.x>=Math.min(x,rider.x)-.32 && b.x<=Math.max(x,rider.x)+.32));
          lane=choices.sort((a,b)=>Math.abs(a-rider.x)-Math.abs(b-rider.x))[0] ?? rider.x;
          rider.laneTarget=lane;
        }
      }
      if(!approaching && (rider.combatTime ?? 0)>0) lane=rider.x;
      const lateralSpeed=(approaching || revenge || combatTarget) ? .65 : .32;
      let nextX = rider.x + clamp(lane-rider.x,-dt*lateralSpeed,dt*lateralSpeed);
      if (ordered.some(b=>b!==rider && !b.fallen && Math.abs(b.distance-rider.distance)<12
        && Math.abs(b.x-nextX)<.32)) nextX=rider.x;
      const desiredLean=clamp((nextX-rider.x)/dt*2,-1,1);
      rider.steer=(rider.steer ?? 0)+(desiredLean-(rider.steer ?? 0))*(1-Math.exp(-dt*10));
      if(Math.abs(rider.steer)<.01)rider.steer=0;
      rider.x=nextX;
      let desired=cruise;
      if(approaching && Math.abs(rider.x-approaching.x)<.4 && lane===rider.x)desired=Math.min(desired,100);
      if(front && Math.abs(front.x-rider.x)<.32) {
        const gap=front.distance-rider.distance;
        if(gap<30) desired=Math.min(desired,Math.max(0,front.speed+(gap-16)*3));
      }
      rider.speed=clamp(rider.speed+clamp(desired-rider.speed,-100*dt,(revenge?80:(rider.combatTime ?? 0)>0?12:30)*dt),0,revenge?285:cruise);
      let nextDistance=rider.distance+rider.speed/3.6*dt;
      if(front && Math.abs(front.x-rider.x)<.32 && nextDistance>front.distance-12) {
        nextDistance=Math.max(rider.distance,front.distance-12);
        rider.speed=Math.min(rider.speed,front.speed);
      }
      rider.distance=nextDistance;
      if(this.boostRemaining>0 && !rider.fallen) {
        const oldGap=(riderPrevious.get(rider.id) ?? rider.distance)-previousDistance;
        const gap=rider.distance-this.distance;
        if(Math.min(oldGap,gap)<2.2 && Math.max(oldGap,gap)>-2.2 && Math.abs(rider.x-this.x)<.23)this.knockDown(rider);
      }
      this.revengeStep(rider,dt);

      // Compact tyre/body footprint, not the tall rider sprite rectangle.
      // At player depth .16 road units = 55 px; 1.8 m = roughly 15 px.
      const dz = rider.distance-this.distance, dx = rider.x-this.x;
      if (!this.fallen && !rider.fallen && this.boostRemaining===0 && (dz/1.8)**2 + (dx/.16)**2 < 1) {
        const side=this.x>=rider.x ? 1 : -1;
        this.damage(12,side);
        this.x=clamp(rider.x+side*.17,-1.45,1.45);
      }
    }
    if(!this.fallen)this.resolveStrike();
    // Resolve combat only after every rider has moved to this frame.
    for(const rider of ordered)this.ordinaryAttack(rider,dt);
    for(const car of this.cars) {
      const oldGap=car.distance-previousDistance;
      car.distance-=car.speed/3.6*dt;
      const newGap=car.distance-this.distance;
      // Sweep the relative movement: an oncoming car must not skip through at low FPS.
      if(Math.min(oldGap,newGap)<3.6 && Math.max(oldGap,newGap)>-3.6 && Math.abs(car.x-this.x)<.31) {
        const before=this.hitSerial;
        this.damage(22,this.x>=car.x?1:-1);
        if(this.hitSerial!==before)this.lastHit='撞到汽车！';
      }
      for(const rider of ordered) {
        const before=car.distance+car.speed/3.6*dt-(riderPrevious.get(rider.id) ?? rider.distance);
        const after=car.distance-rider.distance;
        if(!rider.fallen && (rider.trafficCooldown ?? 0)===0 && Math.min(before,after)<4
          && Math.max(before,after)>-4 && Math.abs(car.x-rider.x)<.31) {
          rider.speed=Math.max(0,rider.speed-70);rider.hitFlash=.3;rider.trafficCooldown=1;
        }
      }
    }
    if(this.boostRemaining>0) {
      this.boostRemaining=Math.max(0,this.boostRemaining-(this.distance-previousDistance));
      if(this.boostRemaining<1e-7){this.boostRemaining=0;this.speed=Math.min(this.speed,MAX_SPEED);}
    }
    if (this.armor<=0) this.downPlayer();
    else if (this.distance>=RACE_LENGTH) { this.distance=RACE_LENGTH; this.status='finished'; }
  }
}
