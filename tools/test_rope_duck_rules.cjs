const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/scripts/ropeDuckRules.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:out});
const {RopeDuckRound,ROPE_LENGTH,ROPE_MAX_LENGTH,CHARGE_SECONDS,RopeDuckCord}=out;
function advance(r,t){for(let i=0;i<Math.ceil(t*120);i++)r.tick(1/120)}
for(const leader of [0,1])for(const depth of [160,240,300]){
 const rescue=new RopeDuckRound(),ledge=rescue.platforms[1],follower=1-leader;
 Object.assign(rescue.ducks[leader],{x:ledge.start+90,y:ledge.y,vx:0,vy:0,grounded:true});
 Object.assign(rescue.ducks[follower],{x:ledge.start-14,y:ledge.y-depth,vx:0,vy:0,grounded:false});rescue.selected=leader;
 const plantedX=rescue.ducks[leader].x;advance(rescue,2);
 assert.equal(rescue.phase,'playing');assert(Math.abs(rescue.ducks[leader].x-plantedX)<.01,'hanging rear partner cannot drag the planted front duck backwards');
 assert(!rescue.ducks[follower].grounded,'waiting alone does not automatically teleport the hanging partner to safety');
 assert(rescue.beginCharge());advance(rescue,.2);assert(rescue.release());
 let recovered=false;
 for(let t=0;t<240&&rescue.phase==='playing';t++){
  rescue.tick(1/120);const d=rescue.ducks[follower];
  assert(Math.hypot(rescue.ducks[0].x-rescue.ducks[1].x,rescue.ducks[0].y-rescue.ducks[1].y)<=ROPE_MAX_LENGTH+1,'rescue respects rope length');
  if(d.grounded&&d.x>=ledge.start&&d.y>=ledge.y-1){recovered=true;break;}
 }
 assert(recovered,`full jump must pull hanging duck ${follower} back onto the ledge (depth ${depth})`);
}
const drag=new RopeDuckRound();drag.beginCharge();advance(drag,.2);drag.release();advance(drag,1);
assert(drag.ducks[1].x>221&&drag.ducks[1].x<230,'a full jump gives the grounded partner only a small visible tug');
const landing=new RopeDuckRound();landing.beginCharge();advance(landing,.2);landing.release();
for(let i=0;i<180&&!landing.ducks[0].grounded;i++)landing.tick(1/120);
assert(landing.ducks[0].grounded);const landedX=landing.ducks[0].x;advance(landing,.5);
assert(Math.abs(landing.ducks[0].x-landedX)<8,'landing quickly settles rather than sliding another body length');
const lift=new RopeDuckRound();Object.assign(lift.ducks[0],{x:220,y:300,grounded:false});lift.tick(1/120);
assert(!lift.ducks[1].grounded&&lift.ducks[1].y>0,'upward tension can lift the grounded partner');
const friction=new RopeDuckRound();friction.ducks.forEach(d=>d.vx=100);advance(friction,1);assert(friction.ducks.every(d=>Math.abs(d.vx)<1),'ground friction settles sliding ducks');
const spring=new RopeDuckRound();spring.ducks.forEach((d,i)=>Object.assign(d,{x:130+i*260,y:600,vx:0,vy:0,grounded:false}));
spring.tick(1/120);
assert(spring.ducks[1].x-spring.ducks[0].x>ROPE_LENGTH+20,'stretch is gradual rather than snapped to rest length');
assert(spring.ducks[0].vx>0&&spring.ducks[1].vx<0,'tension pulls both flying ducks inward');
assert(Math.abs(spring.ducks[0].vx+spring.ducks[1].vx)<1e-6,'spring has equal opposite impulses');
advance(spring,.15);assert(spring.ducks[1].x-spring.ducks[0].x<250,'spring recoils after extension');
const cord=new RopeDuckCord(),a={x:0,y:100},b={x:90,y:100};cord.reset(a,b);
for(let i=0;i<120;i++)cord.tick(1/120,a,b);
assert(cord.points.some(p=>p.y<80),'loose rope sags under its own weight');
const beforeCord=JSON.stringify(cord.points);cord.tick(0,a,b);assert.equal(JSON.stringify(cord.points),beforeCord,'zero time does not move the visual rope');
for(let i=0;i<240;i++){b.x=90+180*Math.sin(i/40);b.y=100+80*Math.sin(i/23);cord.tick(1/120,a,b);assert.equal(cord.points.length,13);assert(cord.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));assert.equal(cord.points[0].x,a.x);assert.equal(cord.points[12].x,b.x);}
const settled=new RopeDuckCord(),pa={x:0,y:22},pb={x:90,y:22};settled.reset(pa,pb);
for(let i=0;i<2400;i++)settled.tick(i%2?.016:.025,pa,pb,21);
const resting=settled.points.map(p=>({...p}));for(let i=0;i<120;i++)settled.tick(1/120,pa,pb,21);
assert(settled.points.every((p,i)=>Math.hypot(p.x-resting[i].x,p.y-resting[i].y)<.1),'rope damping settles instead of buzzing under variable frame times');
assert.equal(CHARGE_SECONDS,.2,'full charge takes 200ms');
const full=new RopeDuckRound();full.beginCharge();advance(full,.2);full.release();assert(Math.abs(full.ducks[0].vx-440)<1e-6);assert(Math.abs(full.ducks[0].vy-890)<1e-6);
const rapid=new RopeDuckRound();
for(let i=0;i<8;i++){
 assert(rapid.beginCharge(),'a grounded duck responds immediately to each new tap');
 const index=rapid.selected;assert(rapid.release(),'same-frame down/up makes a short jump');
 assert.equal(rapid.ducks[index].vx,170);assert.equal(rapid.ducks[index].vy,410);
 advance(rapid,.5);
}
const short=new RopeDuckRound(),long=new RopeDuckRound();
assert(short.beginCharge());assert(!short.beginCharge());advance(short,.05);assert(short.release());assert.equal(short.selected,1);assert(!short.release());
assert(long.beginCharge());advance(long,.85);long.release();assert(long.ducks[0].vy>short.ducks[0].vy);assert(long.ducks[0].vx>short.ducks[0].vx);
const idle=new RopeDuckRound();advance(idle,2);assert.equal(idle.phase,'playing');assert.equal(idle.distance,0);idle.beginCharge();idle.cancelCharge();assert(!idle.release());
const airborne=new RopeDuckRound();airborne.beginCharge();advance(airborne,.8);airborne.release();assert(airborne.beginCharge());airborne.release();assert(!airborne.beginCharge(),'cannot charge a flying duck');
for(let i=0;i<240;i++){long.tick(1/120);const [a,b]=long.ducks;assert(Math.hypot(a.x-b.x,a.y-b.y)<=ROPE_MAX_LENGTH+1,'elastic rope remains bounded');}
assert(long.ducks.some(d=>d.grounded),'jump returns to ground');
const fall=new RopeDuckRound();fall.ducks.forEach(d=>{d.x=900;d.y=-500;d.grounded=false;d.vy=-100});fall.tick(.02);assert.equal(fall.phase,'failure');assert(!fall.beginCharge());const oldDistance=fall.distance;assert(fall.revive());assert.equal(fall.phase,'playing');assert(fall.ducks.every(d=>d.grounded));assert.equal(fall.distance,oldDistance);assert(fall.invulnerable>0);
const spikes=new RopeDuckRound();spikes.platforms[0].spikeX=130;spikes.tick(.02);assert.equal(spikes.phase,'failure');
const terrain=new RopeDuckRound(),same=new RopeDuckRound();assert.equal(JSON.stringify(terrain.platforms),JSON.stringify(same.platforms));
for(let k=0;k<100;k++){
 terrain.ducks.forEach((d,i)=>{d.x=k*180+130+i*80;d.y=600;d.vy=0;d.grounded=false});terrain.invulnerable=1;terrain.tick(.02);
 assert(terrain.platforms.length<14,'terrain storage is bounded');
 for(let i=1;i<terrain.platforms.length;i++){const a=terrain.platforms[i-1],b=terrain.platforms[i];if(b.id===a.id+1)assert(b.start-a.end<=170,'gaps remain within rope reach');}
}
const hanging=new RopeDuckRound();hanging.ducks[0].x=540;hanging.ducks[1].x=650;hanging.ducks[1].y=-210;hanging.ducks[1].grounded=false;hanging.selected=1;
advance(hanging,.2);assert.equal(hanging.phase,'playing','a dangling partner can be rescued before it pulls the other duck off the ledge');
assert.equal(hanging.selected,0,'arrow switches to the grounded duck');assert(hanging.beginCharge());advance(hanging,.2);assert(hanging.release());assert(hanging.ducks[0].vy>0,'grounded duck can jump again while partner hangs');
const fallback=new RopeDuckRound();fallback.selected=1;fallback.ducks[1].grounded=false;fallback.ducks[1].y=-80;
assert(fallback.beginCharge());assert.equal(fallback.selected,0,'touch also resolves grounded duck before the next update');
const shape=platforms=>JSON.stringify(platforms.map(({energyTaken,...geometry})=>geometry));
const recycled=new RopeDuckRound(),originalPath=shape(recycled.platforms);
for(let t=0;t<120*120&&recycled.phase==='playing'&&recycled.distance<160;t++){
 if(!recycled.charging)recycled.beginCharge();else if(recycled.charge>=.18-1e-6)recycled.release();
 recycled.tick(1/120);recycled.drainEvents();
}
assert(recycled.distance>=150,'exercise actual jumps through recycled terrain');
recycled.ducks.forEach(d=>{d.y=-600;d.grounded=false});recycled.tick(.02);assert.equal(recycled.phase,'failure');
assert(recycled.revive());
for(let i=1;i<recycled.platforms.length;i++)assert(recycled.platforms[i].start-recycled.platforms[i-1].end<=170,'revive restores every recycled platform ahead of its checkpoint');
assert.equal(shape(recycled.platforms),originalPath,'revival restores the same deterministic route without resetting collected energy');
const pickup=new RopeDuckRound();pickup.platforms[0].energyX=130;pickup.platforms[0].energyTaken=false;pickup.ducks[0].y=90;pickup.tick(.02);assert.equal(pickup.energy,1);pickup.tick(.02);assert.equal(pickup.energy,1,'pickup only once');
console.log('PASS charge/cancel/alternate, rope constraints, landing, falls/spikes, revival, energy and bounded reachable terrain');
