import {Node,Graphics,Color} from 'cc';
import {DriftFeedEvent,DriftFeedSnapshot} from './driftFeedRules';
import {DriftSourceTrails} from './DriftSourceTrails';
import {DriftParticles} from './driftParticles';
export class DriftFeedEffects {
 readonly trails=new DriftSourceTrails();readonly particles=new DriftParticles();private g:Graphics;private trailGraphics:Graphics[];private shake=0;private elapsed=0;private trailTimer=0;private ring:{x:number;y:number;life:number}|null=null;
 constructor(private root:Node,lower:Node,upper:Node){this.g=root.addComponent(Graphics);this.trailGraphics=[lower.addComponent(Graphics),upper.addComponent(Graphics)];}
 consume(events:readonly DriftFeedEvent[]):void{for(const e of events){if(e.type==='crash'){this.particles.crash(e.x,e.y);this.ring={x:e.x,y:e.y,life:.4};this.shake=.28;this.elapsed=0;}if(e.type==='revive')this.reset();}}
 emitTrail(s:DriftFeedSnapshot,dt:number):void{this.trails.emit(s,dt);}

 update(dt:number):void {
  this.particles.update(dt);this.trails.update(dt);this.elapsed+=dt;this.shake=Math.max(0,this.shake-dt);
  // Collision feedback only; visual.render restores the authoritative offset each frame.
  if(this.shake>0){const parent=this.root.parent,p=parent.position;parent.setPosition(p.x+Math.sin(this.elapsed*92)*this.shake*30,p.y+Math.cos(this.elapsed*71)*this.shake*22);}
  let g=this.g;g.clear();for(const t of this.trailGraphics){t.clear();t.lineCap=Graphics.LineCap.ROUND;t.lineJoin=Graphics.LineJoin.ROUND;}
  for(const m of this.trails.marks){g=this.trailGraphics[m.layer||0];g.lineWidth=m.width;g.strokeColor=new Color(12,15,16,Math.floor(150*Math.min(1,m.life*5)));g.moveTo(m.startX,m.startY);g.lineTo(m.endX,m.endY);g.stroke();}
  for(const p of this.trails.particles){g=this.trailGraphics[p.layer||0];
   const ratio=p.life/p.maxLife;
   if(p.shape==='smoke'){
    const alpha=p.color.a*ratio*Math.min(1,(1-ratio)/.12),radius=p.radius+((p.endRadius||p.radius)-p.radius)*(1-ratio*ratio);
    for(const [r,a] of [[1,.16],[.72,.22],[.44,.3]]){g.fillColor=new Color(p.color.r,p.color.g,p.color.b,Math.floor(alpha*a));g.circle(p.x,p.y,radius*r);g.fill();}
   }else{g.fillColor=new Color(p.color.r,p.color.g,p.color.b,Math.floor(p.color.a*ratio));g.circle(p.x,p.y,p.radius*(.55+ratio));g.fill();}
  }

  g=this.g;
  if(this.ring){this.ring.life-=dt;if(this.ring.life<=0)this.ring=null;else{g.strokeColor=new Color(255,217,122,Math.floor(this.ring.life/.4*210));g.lineWidth=6;g.circle(this.ring.x,this.ring.y,35+(1-this.ring.life/.4)*180);g.stroke();}}
  for(let i=this.particles.items.length-1;i>=0;i--){const p=this.particles.items[i];const ratio=p.life/p.max;const c=p.kind==='fire'?[255,110+Math.floor(120*ratio),35]:p.kind==='spark'?[255,222,119]:p.kind==='boost'?[129,237,255]:p.kind==='smoke'?[71,67,62]:[198,204,195];g.fillColor=new Color(c[0],c[1],c[2],Math.floor(ratio*(p.kind==='trail'?100:240)));g.circle(p.x,p.y,p.size*(p.kind==='smoke'?1+(1-ratio)*1.8:ratio*.7+.3));g.fill();}
 }
 reset():void{this.particles.reset();this.trails.reset();this.ring=null;this.shake=0;this.elapsed=0;this.g.clear();for(const t of this.trailGraphics)t.clear();}
 dispose():void{
  // Scene-owned Graphics have already been destroyed when Canvas calls onDestroy.
  // Only release simulation data here; reset() is for a live replay/revival.
  this.particles.reset();this.trails.reset();this.ring=null;this.shake=0;this.elapsed=0;
 }
}
