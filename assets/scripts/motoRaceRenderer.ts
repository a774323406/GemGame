import { Color, Graphics } from 'cc';
import { MotoRace, roadCurve, RACE_LENGTH, projectRoad, riderVisibility } from './motoRaceRules';
import { MotoRaceArt } from './motoRaceArt';
const colors = new Map<string, Color>();
function color(hex: string): Color {
  if (!colors.has(hex)) colors.set(hex, new Color().fromHEX(hex));
  return colors.get(hex)!;
}
/** Continuous procedural road underneath depth-sorted, painted sprite artwork. */
export class MotoRaceRenderer {
  constructor(private g: Graphics, private art: MotoRaceArt) {}
  private poly(c: string, points: number[]): void {
    const g=this.g; g.fillColor=color(c); g.moveTo(points[0],points[1]);
    for(let i=2;i<points.length;i+=2) g.lineTo(points[i],points[i+1]);
    g.close(); g.fill();
  }
  private rect(c:string,x:number,y:number,w:number,h:number):void {
    this.g.fillColor=color(c); this.g.rect(x,y,w,h); this.g.fill();
  }
  private ellipse(c:string,x:number,y:number,rx:number,ry:number):void {
    this.g.fillColor=color(c); this.g.ellipse(x,y,rx,ry); this.g.fill();
  }
  private line(c:string,w:number,x:number,y:number,x2:number,y2:number):void {
    this.g.strokeColor=color(c); this.g.lineWidth=w; this.g.moveTo(x,y); this.g.lineTo(x2,y2); this.g.stroke();
  }
  private project(z:number,r:MotoRace):{x:number;y:number;s:number;w:number} {
    return projectRoad(z,r);
  }
  render(r:MotoRace):void {
    this.g.clear();this.art.begin();
    for(let i=0;i<80;i++) {
      const t=i/79; const c=new Color(110+Math.round(t*78),181+Math.round(t*33),222+Math.round(t*17));
      this.g.fillColor=c; this.g.rect(-1400,15+(79-i)*12,2800,12.5); this.g.fill();
    }
    this.ellipse('#f6ebad',245,527,65,65); this.ellipse('#f8eeb751',245,527,94,94);
    for(const [x,y,s] of [[-300,572,1],[60,612,1.15],[320,640,.7]]) {
      this.ellipse('#e4f1f7',x,y,55*s,19*s); this.ellipse('#e4f1f7',x-23*s,y+12*s,25*s,24*s);
      this.ellipse('#e4f1f7',x+15*s,y+20*s,32*s,29*s);
    }
    const pan=roadCurve(r.distance)*35;
    for(let layer=0;layer<3;layer++) {
      const points=[-1450,0];
      for(let i=-16;i<17;i++) {
        const x=i*95-pan*(.3+layer*.25);
        const h=50+(2-layer)*25+Math.sin(i*1.6+layer*2)*29+Math.sin(i*.59+layer)*39;
        points.push(x,h);
      }
      points.push(1550,0);this.poly(['#adc6cf','#94b4bb','#7d9f9f'][layer],points);
    }
    this.rect('#83b67c',-1400,-1000,2800,1030);
    // One continuous asphalt polygon: separate segment fills exposed grass-coloured seams.
    const lastSegment=Math.floor((r.distance+900)/6),firstSegment=Math.floor(r.distance/6);
    const left:number[]=[],right:number[]=[];
    for(let i=lastSegment+1;i>=firstSegment;i--) {
      const p=this.project(Math.max(0,i*6-r.distance),r);
      left.push(p.x-p.w,p.y);right.unshift(p.x+p.w,p.y);
    }
    this.poly('#687079',[...left,...right]);
    for(let i=lastSegment;i>=firstSegment;i--) {
      const p=this.project((i+1)*6-r.distance,r),q=this.project(Math.max(0,i*6-r.distance),r);
      const band=Math.floor(i/2)%2===0;
      for(const side of [-1,1]) {
        this.poly(band?'#f2eddb':'#cc6056',[p.x+p.w*side,p.y,p.x+p.w*side*1.055,p.y,q.x+q.w*side*1.055,q.y,q.x+q.w*side,q.y]);
        this.poly('#e4e4d9',[p.x+p.w*side,p.y,p.x+p.w*(side-side*.009),p.y,q.x+q.w*(side-side*.009),q.y,q.x+q.w*side,q.y]);
      }
      if(band) for(const lane of [-1/3,1/3]) this.poly('#f0eee1',[p.x+p.w*(lane-.007),p.y,p.x+p.w*(lane+.007),p.y,q.x+q.w*(lane+.007),q.y,q.x+q.w*(lane-.007),q.y]);
    }
    for(let i=0;i<12;i++){
      this.g.fillColor=new Color(181,209,201,Math.round(95*(1-i/12)));
      this.g.rect(-1400,13-i*6,2800,6);this.g.fill();
    }
    // Roadside objects are deterministic world positions, so they pass without popping.
    const start=Math.floor(r.distance/38);
    const objects: {z:number; tree?:number; side?:number; rider?:number; car?:number; finish?:boolean; player?:boolean}[]=[];
    for(let i=start;i<start+25;i++) for(const side of [-1,1]) objects.push({z:i*38+(side>0?16:0)-r.distance,tree:i,side});
    objects.push({z:24,player:true});
    r.riders.forEach((b,i)=>{ const z=b.distance-r.distance+24; if(z>3&&riderVisibility(z-24)>0) objects.push({z,rider:i}); });
    r.cars.forEach((c,i)=>{const z=c.distance-r.distance+24;if(z>3&&z<650)objects.push({z,car:i});});
    if(RACE_LENGTH-r.distance<900) objects.push({z:RACE_LENGTH-r.distance+24,finish:true});
    objects.sort((a,b)=>b.z-a.z);
    for(const obj of objects) {
      if(obj.z<1) continue;
      const p=this.project(obj.z,r);
      if(obj.tree!==undefined) {
        const x=p.x+obj.side!*p.w*(1.24+(obj.tree%3)*.18), s=p.s;
        if(Math.abs(x)>650) continue;
        this.ellipse('#3a654b24',x,p.y,55*s,12*s);
        this.art.tree(x,p.y,s*(1.85+(obj.tree%4)*.12),obj.side!<0);
      } else if(obj.car!==undefined) {
        const c=r.cars[obj.car],x=p.x+c.x*p.w;
        this.ellipse('#293d4040',x,p.y,90*p.s*1.8,13*p.s*1.8);
        this.art.car(x,p.y,p.s*1.8,c.kind ?? 0);
      } else if(obj.finish) {
        this.rect('#e9e5d8',p.x-p.w*1.02,p.y,p.s*10,210*p.s);
        this.rect('#e9e5d8',p.x+p.w,p.y,p.s*10,210*p.s);
        for(let k=0;k<16;k++) for(let j=0;j<2;j++) this.rect((k+j)%2?'#f8f8ed':'#202c35',p.x-p.w+k*p.w/8,p.y+(174+j*18)*p.s,p.w/8+1,18*p.s);
      } else if(obj.player) {
        const shake=Math.sin(r.elapsed*87)*r.impact*7,x=p.x+r.x*p.w+shake;
        this.ellipse(r.boostRemaining>0?'#61eaff99':'#293d4040',x,p.y-2,r.boostRemaining>0?58:42,11);
        if(r.boostRemaining>0){this.line('#a3f8ff',5,x-34,p.y+20,x-28,p.y-90);this.line('#a3f8ff',5,x+34,p.y+20,x+28,p.y-90);}
        this.art.rider(x,p.y,1,r.steer,r.attackTime,r.attackKind,r.attackSide,r.elapsed,0,r.fallen>0,r.invincible>0&&Math.floor(r.invincible*12)%2===0);
      } else {
        const b=r.riders[obj.rider!],x=p.x+b.x*p.w;
        this.ellipse('#293d4040',x,p.y,42*p.s*1.8,11*p.s*1.8);
        this.art.rider(x,p.y,p.s*1.8,b.steer ?? 0,b.attackTime ?? 0,'punch',b.attackSide ?? 1,r.elapsed,b.id%3+1,b.fallen>0,b.hitFlash>0,riderVisibility(b.distance-r.distance));
      }
    }
    this.art.end();
    const player=this.project(24,r);
    if(r.impact>.1) {
      const x=player.x+r.x*player.w+r.attackSide*65;
      for(let i=0;i<7;i++) {const a=i*Math.PI*2/7; this.line('#ffeab1',3,x+Math.cos(a)*22,player.y+72+Math.sin(a)*22,x+Math.cos(a)*40,player.y+72+Math.sin(a)*40);}
    }
    if(Math.abs(r.x)>1.04) for(let i=0;i<6;i++) this.ellipse('#e5d9b688',player.x+r.x*player.w+Math.sin(i*4+r.elapsed*14)*23,player.y-10-i*13,8+i*2,5+i);
  }
}
