export type DriftParticle={x:number;y:number;vx:number;vy:number;life:number;max:number;size:number;kind:'fire'|'smoke'|'spark'|'trail'|'boost'};
export class DriftParticles {
 readonly items:DriftParticle[]=[];
 private add(x:number,y:number,vx:number,vy:number,life:number,size:number,kind:DriftParticle['kind']):void{if(this.items.length>=160)this.items.shift();this.items.push({x,y,vx,vy,life,max:life,size,kind});}
 crash(x:number,y:number):void {
  for(let i=0;i<48;i++){const a=Math.random()*Math.PI*2,speed=90+Math.random()*460,kind=i<14?'fire':i<30?'spark':'smoke';this.add(x,y,Math.cos(a)*speed,Math.sin(a)*speed,kind==='fire'?.22:kind==='smoke'?.8:.5,kind==='fire'?35+Math.random()*25:kind==='smoke'?28:5,kind);}
 }
 trail(x:number,y:number,heading:number,boost:boolean):void{const side=boost?0:(Math.random()<.5?-32:32);this.add(x-Math.sin(heading)*68+Math.cos(heading)*side,y-Math.cos(heading)*68-Math.sin(heading)*side,-Math.sin(heading)*70,-Math.cos(heading)*70,.4,boost?14:8,boost?'boost':'trail');}
 update(dt:number):void{for(let i=this.items.length-1;i>=0;i--){const p=this.items[i];p.life-=dt;if(p.life<=0){this.items.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.exp(-dt*3);p.vy*=Math.exp(-dt*3);}}
 reset():void{this.items.length=0;}
}
