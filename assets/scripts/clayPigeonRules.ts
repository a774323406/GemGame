export type Flight = 'arc' | 'highlow' | 'cross' | 'wave' | 'fast' | 'eight';
export interface Disc {id:number;x:number;y:number;age:number;life:number;radius:number;color:number;side:number;lane:number;flight:Flight;alive:boolean;}
export const CLAY_ROUNDS = [
 {count:20,flight:'arc',tip:'热身起飞 · 左右抛物线',interval:.65},
 {count:24,flight:'highlow',tip:'高低齐飞 · 高抛与低飞同时出现',interval:.58},
 {count:28,flight:'cross',tip:'左右穿梭 · 交叉飞行',interval:.52},
 {count:32,flight:'wave',tip:'交叉波动 · 左右交叉，流线绕行',interval:.48},
 {count:36,flight:'fast',tip:'飞碟变小 · 一击即碎',interval:.44},
 {count:40,flight:'eight',tip:'八字绕行 · 绕行与直飞交替出现',interval:.42},
 // Rounds 7–10 are provisional: the supplied recording ends during round 6.
 {count:44,flight:'highlow',tip:'高低交错 · 留意两侧飞碟',interval:.40},
 {count:48,flight:'wave',tip:'连续穿梭 · 稳住准星',interval:.38},
 {count:52,flight:'eight',tip:'极速绕行 · 挑战连击',interval:.36},
 {count:56,flight:'cross',tip:'最后一轮 · 全力命中',interval:.34},
] as const;
export class ClayPigeonRound {
 round=0;elapsed=0;spawned=0;hits=0;totalHits=0;shots=0;hitShots=0;combo=0;bestCombo=0;ammo=28;
 phase:'playing'|'between'|'success'|'failure'='playing';discs:Disc[]=[];
 cooldown=0;private spawnClock=.3;private serial=0;private seed:number;
 constructor(seed=713){this.seed=seed;}
 get config(){return CLAY_ROUNDS[this.round];}
 get accuracy(){return this.shots?Math.round(this.hitShots/this.shots*100):0;}
 private random(){this.seed=(this.seed*16807)%2147483647;return this.seed/2147483647;}
 step(dt:number){
  if(this.phase!=='playing')return;
  dt=Math.max(0,Math.min(dt,.1));this.elapsed+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.spawnClock-=dt;
  if(this.spawned<this.config.count&&this.spawnClock<=0){this.spawnClock+=this.config.interval;this.spawn();}
  for(const d of this.discs){if(!d.alive)continue;d.age+=dt;this.position(d);if(d.age>=d.life){d.alive=false;this.combo=0;}}
  this.discs=this.discs.filter(d=>d.alive);
  if(this.spawned===this.config.count&&!this.discs.length)this.phase='between';
 }
 private spawn(){
  const d:Disc={id:++this.serial,x:0,y:0,age:0,life:3.0+this.random()*.9,radius:this.round>=4?23:29,color:this.spawned%6,side:this.spawned%2?1:-1,lane:this.random(),flight:this.config.flight,alive:true};
  this.position(d);this.discs.push(d);this.spawned++;
 }
 private position(d:Disc){
  const t=d.age/d.life;d.x=d.side*(-410+820*t);d.y=30+150*d.lane+Math.sin(t*Math.PI)*190;
  if(d.flight==='highlow')d.y=-30+280*(d.id%2)+Math.sin(t*Math.PI)*100;
  if(d.flight==='cross')d.y=60+210*(d.id%2)+(d.id%2?-170:170)*t;
  if(d.flight==='wave')d.y=180+Math.sin(t*Math.PI*3+d.lane*3)*100;
  if(d.flight==='fast')d.y=60+260*d.lane+Math.sin(t*Math.PI)*80;
  if(d.flight==='eight'&&d.id%2===0){d.x=Math.sin(t*Math.PI*2)*290;d.y=190+Math.sin(t*Math.PI*4)*115;}
  d.y-=90;
 }
 /** Auto fire only when a clay enters the aiming circle; nearby pellets may hit a second clay. */
 aim(x:number,y:number):Disc[]{
  if(this.phase!=='playing'||this.cooldown>0||this.ammo<=0)return [];
  if(!this.discs.some(d=>d.alive&&Math.hypot(d.x-x,d.y-y)<=d.radius+12))return [];
  this.ammo--;this.shots++;this.cooldown=.17;
  const hits=this.discs.filter(d=>d.alive&&Math.hypot(d.x-x,d.y-y)<=d.radius+29);
  hits.forEach(d=>{d.alive=false;this.hits++;this.totalHits++;this.combo++;this.bestCombo=Math.max(this.bestCombo,this.combo);});
  if(hits.length)this.hitShots++;
  return hits;
 }
 next(){
  if(this.phase!=='between')return;
  if(this.round===9){this.phase=this.totalHits>=228?'success':'failure';return;}
  this.round++;this.spawned=0;this.hits=0;this.ammo=this.config.count+8;this.discs=[];this.spawnClock=.4;this.cooldown=0;this.phase='playing';
 }
}
