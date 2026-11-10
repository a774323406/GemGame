export const ROPE_LENGTH = 230;
export const ROPE_MAX_LENGTH = 330;
export const CHARGE_SECONDS = .2;
export interface RopeDuck { x: number; y: number; vx: number; vy: number; grounded: boolean; landAge: number; }
export interface RopePlatform { id: number; start: number; end: number; y: number; spikeX: number | null; energyX: number | null; energyTaken: boolean; seedAfter?: number; recovery?: boolean; }
const DIFFICULTY_ANCHORS = [
  [0,440,520,55,75,0], [80,420,500,65,85,0],
  [200,360,460,80,110,12], [400,300,400,100,140,24], [650,240,340,120,170,40],
];
export function ropeDuckDifficultyAt(distance:number):{widthMin:number;widthMax:number;gapMin:number;gapMax:number;height:number} {
  const d=Math.max(0,Math.min(650,Number.isFinite(distance)?distance:0));
  let i=0;while(i<DIFFICULTY_ANCHORS.length-2&&d>DIFFICULTY_ANCHORS[i+1][0])i++;
  const a=DIFFICULTY_ANCHORS[i],b=DIFFICULTY_ANCHORS[i+1],t=(d-a[0])/(b[0]-a[0]);
  const mix=(column:number)=>a[column]+(b[column]-a[column])*t;
  return {widthMin:mix(1),widthMax:mix(2),gapMin:mix(3),gapMax:mix(4),height:mix(5)};
}
export interface RopeEvent { kind: 'jump' | 'land' | 'pickup' | 'boost' | 'failure'; duck: number; x: number; y: number; }
export class RopeDuckRound {
  ducks: RopeDuck[] = [130,220].map(x => ({ x, y: 0, vx: 0, vy: 0, grounded: true, landAge: 1 }));
  platforms: RopePlatform[] = [{ id:0, start:-600, end:620, y:0, spikeX:null, energyX:null, energyTaken:false, seedAfter:3719 }];
  phase: 'playing' | 'failure' = 'playing';
  selected = 0;
  charging = false;
  charge = 0;
  distance = 0;
  energy = 0;
  boost = 0;
  invulnerable = 0;
  failureReason = '';
  events: RopeEvent[] = [];
  private accumulator = 0;
  private rescueLeader = -1;
  private rescueTime = 0;
  private seed = 3719;
  private checkpoint = { id:0, x:130, y:0 };
  constructor() { this.extendTerrain(); }
  private random(): number { this.seed = (Math.imul(this.seed,1664525)+1013904223)>>>0; return this.seed/4294967296; }
  private event(kind: RopeEvent['kind'], i: number): void { const d=this.ducks[i]; this.events.push({kind,duck:i,x:d.x,y:d.y}); }
  drainEvents(): RopeEvent[] { const result=this.events; this.events=[]; return result; }
  private selectGroundedDuck(): void {
    if(!this.charging&&!this.ducks[this.selected].grounded&&this.ducks[1-this.selected].grounded)this.selected=1-this.selected;
  }
  private isBraced(i:number):boolean {
    const d=this.ducks[i],other=this.ducks[1-i];
    return d.grounded&&!other.grounded&&other.x<d.x&&other.y<d.y-48;
  }
  private isRescueLeader(i:number):boolean {
    const d=this.ducks[i],other=this.ducks[1-i];
    return this.rescueLeader===i&&this.rescueTime>0&&!other.grounded&&other.y<d.y-10;
  }
  beginCharge(): boolean {
    this.selectGroundedDuck();
    if(this.phase!=='playing'||this.charging||!this.ducks[this.selected].grounded||this.boost>0)return false;
    this.charging=true;this.charge=0;return true;
  }
  cancelCharge(): void { this.charging=false;this.charge=0; }
  release(): boolean {
    if(!this.charging||this.phase!=='playing')return false;
    const i=this.selected,d=this.ducks[i],power=Math.min(1,this.charge/CHARGE_SECONDS);
    this.cancelCharge();if(!d.grounded)return false;
    // A deliberate jump from a secure ledge leads the rescue; the hanging load
    // must not cancel that jump and return both ducks to the same deadlock.
    if(this.isBraced(i)){this.rescueLeader=i;this.rescueTime=1.3;}
    d.vx=170+270*power;d.vy=410+480*power;d.grounded=false;
    this.event('jump',i);this.selected=1-i;return true;
  }
  tick(dt:number): void {
    if(this.phase!=='playing'||!Number.isFinite(dt)||dt<=0)return;
    this.accumulator+=Math.min(.1,dt);
    while(this.accumulator>=1/120&&this.phase==='playing'){this.step(1/120);this.accumulator-=1/120;}
  }
  private step(dt:number): void {
    if(this.charging)this.charge=Math.min(CHARGE_SECONDS,this.charge+dt);
    this.invulnerable=Math.max(0,this.invulnerable-dt);
    this.rescueTime=Math.max(0,this.rescueTime-dt);
    if(this.rescueLeader>=0&&this.ducks[1-this.rescueLeader].grounded)this.rescueTime=0;
    const boosting=this.boost>0;this.boost=Math.max(0,this.boost-dt);
    const previous=this.ducks.map(d=>({x:d.x,y:d.y}));
    if(!boosting)this.pullSpring(dt);
    for(let i=0;i<2;i++){
      const d=this.ducks[i];
      d.landAge+=dt;
      if(boosting){d.grounded=false;d.vx=290;d.vy=(210-d.y)*4;}
      else if(d.grounded){d.vx=this.isBraced(i)?Math.max(0,d.vx):d.vx;d.vx*=Math.exp(-18*dt);d.vy=0;}
      else d.vy-=1800*dt;
      d.x+=d.vx*dt;d.y+=d.vy*dt;
    }
    // Spring forces handle normal stretching; this is only the emergency length cap.
    for(let j=0;j<6;j++){
      this.constrainRope();
      for(let i=0;i<2;i++)this.collide(i,previous[i],boosting);
    }
    for(let i=0;i<2;i++){
      const d=this.ducks[i];
      if(d.y< -440){this.fail('没能跨过断崖',i);return;}
      for(const p of this.platforms){
        if(!boosting&&this.invulnerable===0&&p.spikeX!==null&&d.x+17>p.spikeX&&d.x-17<p.spikeX+48&&d.y<p.y+28&&d.y+65>p.y){this.fail('碰到尖刺了',i);return;}
        if(p.energyX!==null&&!p.energyTaken&&Math.hypot(d.x-p.energyX,d.y+35-(p.y+110))<52){
          p.energyTaken=true;this.energy++;this.event('pickup',i);
          if(this.energy>=5){this.energy=0;this.boost=3.5;this.invulnerable=4.5;this.cancelCharge();this.event('boost',i);}
        }
      }
    }
    // Prefer the next duck, but let the planted partner jump again to rescue it.
    this.selectGroundedDuck();
    this.distance=Math.max(this.distance,Math.floor(((this.ducks[0].x+this.ducks[1].x)/2-175)/14));
    for(const p of this.platforms)if(p.spikeX===null&&this.ducks.every(d=>d.grounded&&d.x>p.start+25&&d.x<p.end-25&&Math.abs(d.y-p.y)<1)&&p.id>=this.checkpoint.id){
      this.checkpoint={id:p.id,x:Math.max(p.start+65,Math.min(this.ducks[0].x,this.ducks[1].x)),y:p.y};
    }
    this.extendTerrain();
  }
  private pullSpring(dt:number): void {
    const [a,b]=this.ducks,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    if(length<=ROPE_LENGTH)return;
    const nx=dx/length,ny=dy/length;
    const radial=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
    // Tension only: a loose cord never pushes ducks apart. Damping settles recoil.
    const force=Math.max(0,65*(length-ROPE_LENGTH)+5.5*radial);
    for(let i=0;i<2;i++){
      const duck=this.ducks[i],direction=i===0?1:-1;
      const upward=direction*ny*force;
      // Ground supplies normal support, not an anchor. Enough upward pull lifts it.
      if(duck.grounded&&upward>1800)duck.grounded=false;
      // Feet resist horizontal tugging; airborne recoil retains its full strength.
      const horizontal=direction*nx*force,leading=this.isRescueLeader(i);
      if(!(horizontal<0&&(this.isBraced(i)||leading)))duck.vx+=horizontal*dt*(duck.grounded?.35:1);
      if(!duck.grounded&&!(leading&&upward<0))duck.vy+=upward*dt;
    }
  }
  private constrainRope(): void {
    const [a,b]=this.ducks,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    if(length<=ROPE_MAX_LENGTH)return;
    const nx=dx/length,ny=dy/length;
    const wa=this.isBraced(0)||this.isRescueLeader(0)?0:a.grounded?.15:1;
    const wb=this.isBraced(1)||this.isRescueLeader(1)?0:b.grounded?.15:1,sum=wa+wb;
    if(!sum)return;
    const correction=(length-ROPE_MAX_LENGTH)/sum;
    a.x+=nx*correction*wa;a.y+=ny*correction*wa;b.x-=nx*correction*wb;b.y-=ny*correction*wb;
    const outward=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
    if(outward>0){a.vx+=nx*outward*wa/sum;a.vy+=ny*outward*wa/sum;b.vx-=nx*outward*wb/sum;b.vy-=ny*outward*wb/sum;}
  }
  private collide(i:number,prev:{x:number;y:number},boosting:boolean): void {
    const d=this.ducks[i];if(boosting)return;
    const support=this.platforms.find(p=>d.x>=p.start&&d.x<=p.end&&d.y<=p.y+.6&&prev.y>=p.y-.6&&d.vy<=0);
    if(support){if(!d.grounded){d.landAge=0;d.vx*=.18;this.event('land',i);}d.y=support.y;d.vy=0;d.grounded=true;}
    else d.grounded=false;
    // The cliff wall is solid: a low jump cannot pass through the side and snap up.
    if(!d.grounded)for(const p of this.platforms){
      if(d.y<p.y-1&&d.y+65> -440&&prev.x+14<=p.start&&d.x+14>p.start){d.x=p.start-14;d.vx=Math.min(0,d.vx);}
    }
  }
  private extendTerrain(): void {
    const maxX=Math.max(...this.ducks.map(d=>d.x));
    let last=this.platforms[this.platforms.length-1];
    while(last.end<maxX+1600){
      // Map position, not score/time: checkpoint regeneration always produces the same route.
      const id=last.id+1,profile=ropeDuckDifficultyAt((last.end-175)/14);
      const rg=this.random(),rw=this.random(),rh=this.random(),rs=this.random();
      let gap=profile.gapMin+(profile.gapMax-profile.gapMin)*rg;
      let width=profile.widthMin+(profile.widthMax-profile.widthMin)*rw;
      let dy=(rh*2-1)*profile.height;
      const entryDistance=(last.end+gap-175)/14;
      const recovery=entryDistance>=200&&id%4===0;
      const hazard=entryDistance>=140&&!recovery&&(entryDistance<200?id%5===4:entryDistance<400?id%3===1:id%2===1);
      if(recovery){width=440+rw*60;gap=60+rg*20;dy=0;}
      else if(hazard){width=Math.max(360,width);gap=Math.min(110,gap);dy=Math.max(-12,Math.min(12,dy));}
      else if(gap>140)dy=Math.max(-18,Math.min(18,dy));
      const start=last.end+gap,y=Math.max(-50,Math.min(50,last.y+dy));
      const spikeX=hazard&&(start-175)/14>=140?start+200+rs*(width-348):null;
      const energyX=id<=5?start+110:(recovery||(id%2===0&&spikeX===null))?start+width*.45:null;
      last={id,start,end:start+width,y,spikeX,energyX,energyTaken:false,seedAfter:this.seed,recovery};this.platforms.push(last);
    }
    const minX=Math.min(...this.ducks.map(d=>d.x));
    this.platforms=this.platforms.filter(p=>p.end>minX-500||p.id===this.checkpoint.id);
  }
  private fail(reason:string,i:number): void {this.phase='failure';this.failureReason=reason;this.cancelCharge();this.event('failure',i);}
  revive(): boolean {
    if(this.phase!=='failure')return false;
    const p=this.platforms.find(p=>p.id===this.checkpoint.id)||this.platforms[0];
    const x=Math.max(p.start+55,Math.min(this.checkpoint.x,p.end-155));
    this.ducks=[x,x+85].map(x=>({x,y:p.y,vx:0,vy:0,grounded:true,landAge:1}));
    // The retained checkpoint may be behind recycled platforms. Rebuild its route
    // from the saved random state instead of leaving an impossible gap ahead.
    const retained=new Map(this.platforms.map(platform=>[platform.id,platform.energyTaken]));
    this.platforms=[p];this.seed=p.seedAfter??3719;this.extendTerrain();
    for(const platform of this.platforms)if(retained.has(platform.id))platform.energyTaken=retained.get(platform.id);
    this.phase='playing';this.selected=0;this.accumulator=0;this.rescueLeader=-1;this.rescueTime=0;this.cancelCharge();this.invulnerable=3;this.boost=0;this.events=[];return true;
  }
}

// Small visual-only Verlet cord: inertia follows the ducks without changing collisions.
type CordPoint = { x:number;y:number;px:number;py:number };
export class RopeDuckCord {
  points:CordPoint[]=[];
  private previousStep=1/120;
  reset(a:{x:number;y:number},b:{x:number;y:number}):void {
    this.previousStep=1/120;
    const slack=Math.max(0,ROPE_LENGTH-Math.hypot(b.x-a.x,b.y-a.y));
    this.points=Array.from({length:13},(_,i)=>{
      const t=i/12,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t+Math.sin(Math.PI*t)*slack*.25;
      return {x,y,px:x,py:y};
    });
  }
  tick(dt:number,a:{x:number;y:number},b:{x:number;y:number},floor:number|null=null):void {
    if(!Number.isFinite(dt)||dt<=0)return;
    if(!this.points.length)this.reset(a,b);
    const steps=Math.max(1,Math.ceil(Math.min(.05,dt)*120)),h=Math.min(.05,dt)/steps;
    const segment=Math.max(ROPE_LENGTH,Math.hypot(b.x-a.x,b.y-a.y))/12;
    const pin=()=>{Object.assign(this.points[0],{x:a.x,y:a.y,px:a.x,py:a.y});Object.assign(this.points[12],{x:b.x,y:b.y,px:b.x,py:b.y});};
    for(let s=0;s<steps;s++){
      for(let i=1;i<12;i++){
        const p=this.points[i],x=p.x,y=p.y;
        const scale=h/this.previousStep,damping=Math.exp(-5*h);
        p.x+=(p.x-p.px)*damping*scale;p.y+=(p.y-p.py)*damping*scale-1200*h*h;
        p.px=x;p.py=y;
      }
      for(let pass=0;pass<8;pass++){
        pin();
        for(let i=0;i<12;i++){
          const p=this.points[i],q=this.points[i+1],dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy);
          if(d<1e-5)continue;
          const wp=i===0?0:1,wq=i===11?0:1,f=(d-segment)/d/(wp+wq);
          p.x+=dx*f*wp;p.y+=dy*f*wp;q.x-=dx*f*wq;q.y-=dy*f*wq;
        }
        if(floor!==null)for(let i=1;i<12;i++)if(this.points[i].y<floor){this.points[i].y=floor;this.points[i].py=floor;}
      }
      pin();
      this.previousStep=h;
    }
  }
}
